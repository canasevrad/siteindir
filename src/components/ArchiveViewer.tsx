import { useState, useRef, useEffect } from "react";
import {
  X,
  Globe,
  FileText,
  Image,
  Link2,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Code2,
  AlignLeft,
  Eye,
  Download,
  HardDrive,
  Clock,
} from "lucide-react";
import type { ArchiveJob, ArchivedPage } from "../types";
import { formatBytes, formatDate } from "../store";

interface Props {
  job: ArchiveJob;
  onClose: () => void;
}

type TabId = "preview" | "text" | "html" | "links" | "images";

const TABS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: "preview", label: "Önizleme", Icon: Eye },
  { id: "text", label: "Metin", Icon: AlignLeft },
  { id: "html", label: "HTML", Icon: Code2 },
  { id: "links", label: "Linkler", Icon: Link2 },
  { id: "images", label: "Resimler", Icon: Image },
];

function PagePreview({ page }: { page: ArchivedPage }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!iframeRef.current || !page.html) return;
    const doc = iframeRef.current.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(page.html);
    doc.close();
  }, [page.html, page.id]);

  if (!page.html) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
        <AlertCircle className="w-10 h-10 text-red-500/50" />
        <p className="text-sm">Bu sayfa arşivlenemedi.</p>
        {page.errorMsg && (
          <p className="text-xs text-red-400/70 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 max-w-xs text-center">
            {page.errorMsg}
          </p>
        )}
      </div>
    );
  }

  return (
    <iframe
      ref={iframeRef}
      title={page.title}
      className="w-full h-full border-0 rounded-b-xl"
      sandbox="allow-same-origin"
    />
  );
}

function TextTab({ page }: { page: ArchivedPage }) {
  const [search, setSearch] = useState("");
  const text = page.text || "";
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const filtered = search
    ? lines.filter((l) => l.toLowerCase().includes(search.toLowerCase()))
    : lines;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Metinde ara..."
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {filtered.length === 0 ? (
          <p className="text-gray-600 text-sm text-center mt-8">
            {search ? "Eşleşen metin bulunamadı." : "Metin içeriği yok."}
          </p>
        ) : (
          <div className="space-y-1">
            {filtered.map((line, i) => (
              <p key={i} className="text-gray-300 text-sm leading-relaxed">
                {search ? (
                  <HighlightText text={line} query={search} />
                ) : (
                  line
                )}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-cyan-500/30 text-cyan-200 rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function HtmlTab({ page }: { page: ArchivedPage }) {
  const handleCopy = () => {
    navigator.clipboard.writeText(page.html).catch(() => {});
  };

  if (!page.html) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        HTML içeriği yok.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-800 flex justify-between items-center">
        <span className="text-gray-500 text-xs">
          {formatBytes(new Blob([page.html]).size)} · {page.html.split("\n").length} satır
        </span>
        <button
          onClick={handleCopy}
          className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
        >
          <Download className="w-3 h-3" />
          Kopyala
        </button>
      </div>
      <div className="flex-1 overflow-auto">
        <pre className="p-4 text-xs text-green-300/80 font-mono leading-relaxed whitespace-pre-wrap break-all">
          {page.html.substring(0, 50000)}
          {page.html.length > 50000 && (
            <span className="text-gray-500">
              {"\n\n... ("}
              {formatBytes(new Blob([page.html]).size - 50000)}
              {" daha — tam görüntü için dışa aktar)"}
            </span>
          )}
        </pre>
      </div>
    </div>
  );
}

function LinksTab({ page }: { page: ArchivedPage }) {
  const [search, setSearch] = useState("");
  const filtered = search
    ? page.links.filter((l) => l.toLowerCase().includes(search.toLowerCase()))
    : page.links;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${page.links.length} link içinde ara...`}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-gray-600 text-sm text-center mt-8">
            {search ? "Eşleşen link bulunamadı." : "Link yok."}
          </p>
        ) : (
          filtered.map((link, i) => (
            <div
              key={i}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-750 rounded-lg px-3 py-2 group"
            >
              <Link2 className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
              <span className="text-gray-300 text-xs truncate flex-1 font-mono">
                {link}
              </span>
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="w-3.5 h-3.5 text-gray-500 hover:text-cyan-400" />
              </a>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ImagesTab({ page }: { page: ArchivedPage }) {
  const [search, setSearch] = useState("");
  const filtered = search
    ? page.images.filter((i) => i.toLowerCase().includes(search.toLowerCase()))
    : page.images;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-gray-800">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${page.images.length} resim içinde ara...`}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {filtered.length === 0 ? (
          <p className="text-gray-600 text-sm text-center mt-8">
            {search ? "Eşleşen resim bulunamadı." : "Resim yok."}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filtered.map((src, i) => (
              <a
                key={i}
                href={src}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative aspect-video bg-gray-800 rounded-xl overflow-hidden border border-gray-700 hover:border-cyan-500/50 transition-colors"
              >
                <img
                  src={src}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    const el = e.target as HTMLImageElement;
                    el.style.display = "none";
                    const parent = el.parentElement;
                    if (parent) {
                      parent.innerHTML = `<div class="w-full h-full flex items-center justify-center text-gray-600 text-xs p-2 text-center break-all">${src.split("/").pop()}</div>`;
                    }
                  }}
                />
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <ExternalLink className="w-5 h-5 text-white" />
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ArchiveViewer({ job, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("preview");
  const [pageIndex, setPageIndex] = useState(0);
  const [search, setSearch] = useState("");

  const pages = job.pages;
  const filteredPageList = search
    ? pages.filter(
        (p) =>
          p.title.toLowerCase().includes(search.toLowerCase()) ||
          p.url.toLowerCase().includes(search.toLowerCase())
      )
    : pages;

  const currentPage = filteredPageList[pageIndex] ?? null;

  const handlePrev = () => setPageIndex((i) => Math.max(0, i - 1));
  const handleNext = () =>
    setPageIndex((i) => Math.min(filteredPageList.length - 1, i + 1));

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "ArrowRight") handleNext();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Reset page index on search
  useEffect(() => {
    setPageIndex(0);
  }, [search]);

  return (
    <div className="fixed inset-0 z-50 flex bg-gray-950" style={{ backdropFilter: "blur(4px)" }}>
      {/* Sidebar */}
      <div className="w-72 shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        {/* Sidebar Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              {job.favicon ? (
                <img
                  src={job.favicon}
                  alt=""
                  className="w-5 h-5 object-contain shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <Globe className="w-4 h-4 text-cyan-400 shrink-0" />
              )}
              <span className="text-white font-semibold text-sm truncate">
                {job.siteName}
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors shrink-0"
            >
              <X className="w-4 h-4 text-gray-400" />
            </button>
          </div>

          {/* Stats mini */}
          <div className="flex gap-2 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {pages.filter((p) => p.status === "success").length} sayfa
            </span>
            <span>·</span>
            <span className="flex items-center gap-1">
              <HardDrive className="w-3 h-3" />
              {formatBytes(pages.reduce((a, p) => a + p.size, 0))}
            </span>
          </div>

          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Sayfalarda ara..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Page List */}
        <div className="flex-1 overflow-auto">
          {filteredPageList.length === 0 ? (
            <p className="text-gray-600 text-xs text-center mt-8 px-4">
              {search ? "Eşleşen sayfa bulunamadı." : "Sayfa yok."}
            </p>
          ) : (
            filteredPageList.map((page, idx) => (
              <button
                key={page.id}
                onClick={() => setPageIndex(idx)}
                className={`w-full text-left px-4 py-3 border-b border-gray-800/50 transition-colors flex items-start gap-2.5 ${
                  idx === pageIndex
                    ? "bg-cyan-500/10 border-l-2 border-l-cyan-500"
                    : "hover:bg-gray-800/50"
                }`}
              >
                {page.status === "success" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-gray-300 text-xs font-medium truncate leading-tight">
                    {page.title || "Başlıksız"}
                  </p>
                  <p className="text-gray-600 text-[10px] truncate mt-0.5">
                    {page.url}
                  </p>
                  <p className="text-gray-700 text-[10px] mt-0.5 flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" />
                    {formatDate(page.archivedAt)}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {currentPage ? (
          <>
            {/* Page Header */}
            <div className="bg-gray-900 border-b border-gray-800 px-5 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {currentPage.status === "success" ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    )}
                    <h2 className="text-white font-semibold text-sm truncate">
                      {currentPage.title || "Başlıksız"}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <a
                      href={currentPage.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400/70 hover:text-cyan-400 text-xs truncate flex items-center gap-1 transition-colors"
                    >
                      {currentPage.url}
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                </div>

                {/* Page nav */}
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-gray-500 text-xs">
                    {pageIndex + 1} / {filteredPageList.length}
                  </span>
                  <button
                    onClick={handlePrev}
                    disabled={pageIndex === 0}
                    className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-300" />
                  </button>
                  <button
                    onClick={handleNext}
                    disabled={pageIndex === filteredPageList.length - 1}
                    className="w-7 h-7 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-300" />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mt-3">
                {TABS.map(({ id, label, Icon }) => {
                  const counts: Partial<Record<TabId, number>> = {
                    links: currentPage.links.length,
                    images: currentPage.images.length,
                  };
                  return (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        activeTab === id
                          ? "bg-cyan-500/20 text-cyan-300"
                          : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                      {counts[id] !== undefined && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            activeTab === id
                              ? "bg-cyan-500/30 text-cyan-300"
                              : "bg-gray-800 text-gray-500"
                          }`}
                        >
                          {counts[id]}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-hidden bg-gray-950">
              {activeTab === "preview" && <PagePreview page={currentPage} />}
              {activeTab === "text" && <TextTab page={currentPage} />}
              {activeTab === "html" && <HtmlTab page={currentPage} />}
              {activeTab === "links" && <LinksTab page={currentPage} />}
              {activeTab === "images" && <ImagesTab page={currentPage} />}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-600 gap-4">
            <FileText className="w-12 h-12 text-gray-800" />
            <p className="text-sm">Görüntülenecek sayfa seçin</p>
          </div>
        )}
      </div>
    </div>
  );
}
