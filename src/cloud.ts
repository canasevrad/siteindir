import { createClient } from "@supabase/supabase-js";
import type { ArchiveJob } from "./types";

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

function buildObjectPath(jobId: string): string {
  return `${objectPrefix}/${jobId}.json`;
}

export function isCloudConfigured(): boolean {
  return supabase !== null;
}

export async function uploadJobToCloud(job: ArchiveJob): Promise<{ path?: string; error?: string }> {
  if (!supabase) return { error: "Supabase ayarlari eksik" };

  const path = buildObjectPath(job.id);
  const payload = JSON.stringify(job);
  const { error } = await supabase.storage
    .from(bucketName)
    .upload(path, payload, {
      contentType: "application/json",
      upsert: true,
    });

  if (error) return { error: error.message };
  return { path };
}

export async function deleteJobFromCloud(jobId: string): Promise<string | null> {
  if (!supabase) return null;
  const path = buildObjectPath(jobId);
  const { error } = await supabase.storage.from(bucketName).remove([path]);
  return error ? error.message : null;
}

export async function listCloudJobIds(): Promise<{ ids: string[]; error?: string }> {
  if (!supabase) return { ids: [], error: "Supabase ayarlari eksik" };

  const { data, error } = await supabase.storage.from(bucketName).list(objectPrefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) return { ids: [], error: error.message };

  const ids =
    data
      ?.map((item) => item.name)
      .filter((name) => name.endsWith(".json"))
      .map((name) => name.replace(/\.json$/, "")) ?? [];

  return { ids };
}

export async function downloadJobFromCloud(jobId: string): Promise<{ job?: ArchiveJob; error?: string }> {
  if (!supabase) return { error: "Supabase ayarlari eksik" };

  const path = buildObjectPath(jobId);
  const { data, error } = await supabase.storage.from(bucketName).download(path);
  if (error) return { error: error.message };

  try {
    const text = await data.text();
    const job = JSON.parse(text) as ArchiveJob;
    return { job };
  } catch {
    return { error: "Bulut dosyasi bozuk veya okunamadi" };
  }
}
