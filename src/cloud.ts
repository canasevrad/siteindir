import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ArchiveJob } from "./types";

export type CloudUploadProgress = {
  percent: number;
  doneAssets: number;
  totalAssets: number;
  donePages: number;
  totalPages: number;
  stage: "preparing" | "uploading" | "done";
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const BUCKET = (import.meta.env.VITE_SUPABASE_BUCKET as string | undefined) || "archives";
const PREFIX = (import.meta.env.VITE_SUPABASE_PREFIX as string | undefined) || "webarshiv";

export type CloudConfigStatus = {
  configured: boolean;
  missing: string[];
  bucket: string;
  prefix: string;
};

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

function cloudPathFor(jobId: string): string {
  return `${PREFIX}/${jobId}.json`;
}

export function isCloudConfigured(): boolean {
  return Boolean(getClient());
}

export function getCloudConfigStatus(): CloudConfigStatus {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("VITE_SUPABASE_URL");
  if (!SUPABASE_ANON_KEY) missing.push("VITE_SUPABASE_ANON_KEY");

  return {
    configured: missing.length === 0,
    missing,
    bucket: BUCKET,
    prefix: PREFIX,
  };
}

export async function uploadJobToCloud(
  job: ArchiveJob,
  onProgress?: (progress: CloudUploadProgress) => void
): Promise<{ path?: string; syncedAt?: string; error?: string }> {
  const supabase = getClient();
  if (!supabase) {
    return { error: "Supabase ayarlari eksik" };
  }

  const totalPages = Math.max(1, job.pages.length);
  const totalAssets = Math.max(0, job.pages.reduce((acc, page) => acc + page.images.length, 0));
  let doneAssets = 0;

  onProgress?.({
    percent: 2,
    doneAssets,
    totalAssets,
    donePages: 0,
    totalPages,
    stage: "preparing",
  });

  for (let i = 0; i < totalPages; i += 1) {
    doneAssets += job.pages[i]?.images.length ?? 0;
    onProgress?.({
      percent: Math.min(90, Math.round(((i + 1) / totalPages) * 90)),
      doneAssets,
      totalAssets,
      donePages: i + 1,
      totalPages,
      stage: "preparing",
    });
  }

  const nowIso = new Date().toISOString();
  const payload: ArchiveJob = {
    ...job,
    cloudPath: cloudPathFor(job.id),
    cloudSyncedAt: nowIso,
  };

  onProgress?.({
    percent: 95,
    doneAssets,
    totalAssets,
    donePages: totalPages,
    totalPages,
    stage: "uploading",
  });

  const file = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const path = cloudPathFor(job.id);

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: "application/json",
    upsert: true,
  });

  if (error) {
    return { error: error.message };
  }

  onProgress?.({
    percent: 100,
    doneAssets,
    totalAssets,
    donePages: totalPages,
    totalPages,
    stage: "done",
  });

  return { path, syncedAt: nowIso };
}

export async function deleteJobFromCloud(jobId: string): Promise<string | null> {
  const supabase = getClient();
  if (!supabase) {
    return "Supabase ayarlari eksik";
  }
  const path = cloudPathFor(jobId);
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  return error ? error.message : null;
}

export async function downloadJobFromCloud(
  jobId: string
): Promise<{ job?: ArchiveJob; error?: string }> {
  const supabase = getClient();
  if (!supabase) {
    return { error: "Supabase ayarlari eksik" };
  }

  const path = cloudPathFor(jobId);
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) return { error: error.message };

  try {
    const text = await data.text();
    const parsed = JSON.parse(text) as ArchiveJob;
    return { job: parsed };
  } catch {
    return { error: "Bulut JSON okunamadi" };
  }
}

export async function listCloudJobIds(): Promise<{ ids: string[]; error?: string }> {
  const supabase = getClient();
  if (!supabase) {
    return { ids: [], error: "Supabase ayarlari eksik" };
  }

  const { data, error } = await supabase.storage.from(BUCKET).list(PREFIX, {
    limit: 1000,
    offset: 0,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) return { ids: [], error: error.message };

  const ids = (data ?? [])
    .map((item) => item.name)
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.replace(/\.json$/, ""));

  return { ids };
}