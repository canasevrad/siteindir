import type { ArchiveJob } from "./types";

const JOBS_KEY = "webarshiv_jobs";

function safeParseJobs(raw: string | null): ArchiveJob[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as ArchiveJob[];
  } catch {
    return [];
  }
}

export async function initJobsStore(): Promise<ArchiveJob[]> {
  return loadJobs();
}

export function loadJobs(): ArchiveJob[] {
  if (typeof window === "undefined") return [];
  return safeParseJobs(localStorage.getItem(JOBS_KEY));
}

export function saveJobs(jobs: ArchiveJob[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(JOBS_KEY, JSON.stringify(jobs));
    return true;
  } catch {
    return false;
  }
}

export function upsertJob(job: ArchiveJob): boolean {
  const jobs = loadJobs();
  const idx = jobs.findIndex((j) => j.id === job.id);
  if (idx === -1) {
    jobs.unshift(job);
  } else {
    jobs[idx] = job;
  }
  return saveJobs(jobs);
}

export function deleteJob(id: string): boolean {
  const jobs = loadJobs().filter((job) => job.id !== id);
  return saveJobs(jobs);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIdx = 0;
  while (value >= 1024 && unitIdx < units.length - 1) {
    value /= 1024;
    unitIdx += 1;
  }
  const formatted = value >= 100 ? value.toFixed(0) : value.toFixed(1);
  return `${formatted} ${units[unitIdx]}`;
}

export function formatDate(isoDate?: string): string {
  if (!isoDate) return "-";
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}