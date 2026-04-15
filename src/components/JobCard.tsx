import {
  Globe,
  Trash2,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  Loader,
  FileText,
  Image,
  Link2,
  Download,
} from "lucide-react";
import type { ArchiveJob } from "../types";
import { formatBytes, formatDate } from "../store";

interface Props {
  job: ArchiveJob;
  onView: (job: ArchiveJob) => void;
  onDelete: (id: string) => void;
  onExport: (job: ArchiveJob) => void;
}

const statusConfig = {
  idle: {
    label: "Bekliyor",
    color: "text-gray-400",
    bg: "bg-gray-500/10 border-gray-500/20",
    Icon: Clock,
  },
  running: {
    label: "Çalışıyor",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/20",
    Icon: Loader,
  },
  done: {
    label: "Tamamlandı",
    color: "text-green-400",
    bg: "bg-green-500/10 border-green-500/20",
    Icon: CheckCircle,
  },
  error: {
    label: "Hata",
    color: "text-red-400",
    bg: "bg-red-500/10 border-red-500/20",
    Icon: XCircle,
  },
};

export default function JobCard({ job, onView, onDelete, onExport }: Props) {
  const cfg = statusConfig[job.status];
  const StatusIcon = cfg.Icon;

  const totalSize = job.pages.reduce((a, p) => a + p.size, 0);
  const totalImages = job.pages.reduce((a, p) => a + p.images.length, 0);
  const totalLinks = job.pages.reduce((a, p) => a + p.links.length, 0);
  const progress =
    job.totalPages > 0
      ? Math.round((job.donePages / job.totalPages) * 100)
      : job.status === "done"
      ? 100
      : 0;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 hover:border-gray-600 transition-all group">
      {/* Top Row */}
      <div className="flex items-start gap-4 mb-4">
        {/* Favicon / Icon */}
        <div className="w-12 h-12 rounded-xl bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0 overflow-hidden">
          {job.favicon ? (
            <img
              src={job.favicon}
              alt=""
              className="w-7 h-7 object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Globe className="w-6 h-6 text-gray-500" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold truncate text-base">
            {job.siteName || job.rootUrl}
          </h3>
          <a
            href={job.rootUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 text-sm truncate block"
          >
            {job.rootUrl}
          </a>
          <p className="text-gray-500 text-xs mt-0.5">
            {formatDate(job.startedAt)}
          </p>
        </div>

        {/* Status Badge */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${cfg.bg} ${cfg.color} shrink-0`}
        >
          <StatusIcon
            className={`w-3.5 h-3.5 ${
              job.status === "running" ? "animate-spin" : ""
            }`}
          />
          {cfg.label}
        </div>
      </div>

      {/* Progress Bar */}
      {(job.status === "running" || job.status === "done") && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>
              {job.donePages} / {job.totalPages > 0 ? job.totalPages : "?"} sayfa
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                job.status === "done" ? "bg-green-500" : "bg-cyan-500"
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-800 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <FileText className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs text-gray-400">Sayfa</span>
          </div>
          <p className="text-white font-bold text-base">{job.pages.filter(p => p.status === "success").length}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Image className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs text-gray-400">Resim</span>
          </div>
          <p className="text-white font-bold text-base">{totalImages}</p>
        </div>
        <div className="bg-gray-800 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Link2 className="w-3.5 h-3.5 text-green-400" />
            <span className="text-xs text-gray-400">Link</span>
          </div>
          <p className="text-white font-bold text-base">{totalLinks}</p>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="flex items-center justify-between">
        <span className="text-gray-500 text-sm">
          📦 {formatBytes(totalSize)}
        </span>

        <div className="flex gap-2">
          {job.status === "done" && (
            <>
              <button
                onClick={() => onExport(job)}
                title="JSON olarak indir"
                className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-green-400 transition-colors"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => onView(job)}
                title="Arşivi görüntüle"
                className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-cyan-400 transition-colors"
              >
                <Eye className="w-4 h-4" />
              </button>
            </>
          )}
          {job.status === "running" && (
            <button
              onClick={() => onView(job)}
              className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-cyan-400 transition-colors"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => onDelete(job.id)}
            title="Sil"
            className="p-2 rounded-lg bg-gray-800 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
