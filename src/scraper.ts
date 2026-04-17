import type { ArchivedPage } from "./types";

interface ProxyAdapter {
  name: string;
  toUrl: (targetUrl: string) => string;
  parseResponse: (res: Response) => Promise<string>;
}

const PROXIES: ProxyAdapter[] = [
  {
    name: "allorigins",
    toUrl: (url: string) =>
      `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    parseResponse: async (res) => {
      const json = await res.json();
      if (json?.contents) return json.contents as string;
      throw new Error("allorigins: empty contents");
    },
  },
  {
    name: "codetabs",
    toUrl: (url: string) =>
      `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    parseResponse: (res) => res.text(),
  },
  {
    name: "corsproxy",
    toUrl: (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    parseResponse: (res) => res.text(),
  },
];

const RAW_PROXIES: Array<(targetUrl: string) => string> = [
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

const MAX_INLINE_ASSET_COUNT = 40;
const MAX_INLINE_IMAGE_BYTES = 3_000_000;
const MAX_INLINE_GIF_BYTES = 10_000_000;

function looksLikeHtml(content: string): boolean {
  const sample = content.slice(0, 800).toLowerCase();
  return (
    sample.includes("<html") ||
    sample.includes("<!doctype html") ||
    sample.includes("<head") ||
    sample.includes("<body") ||
    sample.includes("<title")
  );
}

function sanitizeFetchError(message: string): string {
  if (!message) return "Unknown network error";
  if (message.toLowerCase().includes("failed to fetch")) {
    return "Network/CORS error";
  }
  return message;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function getUrlExtension(url: string): string {
  const cleanUrl = url.split("?")[0]?.split("#")[0] ?? "";
  const lastDotIndex = cleanUrl.lastIndexOf(".");
  if (lastDotIndex < 0) return "";
  return cleanUrl.slice(lastDotIndex + 1).toLowerCase();
}

function isLikelyImageAsset(url: string, contentType: string): boolean {
  if (contentType.startsWith("image/")) return true;
  const ext = getUrlExtension(url);
  return ["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "bmp"].includes(ext);
}

function isGifAsset(url: string, contentType: string): boolean {
  if (contentType.toLowerCase().includes("image/gif")) return true;
  return getUrlExtension(url) === "gif";
}

function shouldInlineAsset(url: string, contentType: string, byteLength: number): boolean {
  if (!isLikelyImageAsset(url, contentType)) return false;
  if (isGifAsset(url, contentType)) {
    return byteLength <= MAX_INLINE_GIF_BYTES;
  }
  return byteLength <= MAX_INLINE_IMAGE_BYTES;
}

function extractUrlsFromSrcset(srcset: string, baseUrl: string): string[] {
  const candidates = srcset
    .split(",")
    .map((chunk) => chunk.trim().split(/\s+/)[0])
    .filter(Boolean);

  const resolved: string[] = [];
  for (const candidate of candidates) {
    try {
      resolved.push(new URL(candidate, baseUrl).toString());
    } catch {
      // Ignore broken srcset candidates.
    }
  }
  return resolved;
}

function extractCssUrls(cssText: string): string[] {
  const urls: string[] = [];
  const regex = /url\(([^)]+)\)/gi;
  let match: RegExpExecArray | null = regex.exec(cssText);
  while (match) {
    const raw = match[1]?.trim().replace(/^['"]|['"]$/g, "");
    if (raw && !raw.startsWith("data:") && !raw.startsWith("blob:")) {
      urls.push(raw);
    }
    match = regex.exec(cssText);
  }
  return urls;
}

function replaceAllLiteral(input: string, search: string, replacement: string): string {
  if (!search) return input;
  return input.split(search).join(replacement);
}

async function inlineCssAssetUrls(
  cssText: string,
  baseUrl: string,
  cache: Map<string, string>,
  inlineState: { count: number }
): Promise<string> {
  const urls = extractCssUrls(cssText);
  let nextCss = cssText;

  for (const urlCandidate of urls) {
    let absoluteUrl = "";
    try {
      absoluteUrl = new URL(urlCandidate, baseUrl).toString();
    } catch {
      continue;
    }

    if (cache.has(absoluteUrl)) {
      const cached = cache.get(absoluteUrl) as string;
      nextCss = replaceAllLiteral(nextCss, urlCandidate, cached);
      continue;
    }

    if (inlineState.count >= MAX_INLINE_ASSET_COUNT) continue;

    try {
      const { buffer, contentType } = await fetchBinaryViaProxy(absoluteUrl);
      if (!shouldInlineAsset(absoluteUrl, contentType, buffer.byteLength)) continue;
      const base64 = arrayBufferToBase64(buffer);
      const dataUrl = `data:${contentType};base64,${base64}`;
      cache.set(absoluteUrl, dataUrl);
      nextCss = replaceAllLiteral(nextCss, urlCandidate, dataUrl);
      inlineState.count += 1;
    } catch {
      // Keep original CSS URL when fetch fails.
    }
  }

  return nextCss;
}

function getImageCandidates(el: Element, baseUrl: string): string[] {
  const candidates: string[] = [];
  const srcLikeAttrs = ["src", "data-src", "data-original", "data-lazy-src"];
  for (const attr of srcLikeAttrs) {
    const value = el.getAttribute(attr);
    if (!value) continue;
    try {
      candidates.push(new URL(value, baseUrl).toString());
    } catch {
      // Ignore invalid candidate.
    }
  }

  const srcset = el.getAttribute("srcset") || el.getAttribute("data-srcset");
  if (srcset) {
    candidates.push(...extractUrlsFromSrcset(srcset, baseUrl));
  }

  return Array.from(new Set(candidates));
}

export async function fetchBinaryViaProxy(
  url: string
): Promise<{ buffer: ArrayBuffer; contentType: string }> {
  let lastError: Error | null = null;

  for (const proxy of RAW_PROXIES) {
    try {
      const proxiedUrl = proxy(url);
      const res = await fetch(proxiedUrl, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buffer = await res.arrayBuffer();
      const contentType = res.headers.get("content-type") || "application/octet-stream";
      return { buffer, contentType };
    } catch (e) {
      lastError = e as Error;
    }
  }

  throw lastError ?? new Error("Asset proxy failed");
}

async function inlineImageAssets(html: string, baseUrl: string): Promise<string> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const styleLinks = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href]'));
  const imageElements = Array.from(doc.querySelectorAll("img, source"));
  const inlineStyleElements = Array.from(doc.querySelectorAll<HTMLElement>("[style*='url(']"));
  const cache = new Map<string, string>();
  const inlineState = { count: 0 };

  for (const linkEl of styleLinks) {
    const href = linkEl.getAttribute("href");
    if (!href) continue;
    try {
      const absoluteHref = new URL(href, baseUrl).toString();
      const cssText = await fetchViaProxy(absoluteHref, false);
      const cssWithInlinedAssets = await inlineCssAssetUrls(
        cssText,
        absoluteHref,
        cache,
        inlineState
      );
      const styleEl = doc.createElement("style");
      styleEl.textContent = cssWithInlinedAssets;
      linkEl.replaceWith(styleEl);
    } catch {
      // Keep original stylesheet link if fetch fails.
    }
  }

  const inlineStyleTags = Array.from(doc.querySelectorAll("style"));
  for (const styleEl of inlineStyleTags) {
    const cssText = styleEl.textContent;
    if (!cssText) continue;
    styleEl.textContent = await inlineCssAssetUrls(cssText, baseUrl, cache, inlineState);
  }

  for (const styledEl of inlineStyleElements) {
    const styleValue = styledEl.getAttribute("style");
    if (!styleValue) continue;
    const updated = await inlineCssAssetUrls(styleValue, baseUrl, cache, inlineState);
    styledEl.setAttribute("style", updated);
  }

  for (const imageElement of imageElements) {
    const candidates = getImageCandidates(imageElement, baseUrl);
    if (candidates.length === 0) continue;

    for (const absoluteSrc of candidates) {
      if (absoluteSrc.startsWith("data:")) continue;

      if (cache.has(absoluteSrc)) {
        const cachedDataUrl = cache.get(absoluteSrc) as string;
        if (imageElement.hasAttribute("src")) imageElement.setAttribute("src", cachedDataUrl);
        if (imageElement.hasAttribute("data-src")) {
          imageElement.setAttribute("data-src", cachedDataUrl);
        }
        if (imageElement.hasAttribute("srcset")) {
          imageElement.setAttribute("srcset", cachedDataUrl);
        }
        if (imageElement.hasAttribute("data-srcset")) {
          imageElement.setAttribute("data-srcset", cachedDataUrl);
        }
        break;
      }

      if (inlineState.count >= MAX_INLINE_ASSET_COUNT) break;

      try {
        const { buffer, contentType } = await fetchBinaryViaProxy(absoluteSrc);
        if (!shouldInlineAsset(absoluteSrc, contentType, buffer.byteLength)) continue;

        const base64 = arrayBufferToBase64(buffer);
        const dataUrl = `data:${contentType};base64,${base64}`;
        cache.set(absoluteSrc, dataUrl);
        inlineState.count += 1;

        if (imageElement.hasAttribute("src")) imageElement.setAttribute("src", dataUrl);
        if (imageElement.hasAttribute("data-src")) imageElement.setAttribute("data-src", dataUrl);
        if (imageElement.hasAttribute("srcset")) imageElement.setAttribute("srcset", dataUrl);
        if (imageElement.hasAttribute("data-srcset")) {
          imageElement.setAttribute("data-srcset", dataUrl);
        }
        break;
      } catch {
        // Skip failed assets and keep original URL in snapshot.
      }
    }
  }

  // Snapshot should be static and self-contained as much as possible.
  doc.querySelectorAll("script").forEach((el) => el.remove());

  return doc.documentElement.outerHTML;
}

export async function fetchViaProxy(url: string, expectHtml = true): Promise<string> {
  const failures: string[] = [];

  for (const proxy of PROXIES) {
    try {
      const proxyUrl = proxy.toUrl(url);
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const content = await proxy.parseResponse(res);
      if (!content.trim()) {
        throw new Error("Empty response body");
      }

      if (expectHtml && !looksLikeHtml(content)) {
        throw new Error("Non-HTML response");
      }

      return content;
    } catch (e) {
      failures.push(`${proxy.name}: ${sanitizeFetchError((e as Error).message)}`);
    }
  }

  throw new Error(`Tum proxy denemeleri basarisiz oldu. ${failures.join(" | ")}`);
}

function extractLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const anchors = Array.from(doc.querySelectorAll("a[href]"));
  const seen = new Set<string>();
  const links: string[] = [];

  for (const a of anchors) {
    const href = a.getAttribute("href");
    if (!href) continue;

    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.hostname !== base.hostname) continue;
      if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
        continue;
      }

      resolved.hash = "";
      const clean = resolved.toString();
      if (!seen.has(clean)) {
        seen.add(clean);
        links.push(clean);
      }
    } catch {
      // Ignore invalid href values.
    }
  }

  return links;
}

function extractImages(html: string, baseUrl: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const seen = new Set<string>();
  const images: string[] = [];

  const pushImageUrl = (candidate: string) => {
    try {
      const resolved = new URL(candidate, baseUrl).toString();
      if (!seen.has(resolved)) {
        seen.add(resolved);
        images.push(resolved);
      }
    } catch {
      // Ignore broken URLs.
    }
  };

  const imageLikeElements = Array.from(doc.querySelectorAll("img, source"));
  for (const el of imageLikeElements) {
    for (const candidate of getImageCandidates(el, baseUrl)) {
      pushImageUrl(candidate);
    }
  }

  const styledElements = Array.from(doc.querySelectorAll<HTMLElement>("[style*='url(']"));
  for (const styledEl of styledElements) {
    const styleValue = styledEl.getAttribute("style") || "";
    for (const cssUrl of extractCssUrls(styleValue)) {
      pushImageUrl(cssUrl);
    }
  }

  const styleTags = Array.from(doc.querySelectorAll("style"));
  for (const styleTag of styleTags) {
    const cssText = styleTag.textContent || "";
    for (const cssUrl of extractCssUrls(cssText)) {
      pushImageUrl(cssUrl);
    }
  }

  return images;
}

function extractMeta(
  html: string,
  url: string
): { title: string; description: string; favicon: string } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const title =
    doc.querySelector("title")?.textContent?.trim() ||
    doc.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
    new URL(url).hostname;

  const description =
    doc.querySelector('meta[name="description"]')?.getAttribute("content") ||
    doc
      .querySelector('meta[property="og:description"]')
      ?.getAttribute("content") ||
    "";

  const faviconEl =
    doc.querySelector('link[rel="icon"]') ||
    doc.querySelector('link[rel="shortcut icon"]') ||
    doc.querySelector('link[rel="apple-touch-icon"]');

  let favicon = "";
  if (faviconEl) {
    const href = faviconEl.getAttribute("href");
    if (href) {
      try {
        favicon = new URL(href, url).toString();
      } catch {
        favicon = "";
      }
    }
  }

  if (!favicon) {
    const base = new URL(url);
    favicon = `${base.protocol}//${base.hostname}/favicon.ico`;
  }

  return { title, description, favicon };
}

function extractText(html: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  doc.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
  return doc.body?.innerText?.trim() ?? "";
}

export async function scrapePage(url: string): Promise<ArchivedPage> {
  const id = crypto.randomUUID();

  try {
    const rawHtml = await fetchViaProxy(url);
    const { title, description, favicon } = extractMeta(rawHtml, url);
    const links = extractLinks(rawHtml, url);
    const images = extractImages(rawHtml, url);
    const text = extractText(rawHtml);
    const html = await inlineImageAssets(rawHtml, url);
    const size = new Blob([html]).size;

    return {
      id,
      url,
      title,
      description,
      favicon,
      html,
      text,
      links,
      images,
      archivedAt: new Date().toISOString(),
      size,
      status: "success",
    };
  } catch (e) {
    const err = e as Error;

    return {
      id,
      url,
      title: url,
      description: "",
      favicon: "",
      html: "",
      text: "",
      links: [],
      images: [],
      archivedAt: new Date().toISOString(),
      size: 0,
      status: "error",
      errorMsg: err.message,
    };
  }
}