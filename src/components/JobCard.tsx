import {
  Eye,
  Trash2,
  Download,
  Globe,
  FileText,
  Image,
  HardDrive,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
} from "lucide-react";
import type { ArchiveJob } from "../types";
import { formatBytes, formatDate } from "../store";

interface Props {
  job: ArchiveJob;
  onView: (job: ArchiveJob) => void;
  onDelete: (id: string) => void;
  onExport: (job: ArchiveJob) => void;
}

function StatusBadge({ status }: { status: ArchiveJob["status"] }) {
  const map = {
    idle: {
      label: "Bekliyor",
      icon: Clock,
      cls: "bg-gray-700 text-gray-300 border-gray-600",
    },
    running: {
      label: "Taranıyor",
      icon: Loader2,
      cls: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
      spin: true,
    },
    done: {
      label: "Tamamlandı",
      icon: CheckCircle2,
      cls: "bg-green-500/20 text-green-300 border-green-500/30",
    },
    error: {
      label: "Hata",
      icon: AlertCircle,
      cls: "bg-red-500/20 text-red-300 border-red-500/30",
    },
  };
  const s = map[status];
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${s.cls}`}
    >
      <Icon
        className={`w-3 h-3 ${"spin" in s && s.spin ? "animate-spin" : ""}`}
      />
      {s.label}
    </span>
  );
}

export default function JobCard({ job, onView, onDelete, onExport }: Props) {
  const successPages = job.pages.filter((p) => p.status === "success");
  const totalSize = job.pages.reduce((a, p) => a + p.size, 0);
  const totalImages = job.pages.reduce((a, p) => a + p.images.length, 0);
  const progress =
    job.totalPages > 0 ? Math.round((job.donePages / job.totalPages) * 100) : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-4 hover:border-gray-700 transition-colors group">
      {/* Top row */}
      <div className="flex items-start gap-3">
        {/* Favicon / icon */}
        <div className="w-10 h-10 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
          {job.favicon ? (
            <img
              src={job.favicon}
              alt=""
              className="w-6 h-6 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Globe className="w-5 h-5 text-gray-500" />
          )}
        </div>

        {/* Title & URL */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-white font-semibold text-sm truncate">
              {job.siteName}
            </h3>
            <StatusBadge status={job.status} />
          </div>
          <p className="text-gray-500 text-xs truncate mt-0.5">{job.rootUrl}</p>
        </div>
      </div>

      {/* Progress bar (running only) */}
      {job.status === "running" && (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1.5">
            <span>
              {job.donePages} / {job.totalPages} sayfa
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-2">
        {[
          {
            Icon: FileText,
            value: successPages.length,
            label: "Sayfa",
            color: "text-purple-400",
          },
          {
            Icon: Image,
            value: totalImages,
            label: "Resim",
            color: "text-green-400",
          },
          {
            Icon: HardDrive,
            value: formatBytes(totalSize),
            label: "Boyut",
            color: "text-orange-400",
          },
        ].map(({ Icon, value, label, color }) => (
          <div
            key={label}
            className="bg-gray-800 rounded-xl px-3 py-2 flex items-center gap-2"
          >
            <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
            <div className="min-w-0">
              <p className={`text-xs font-semibold truncate ${color}`}>
                {value}
              </p>
              <p className="text-gray-600 text-[10px]">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Date */}
      <div className="flex items-center gap-1.5 text-gray-600 text-xs">
        <Clock className="w-3 h-3" />
        <span>
          {job.finishedAt
            ? `Tamamlandı: ${formatDate(job.finishedAt)}`
            : `Başladı: ${formatDate(job.startedAt)}`}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-gray-800">
        <button
          onClick={() => onView(job)}
          disabled={job.pages.length === 0}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl bg-gray-800 hover:bg-cyan-500/20 hover:text-cyan-300 text-gray-300 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Eye className="w-4 h-4" />
          Görüntüle
        </button>
        <button
          onClick={() => onExport(job)}
          disabled={job.pages.length === 0}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gray-800 hover:bg-blue-500/20 hover:text-blue-300 text-gray-400 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          title="JSON olarak dışa aktar"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(job.id)}
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gray-800 hover:bg-red-500/20 hover:text-red-400 text-gray-400 text-sm transition-colors"
          title="Arşivi sil"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
