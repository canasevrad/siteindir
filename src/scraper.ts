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

const MAX_IMAGE_INLINE_COUNT = 12;
const MAX_IMAGE_INLINE_BYTES = 1_500_000;

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

async function fetchRawAssetViaProxy(
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
  const imageElements = Array.from(doc.querySelectorAll("img[src]"));
  const cache = new Map<string, string>();
  let inlinedCount = 0;

  for (const linkEl of styleLinks) {
    const href = linkEl.getAttribute("href");
    if (!href) continue;
    try {
      const absoluteHref = new URL(href, baseUrl).toString();
      const cssText = await fetchViaProxy(absoluteHref, false);
      const styleEl = doc.createElement("style");
      styleEl.textContent = cssText;
      linkEl.replaceWith(styleEl);
    } catch {
      // Keep original stylesheet link if fetch fails.
    }
  }

  for (const imageElement of imageElements) {
    const src = imageElement.getAttribute("src");
    if (!src) continue;

    let absoluteSrc = "";
    try {
      absoluteSrc = new URL(src, baseUrl).toString();
    } catch {
      continue;
    }

    if (absoluteSrc.startsWith("data:")) continue;

    if (cache.has(absoluteSrc)) {
      imageElement.setAttribute("src", cache.get(absoluteSrc) as string);
      continue;
    }

    if (inlinedCount >= MAX_IMAGE_INLINE_COUNT) continue;

    try {
      const { buffer, contentType } = await fetchRawAssetViaProxy(absoluteSrc);
      if (buffer.byteLength > MAX_IMAGE_INLINE_BYTES) continue;
      const base64 = arrayBufferToBase64(buffer);
      const dataUrl = `data:${contentType};base64,${base64}`;
      imageElement.setAttribute("src", dataUrl);
      cache.set(absoluteSrc, dataUrl);
      inlinedCount += 1;
    } catch {
      // Skip failed assets and keep original URL in snapshot.
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

  const imgs = Array.from(doc.querySelectorAll("img[src]"));
  const seen = new Set<string>();
  const images: string[] = [];

  for (const img of imgs) {
    const src = img.getAttribute("src");
    if (!src) continue;

    try {
      const resolved = new URL(src, baseUrl).toString();
      if (!seen.has(resolved)) {
        seen.add(resolved);
        images.push(resolved);
      }
    } catch {
      // Ignore broken src values.
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