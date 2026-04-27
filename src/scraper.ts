import type { ArchivedPage } from "./types";

const FETCH_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function fetchViaProxy(url: string): Promise<string> {
  const encoded = encodeURIComponent(url);
  const endpoints = [
    `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`,
    `https://api.allorigins.win/raw?url=${encoded}`,
    `https://cors.isomorphic-git.org/${url}`,
  ];

  let lastError = "";
  for (const endpoint of endpoints) {
    try {
      const res = await withTimeout(fetch(endpoint), FETCH_TIMEOUT_MS);
      if (!res.ok) {
        lastError = `${res.status} ${res.statusText}`;
        continue;
      }
      const text = await res.text();
      if (text.trim().length < 30) {
        lastError = "bos yanit";
        continue;
      }
      return text;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "fetch error";
    }
  }

  throw new Error(lastError || "Proxy ile icerik alinamadi");
}

function normalizeUrl(baseUrl: string, href: string): string | null {
  try {
    const resolved = new URL(href, baseUrl);
    if (!["http:", "https:"].includes(resolved.protocol)) return null;
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return null;
  }
}

function toAbsoluteUnique(urls: string[]): string[] {
  return Array.from(new Set(urls.filter(Boolean)));
}

export async function scrapePage(pageUrl: string): Promise<ArchivedPage> {
  const fallback: ArchivedPage = {
    id: crypto.randomUUID(),
    url: pageUrl,
    title: pageUrl,
    html: "",
    text: "",
    links: [],
    images: [],
    size: 0,
    status: "error",
    archivedAt: new Date().toISOString(),
    errorMsg: "Sayfa alinamadi",
  };

  try {
    const html = await fetchViaProxy(pageUrl);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const links = toAbsoluteUnique(
      Array.from(doc.querySelectorAll("a[href]"))
        .map((anchor) => normalizeUrl(pageUrl, anchor.getAttribute("href") ?? ""))
        .filter((url): url is string => Boolean(url))
    );

    const images = toAbsoluteUnique(
      Array.from(doc.querySelectorAll("img[src]"))
        .map((img) => normalizeUrl(pageUrl, img.getAttribute("src") ?? ""))
        .filter((url): url is string => Boolean(url))
    );

    const favicon =
      normalizeUrl(pageUrl, doc.querySelector("link[rel*='icon']")?.getAttribute("href") ?? "") ??
      `${new URL(pageUrl).origin}/favicon.ico`;

    const title = (doc.querySelector("title")?.textContent ?? "").trim() || pageUrl;
    const text = (doc.body?.textContent ?? "").replace(/\s+/g, " ").trim();

    return {
      id: crypto.randomUUID(),
      url: pageUrl,
      title,
      html,
      text,
      links,
      images,
      size: new TextEncoder().encode(html).length,
      status: "success",
      archivedAt: new Date().toISOString(),
      favicon,
    };
  } catch (error) {
    return {
      ...fallback,
      errorMsg: error instanceof Error ? error.message : "Bilinmeyen hata",
    };
  }
}

export async function discoverSitemapLinks(rootUrl: string, maxLinks: number): Promise<string[]> {
  const links = new Set<string>();
  const root = new URL(rootUrl);
  const candidates = [
    new URL("/sitemap.xml", root).toString(),
    new URL("/sitemap_index.xml", root).toString(),
    new URL("/robots.txt", root).toString(),
  ];

  for (const candidate of candidates) {
    if (links.size >= maxLinks) break;
    try {
      const body = await fetchViaProxy(candidate);
      const discovered = Array.from(body.matchAll(/https?:\/\/[^\s<>"]+/g)).map((m) => m[0]);
      for (const url of discovered) {
        if (links.size >= maxLinks) break;
        try {
          const parsed = new URL(url);
          if (parsed.hostname !== root.hostname) continue;
          parsed.hash = "";
          links.add(parsed.toString());
        } catch {
          // Ignore invalid urls.
        }
      }
    } catch {
      // Ignore missing or blocked sitemap endpoints.
    }
  }

  return Array.from(links);
}