import type { ArchivedPage } from "./types";

const PROXIES = [
  (url: string) =>
    `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

export async function fetchViaProxy(url: string): Promise<string> {
  let lastError: Error | null = null;

  for (const proxyFn of PROXIES) {
    try {
      const proxyUrl = proxyFn(url);
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (proxyUrl.includes("allorigins")) {
        const json = await res.json();
        if (json && json.contents) return json.contents as string;
        throw new Error("allorigins: empty contents");
      }

      return await res.text();
    } catch (e) {
      lastError = e as Error;
    }
  }

  throw lastError ?? new Error("All proxies failed");
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
    const html = await fetchViaProxy(url);
    const { title, description, favicon } = extractMeta(html, url);
    const links = extractLinks(html, url);
    const images = extractImages(html, url);
    const text = extractText(html);
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