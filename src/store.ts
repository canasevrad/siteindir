import type { ArchiveJob, ArchivedPage } from "./types";

const STORAGE_KEY = "webarshiv_jobs";
const DB_NAME = "webarshiv_db";
const DB_VERSION = 2;

const LEGACY_KV_STORE = "kv";
const LEGACY_JOBS_RECORD_KEY = "jobs";
const JOB_META_STORE = "job_meta";
const PAGE_META_STORE = "page_meta";
const PAGE_CONTENT_STORE = "page_content";

interface JobMetaRecord extends Omit<ArchiveJob, "pages"> {
  rank: number;
  pageIds: string[];
}

interface PageMetaRecord extends Omit<ArchivedPage, "html" | "text"> {
  key: string;
  jobId: string;
}

interface PageContentRecord {
  key: string;
  html: string;
  text: string;
}

let jobsCache: ArchiveJob[] = [];
let initPromise: Promise<ArchiveJob[]> | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function cloneJobs(jobs: ArchiveJob[]): ArchiveJob[] {
  return JSON.parse(JSON.stringify(jobs)) as ArchiveJob[];
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function pageKey(jobId: string, pageId: string): string {
  return `${jobId}::${pageId}`;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB istek hatasi"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction hatasi"));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction iptal edildi"));
  });
}

function openDb(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    return Promise.reject(new Error("IndexedDB browser ortaminda yok"));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_KV_STORE)) {
        db.createObjectStore(LEGACY_KV_STORE);
      }
      if (!db.objectStoreNames.contains(JOB_META_STORE)) {
        db.createObjectStore(JOB_META_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(PAGE_META_STORE)) {
        db.createObjectStore(PAGE_META_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(PAGE_CONTENT_STORE)) {
        db.createObjectStore(PAGE_CONTENT_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB acilamadi"));
  });

  return dbPromise;
}

async function writeJobsSplitToDb(jobs: ArchiveJob[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([JOB_META_STORE, PAGE_META_STORE, PAGE_CONTENT_STORE], "readwrite");
  const jobMetaStore = tx.objectStore(JOB_META_STORE);
  const pageMetaStore = tx.objectStore(PAGE_META_STORE);
  const pageContentStore = tx.objectStore(PAGE_CONTENT_STORE);

  jobMetaStore.clear();
  pageMetaStore.clear();
  pageContentStore.clear();

  jobs.forEach((job, rank) => {
    const pageIds = job.pages.map((page) => page.id);
    const record: JobMetaRecord = {
      id: job.id,
      rootUrl: job.rootUrl,
      siteName: job.siteName,
      favicon: job.favicon,
      totalPages: job.totalPages,
      donePages: job.donePages,
      status: job.status,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      errorMsg: job.errorMsg,
      cloudPath: job.cloudPath,
      cloudSyncedAt: job.cloudSyncedAt,
      rank,
      pageIds,
    };
    jobMetaStore.put(record);

    for (const page of job.pages) {
      const key = pageKey(job.id, page.id);
      const meta: PageMetaRecord = {
        key,
        jobId: job.id,
        id: page.id,
        url: page.url,
        title: page.title,
        description: page.description,
        favicon: page.favicon,
        links: page.links,
        images: page.images,
        archivedAt: page.archivedAt,
        size: page.size,
        status: page.status,
        errorMsg: page.errorMsg,
        cloudAssetMap: page.cloudAssetMap,
      };
      const content: PageContentRecord = {
        key,
        html: page.html,
        text: page.text,
      };
      pageMetaStore.put(meta);
      pageContentStore.put(content);
    }
  });

  await txDone(tx);
}

async function readJobsSplitFromDb(): Promise<ArchiveJob[]> {
  const db = await openDb();
  const tx = db.transaction([JOB_META_STORE, PAGE_META_STORE, PAGE_CONTENT_STORE], "readonly");

  const metaReq = tx.objectStore(JOB_META_STORE).getAll() as IDBRequest<JobMetaRecord[]>;
  const pageMetaReq = tx.objectStore(PAGE_META_STORE).getAll() as IDBRequest<PageMetaRecord[]>;
  const pageContentReq = tx.objectStore(PAGE_CONTENT_STORE).getAll() as IDBRequest<PageContentRecord[]>;

  const [metaRecords, pageMetaRecords, pageContentRecords] = await Promise.all([
    requestToPromise(metaReq),
    requestToPromise(pageMetaReq),
    requestToPromise(pageContentReq),
  ]);

  const contentByKey = new Map<string, PageContentRecord>();
  pageContentRecords.forEach((record) => contentByKey.set(record.key, record));

  const pageByJobId = new Map<string, ArchivedPage[]>();
  for (const meta of pageMetaRecords) {
    const content = contentByKey.get(meta.key);
    const page: ArchivedPage = {
      id: meta.id,
      url: meta.url,
      title: meta.title,
      description: meta.description,
      favicon: meta.favicon,
      html: content?.html ?? "",
      text: content?.text ?? "",
      links: meta.links,
      images: meta.images,
      archivedAt: meta.archivedAt,
      size: meta.size,
      status: meta.status,
      errorMsg: meta.errorMsg,
      cloudAssetMap: meta.cloudAssetMap,
    };

    const pages = pageByJobId.get(meta.jobId) ?? [];
    pages.push(page);
    pageByJobId.set(meta.jobId, pages);
  }

  const jobs = [...metaRecords]
    .sort((a, b) => a.rank - b.rank)
    .map((meta): ArchiveJob => {
      const unorderedPages = pageByJobId.get(meta.id) ?? [];
      const byPageId = new Map(unorderedPages.map((page) => [page.id, page]));
      const orderedPages: ArchivedPage[] = [];

      for (const pageId of meta.pageIds) {
        const page = byPageId.get(pageId);
        if (page) orderedPages.push(page);
      }

      if (orderedPages.length !== unorderedPages.length) {
        for (const page of unorderedPages) {
          if (!orderedPages.some((existing) => existing.id === page.id)) {
            orderedPages.push(page);
          }
        }
      }

      return {
        id: meta.id,
        rootUrl: meta.rootUrl,
        siteName: meta.siteName,
        favicon: meta.favicon,
        totalPages: meta.totalPages,
        donePages: meta.donePages,
        status: meta.status,
        startedAt: meta.startedAt,
        finishedAt: meta.finishedAt,
        errorMsg: meta.errorMsg,
        cloudPath: meta.cloudPath,
        cloudSyncedAt: meta.cloudSyncedAt,
        pages: orderedPages,
      };
    });

  await txDone(tx);
  return jobs;
}

async function readLegacyJobsFromKv(): Promise<ArchiveJob[]> {
  const db = await openDb();
  if (!db.objectStoreNames.contains(LEGACY_KV_STORE)) return [];

  const tx = db.transaction(LEGACY_KV_STORE, "readonly");
  const request = tx.objectStore(LEGACY_KV_STORE).get(LEGACY_JOBS_RECORD_KEY);
  const raw = await requestToPromise<unknown>(request);
  await txDone(tx);

  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ArchiveJob[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as ArchiveJob[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function enqueueWrite(jobs: ArchiveJob[]): void {
  const snapshot = cloneJobs(jobs);
  writeQueue = writeQueue
    .then(() => writeJobsSplitToDb(snapshot))
    .catch((e) => {
      console.error("IndexedDB yazma hatasi:", e);
    });
}

function readLegacyJobsFromLocalStorage(): ArchiveJob[] {
  if (!isBrowser()) return [];

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ArchiveJob[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function removeLegacyLocalStorage(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}

export async function initJobsStore(): Promise<ArchiveJob[]> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!isBrowser()) {
      jobsCache = [];
      return [];
    }

    try {
      const splitJobs = await readJobsSplitFromDb();
      if (splitJobs.length > 0) {
        jobsCache = cloneJobs(splitJobs);
        return cloneJobs(jobsCache);
      }

      const kvJobs = await readLegacyJobsFromKv();
      if (kvJobs.length > 0) {
        jobsCache = cloneJobs(kvJobs);
        await writeJobsSplitToDb(kvJobs);
        return cloneJobs(jobsCache);
      }

      const legacyJobs = readLegacyJobsFromLocalStorage();
      jobsCache = cloneJobs(legacyJobs);
      if (legacyJobs.length > 0) {
        await writeJobsSplitToDb(legacyJobs);
        removeLegacyLocalStorage();
      }

      return cloneJobs(jobsCache);
    } catch (e) {
      console.error("IndexedDB init hatasi, localStorage fallback kullanilacak:", e);
      jobsCache = cloneJobs(readLegacyJobsFromLocalStorage());
      return cloneJobs(jobsCache);
    }
  })();

  return initPromise;
}

export function loadJobs(): ArchiveJob[] {
  return cloneJobs(jobsCache);
}

export function saveJobs(jobs: ArchiveJob[]): boolean {
  jobsCache = cloneJobs(jobs);
  enqueueWrite(jobsCache);
  return true;
}

export function getJob(id: string): ArchiveJob | null {
  return jobsCache.find((j) => j.id === id) ?? null;
}

export function upsertJob(job: ArchiveJob): void {
  const jobs = cloneJobs(jobsCache);
  const idx = jobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) {
    jobs[idx] = job;
  } else {
    jobs.unshift(job);
  }
  saveJobs(jobs);
}

export function deleteJob(id: string): void {
  const jobs = jobsCache.filter((j) => j.id !== id);
  saveJobs(jobs);
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("tr-TR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}