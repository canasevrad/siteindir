import { createClient } from "@supabase/supabase-js";
import type { ArchiveJob, ArchivedPage } from "./types";
import { fetchBinaryViaProxy } from "./scraper";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const bucketName =
  (import.meta.env.VITE_SUPABASE_BUCKET as string | undefined) || "archives";
const objectPrefix =
  (import.meta.env.VITE_SUPABASE_PREFIX as string | undefined) || "webarshiv";

const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

const ASSET_PLACEHOLDER_PREFIX = "webarshiv-asset://";
const MAX_CLOUD_ASSET_BYTES = 15_000_000;
const MAX_CLOUD_ASSETS_PER_PAGE = 160;

export interface CloudUploadProgress {
  percent: number;
  stage: "preparing" | "uploading" | "done";
  doneAssets: number;
  totalAssets: number;
  donePages: number;
  totalPages: number;
}

function buildJobObjectPath(jobId: string): string {
  return `${objectPrefix}/jobs/${jobId}.json`;
}

function buildLegacyJobPath(jobId: string): string {
  return `${objectPrefix}/${jobId}.json`;
}

function buildAssetObjectPath(jobId: string, token: string, ext: string): string {
  return `${objectPrefix}/assets/${jobId}/${token}.${ext}`;
}

function deepCloneJob(job: ArchiveJob): ArchiveJob {
  return JSON.parse(JSON.stringify(job)) as ArchiveJob;
}

function toSafeExt(contentType: string, url: string): string {
  const byType = contentType.toLowerCase();
  if (byType.includes("image/jpeg")) return "jpg";
  if (byType.includes("image/png")) return "png";
  if (byType.includes("image/gif")) return "gif";
  if (byType.includes("image/webp")) return "webp";
  if (byType.includes("image/avif")) return "avif";
  if (byType.includes("image/svg")) return "svg";
  if (byType.includes("font/woff2")) return "woff2";
  if (byType.includes("font/woff")) return "woff";
  if (byType.includes("text/css")) return "css";

  const cleanUrl = url.split("?")[0]?.split("#")[0] ?? "";
  const dotIndex = cleanUrl.lastIndexOf(".");
  if (dotIndex > 0 && dotIndex < cleanUrl.length - 1) {
    const ext = cleanUrl.slice(dotIndex + 1).toLowerCase();
    if (/^[a-z0-9]{1,8}$/.test(ext)) return ext;
  }
  return "bin";
}

function replaceLiteral(input: string, search: string, replacement: string): string {
  if (!search) return input;
  return input.split(search).join(replacement);
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

function parseSrcset(srcset: string): Array<{ url: string; descriptor: string }> {
  return srcset
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [url, ...rest] = part.split(/\s+/);
      return {
        url,
        descriptor: rest.join(" "),
      };
    })
    .filter((item) => Boolean(item.url));
}

function createPlaceholder(token: string): string {
  return `${ASSET_PLACEHOLDER_PREFIX}${token}`;
}

function isFileItem(item: { metadata?: unknown; id?: string | null }): boolean {
  return Boolean(item.metadata) || Boolean(item.id);
}

async function uploadArchivedAsset(
  jobId: string,
  url: string,
  token: string
): Promise<{ path: string; token: string } | null> {
  if (!supabase) return null;

  try {
    const { buffer, contentType } = await fetchBinaryViaProxy(url);
    if (buffer.byteLength <= 0 || buffer.byteLength > MAX_CLOUD_ASSET_BYTES) {
      return null;
    }

    const ext = toSafeExt(contentType, url);
    const path = buildAssetObjectPath(jobId, token, ext);

    const { error } = await supabase.storage.from(bucketName).upload(path, buffer, {
      contentType,
      upsert: true,
    });

    if (error) return null;

    return { path, token };
  } catch {
    return null;
  }
}

async function rewriteCssWithCloudAssets(
  cssText: string,
  baseUrl: string,
  jobId: string,
  state: { count: number; nextId: number },
  urlCache: Map<string, { token: string; path: string }>,
  assetMap: Record<string, string>
): Promise<string> {
  let nextCss = cssText;
  const rawUrls = extractCssUrls(cssText);

  for (const rawUrl of rawUrls) {
    let absoluteUrl = "";
    try {
      absoluteUrl = new URL(rawUrl, baseUrl).toString();
    } catch {
      continue;
    }

    if (urlCache.has(absoluteUrl)) {
      const cached = urlCache.get(absoluteUrl) as { token: string; path: string };
      nextCss = replaceLiteral(nextCss, rawUrl, createPlaceholder(cached.token));
      continue;
    }

    if (state.count >= MAX_CLOUD_ASSETS_PER_PAGE) continue;

    const token = `a${state.nextId}`;
    state.nextId += 1;
    const uploaded = await uploadArchivedAsset(jobId, absoluteUrl, token);
    if (!uploaded) continue;

    state.count += 1;
    urlCache.set(absoluteUrl, uploaded);
    assetMap[uploaded.token] = uploaded.path;
    nextCss = replaceLiteral(nextCss, rawUrl, createPlaceholder(uploaded.token));
  }

  return nextCss;
}

async function rewritePageWithCloudAssets(jobId: string, page: ArchivedPage): Promise<ArchivedPage> {
  if (page.status !== "success" || !page.html) return page;

  const parser = new DOMParser();
  const doc = parser.parseFromString(page.html, "text/html");
  const assetMap: Record<string, string> = {};
  const urlCache = new Map<string, { token: string; path: string }>();
  const state = { count: 0, nextId: 1 };

  const rewriteOneUrl = async (rawUrl: string, baseUrl: string): Promise<string> => {
    if (!rawUrl || rawUrl.startsWith("data:") || rawUrl.startsWith("blob:")) {
      return rawUrl;
    }

    let absoluteUrl = "";
    try {
      absoluteUrl = new URL(rawUrl, baseUrl).toString();
    } catch {
      return rawUrl;
    }

    if (urlCache.has(absoluteUrl)) {
      const cached = urlCache.get(absoluteUrl) as { token: string; path: string };
      return createPlaceholder(cached.token);
    }

    if (state.count >= MAX_CLOUD_ASSETS_PER_PAGE) {
      return rawUrl;
    }

    const token = `a${state.nextId}`;
    state.nextId += 1;
    const uploaded = await uploadArchivedAsset(jobId, absoluteUrl, token);
    if (!uploaded) {
      return rawUrl;
    }

    state.count += 1;
    urlCache.set(absoluteUrl, uploaded);
    assetMap[uploaded.token] = uploaded.path;
    return createPlaceholder(uploaded.token);
  };

  const srcAttrs = ["src", "data-src", "data-original", "data-lazy-src", "poster"];
  const nodes = Array.from(doc.querySelectorAll<HTMLElement>("img, source, video, audio"));
  for (const node of nodes) {
    for (const attr of srcAttrs) {
      const value = node.getAttribute(attr);
      if (!value) continue;
      const nextValue = await rewriteOneUrl(value, page.url);
      if (nextValue !== value) {
        node.setAttribute(attr, nextValue);
      }
    }

    const srcsetAttrs = ["srcset", "data-srcset"];
    for (const attr of srcsetAttrs) {
      const value = node.getAttribute(attr);
      if (!value) continue;
      const parts = parseSrcset(value);
      const rebuilt: string[] = [];
      for (const part of parts) {
        const replacedUrl = await rewriteOneUrl(part.url, page.url);
        rebuilt.push(part.descriptor ? `${replacedUrl} ${part.descriptor}` : replacedUrl);
      }
      node.setAttribute(attr, rebuilt.join(", "));
    }
  }

  const styleNodes = Array.from(doc.querySelectorAll("style"));
  for (const styleNode of styleNodes) {
    const cssText = styleNode.textContent ?? "";
    styleNode.textContent = await rewriteCssWithCloudAssets(
      cssText,
      page.url,
      jobId,
      state,
      urlCache,
      assetMap
    );
  }

  const inlineStyled = Array.from(doc.querySelectorAll<HTMLElement>("[style*='url(']"));
  for (const el of inlineStyled) {
    const styleValue = el.getAttribute("style") ?? "";
    const nextStyle = await rewriteCssWithCloudAssets(
      styleValue,
      page.url,
      jobId,
      state,
      urlCache,
      assetMap
    );
    el.setAttribute("style", nextStyle);
  }

  return {
    ...page,
    html: doc.documentElement.outerHTML,
    cloudAssetMap: Object.keys(assetMap).length > 0 ? assetMap : undefined,
  };
}

async function resolvePageSignedUrls(page: ArchivedPage): Promise<ArchivedPage> {
  if (!supabase || !page.cloudAssetMap || Object.keys(page.cloudAssetMap).length === 0) {
    return page;
  }

  const tokens = Object.keys(page.cloudAssetMap);
  const paths = tokens.map((token) => page.cloudAssetMap?.[token] ?? "").filter(Boolean);
  if (paths.length === 0) return page;

  const { data, error } = await supabase.storage.from(bucketName).createSignedUrls(paths, 60 * 60 * 24 * 7);
  if (error || !data) return page;

  const signedByPath = new Map<string, string>();
  for (const item of data) {
    if (item.path && item.signedUrl) {
      signedByPath.set(item.path, item.signedUrl);
    }
  }

  let nextHtml = page.html;
  for (const token of tokens) {
    const path = page.cloudAssetMap[token];
    const signedUrl = signedByPath.get(path);
    if (!signedUrl) continue;
    nextHtml = replaceLiteral(nextHtml, createPlaceholder(token), signedUrl);
  }

  return {
    ...page,
    html: nextHtml,
  };
}

export function isCloudConfigured(): boolean {
  return supabase !== null;
}

export async function uploadJobToCloud(
  job: ArchiveJob,
  onProgress?: (progress: CloudUploadProgress) => void
): Promise<{ path?: string; syncedAt?: string; error?: string }> {
  if (!supabase) return { error: "Supabase ayarlari eksik" };

  // Önce dosya zaten bulutta var mı kontrol et
  const existingPath = buildJobObjectPath(job.id);
  const { data: existingFile } = await supabase.storage.from(bucketName).info(existingPath);
  if (existingFile) {
    // Dosya zaten var, upload skip
    onProgress?.({
      percent: 100,
      stage: "done",
      doneAssets: 0,
      totalAssets: 0,
      donePages: job.pages.length,
      totalPages: job.pages.length,
    });
    return { path: existingPath, syncedAt: job.cloudSyncedAt || new Date().toISOString() };
  }

  const cloudJob = deepCloneJob(job);
  const totalPages = cloudJob.pages.length;
  onProgress?.({
    percent: 1,
    stage: "preparing",
    doneAssets: 0,
    totalAssets: 0,
    donePages: 0,
    totalPages,
  });

  const nextPages: ArchivedPage[] = [];
  for (let index = 0; index < cloudJob.pages.length; index += 1) {
    const page = cloudJob.pages[index];
    nextPages.push(await rewritePageWithCloudAssets(cloudJob.id, page));
    const donePages = index + 1;
    const percent = totalPages > 0 ? Math.min(96, Math.max(2, Math.round((donePages / totalPages) * 96))) : 96;
    onProgress?.({
      percent,
      stage: "preparing",
      doneAssets: 0,
      totalAssets: 0,
      donePages,
      totalPages,
    });
  }

  cloudJob.pages = nextPages;

  const path = buildJobObjectPath(cloudJob.id);
  const syncedAt = new Date().toISOString();
  cloudJob.cloudPath = path;
  cloudJob.cloudSyncedAt = syncedAt;
  const payload = JSON.stringify(cloudJob);
  onProgress?.({
    percent: 98,
    stage: "uploading",
    doneAssets: 0,
    totalAssets: 0,
    donePages: totalPages,
    totalPages,
  });

  const { error } = await supabase.storage
    .from(bucketName)
    .upload(path, payload, {
      contentType: "application/json",
      upsert: true,
    });

  if (error) return { error: error.message };
  onProgress?.({
    percent: 100,
    stage: "done",
    doneAssets: 0,
    totalAssets: 0,
    donePages: totalPages,
    totalPages,
  });
  return { path, syncedAt };
}

export async function deleteJobFromCloud(jobId: string): Promise<string | null> {
  if (!supabase) return null;

  const mainPath = buildJobObjectPath(jobId);
  const legacyPath = buildLegacyJobPath(jobId);

  const filesToRemove = [mainPath, legacyPath];

  const assetsFolder = `${objectPrefix}/assets/${jobId}`;
  const { data: assetItems } = await supabase.storage.from(bucketName).list(assetsFolder, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  for (const item of assetItems ?? []) {
    if (!isFileItem(item)) continue;
    filesToRemove.push(`${assetsFolder}/${item.name}`);
  }

  const { error } = await supabase.storage.from(bucketName).remove(filesToRemove);
  return error ? error.message : null;
}

export async function listCloudJobIds(): Promise<{ ids: string[]; error?: string }> {
  if (!supabase) return { ids: [], error: "Supabase ayarlari eksik" };

  const ids = new Set<string>();

  const { data: jobFiles, error } = await supabase.storage.from(bucketName).list(`${objectPrefix}/jobs`, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    return { ids: [], error: error.message };
  }

  for (const item of jobFiles ?? []) {
    if (!item.name.endsWith(".json")) continue;
    ids.add(item.name.replace(/\.json$/, ""));
  }

  // Backward compatibility for earlier cloud paths.
  const { data: legacyFiles } = await supabase.storage.from(bucketName).list(objectPrefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  for (const item of legacyFiles ?? []) {
    if (!item.name.endsWith(".json")) continue;
    ids.add(item.name.replace(/\.json$/, ""));
  }

  return { ids: Array.from(ids) };
}

export async function downloadJobFromCloud(jobId: string): Promise<{ job?: ArchiveJob; error?: string }> {
  if (!supabase) return { error: "Supabase ayarlari eksik" };

  const primaryPath = buildJobObjectPath(jobId);
  const legacyPath = buildLegacyJobPath(jobId);

  let data: Blob | null = null;
  let resolvedPath = primaryPath;
  {
    const first = await supabase.storage.from(bucketName).download(primaryPath);
    if (!first.error && first.data) {
      data = first.data;
      resolvedPath = primaryPath;
    } else {
      const second = await supabase.storage.from(bucketName).download(legacyPath);
      if (!second.error && second.data) {
        data = second.data;
        resolvedPath = legacyPath;
      } else {
        return { error: first.error?.message || second.error?.message || "Bulut dosyasi bulunamadi" };
      }
    }
  }

  try {
    const text = await data.text();
    const job = JSON.parse(text) as ArchiveJob;
    const resolvedPages: ArchivedPage[] = [];
    for (const page of job.pages) {
      resolvedPages.push(await resolvePageSignedUrls(page));
    }

    return {
      job: {
        ...job,
        cloudPath: job.cloudPath ?? resolvedPath,
        cloudSyncedAt: job.cloudSyncedAt ?? new Date().toISOString(),
        pages: resolvedPages,
      },
    };
  } catch {
    return { error: "Bulut dosyasi bozuk veya okunamadi" };
  }
}