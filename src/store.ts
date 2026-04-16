import type { ArchiveJob } from "./types";

const STORAGE_KEY = "webarshiv_jobs";

export function loadJobs(): ArchiveJob[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ArchiveJob[];
  } catch {
    return [];
  }
}

export function saveJobs(jobs: ArchiveJob[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch (e) {
    console.error("LocalStorage quota exceeded or error:", e);
  }
}

export function getJob(id: string): ArchiveJob | null {
  const jobs = loadJobs();
  return jobs.find((j) => j.id === id) ?? null;
}

export function upsertJob(job: ArchiveJob): void {
  const jobs = loadJobs();
  const idx = jobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) {
    jobs[idx] = job;
  } else {
    jobs.unshift(job);
  }
  saveJobs(jobs);
}

export function deleteJob(id: string): void {
  const jobs = loadJobs().filter((j) => j.id !== id);
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