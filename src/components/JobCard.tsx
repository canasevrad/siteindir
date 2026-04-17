import {
  Download,
  Eye,
  Globe,
  Trash2,
  Cloud,
  LoaderCircle,
  AlertCircle,
  CloudCheck,
} from "lucide-react";
import type { ArchiveJob } from "../types";
import { formatBytes, formatDate } from "../store";

interface JobCardProps {
  job: ArchiveJob;
  onView: (job: ArchiveJob) => void;
  onDelete: (id: string) => void | Promise<void>;
  onDeleteCloud: (id: string) => void | Promise<void>;
  onExport: (job: ArchiveJob) => void;
  cloudEnabled: boolean;
}

function statusLabel(job: ArchiveJob): string {
  if (job.status === "running") return "Calisiyor";
  if (job.status === "error") return "Hata";
  return "Tamamlandi";
}

export default function JobCard({
  job,
  onView,
  onDelete,
  onDeleteCloud,
  onExport,
  cloudEnabled,
}: JobCardProps) {
  const progress = job.totalPages > 0 ? Math.round((job.donePages / job.totalPages) * 100) : 0;
  const successPages = job.pages.filter((p) => p.status === "success").length;
  const totalBytes = job.pages.reduce((acc, page) => acc + page.size, 0);

  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="mb-4 flex items-center gap-3">
        {job.favicon ? (
          <img
            src={job.favicon}
            alt="favicon"
            className="h-9 w-9 rounded-lg border border-zinc-700 bg-white/90 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800">
            <Globe className="h-4 w-4 text-zinc-500" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">{job.siteName}</p>
          <p className="truncate text-xs text-zinc-500">{job.rootUrl}</p>
        </div>

        <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300">
          {statusLabel(job)}
        </span>
      </div>

      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-cyan-500 transition-all"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>

      <div className="mb-4 flex items-center justify-between text-xs text-zinc-400">
        <span>
          {job.donePages}/{job.totalPages} sayfa ({progress}%)
        </span>
        {job.status === "running" ? (
          <span className="inline-flex items-center gap-1 text-cyan-400">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            Taraniyor
          </span>
        ) : job.status === "error" ? (
          <span className="inline-flex items-center gap-1 text-red-400">
            <AlertCircle className="h-3.5 w-3.5" />
            Basarisiz
          </span>
        ) : (
          <span className="text-emerald-400">Bitti</span>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 text-xs text-zinc-400">
        <p>Basarili sayfa: {successPages}</p>
        <p>Toplam boyut: {formatBytes(totalBytes)}</p>
        <p>Resim: {job.pages.reduce((acc, page) => acc + page.images.length, 0)}</p>
        <p>Baslangic: {formatDate(job.startedAt)}</p>
      </div>

      {cloudEnabled && (
        <p className="mb-3 inline-flex items-center gap-1 text-xs text-zinc-400">
          {job.cloudSyncedAt ? (
            <>
              <CloudCheck className="h-3.5 w-3.5 text-emerald-400" />
              Bulut yedegi var
            </>
          ) : (
            <>
              <Cloud className="h-3.5 w-3.5 text-zinc-500" />
              Buluta yedeklenmedi
            </>
          )}
        </p>
      )}

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onView(job)}
          className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
        >
          <Eye className="h-4 w-4" />
          <span className="truncate">Goruntule</span>
        </button>
        <button
          onClick={() => onExport(job)}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-zinc-800"
          title="JSON disa aktar"
        >
          <Download className="h-4 w-4" />
          <span className="truncate">JSON indir</span>
        </button>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {cloudEnabled && (
          <button
            onClick={() => onDeleteCloud(job.id)}
            disabled={!job.cloudSyncedAt}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-orange-900/70 px-3 py-2 text-sm text-orange-300 transition-colors hover:bg-orange-950/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            title="Sadece bulut kopyasini sil"
          >
            <Cloud className="h-4 w-4" />
            <span className="truncate">Buluttan sil</span>
          </button>
        )}
        </div>

        <button
          onClick={() => onDelete(job.id)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-900/70 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-950/50"
          title="Yerelden sil"
        >
          <Trash2 className="h-4 w-4" />
          <span className="truncate">Yerelden sil</span>
        </button>
      </div>
    </article>
  );
}