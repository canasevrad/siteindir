import { useState } from "react";
import {
  X,
  Globe,
  ChevronRight,
  FileText,
  Search,
  Image,
  Link2,
  AlertCircle,
  CheckCircle,
  ExternalLink,
  Eye,
  Code,
} from "lucide-react";
import type { ArchiveJob, ArchivedPage } from "../types";
import { formatBytes, formatDate } from "../store";

interface Props {
  job: ArchiveJob;
  onClose: () => void;
}

type Tab = "pages" | "preview" | "html" | "images" | "links";

export default function ArchiveViewer({ job, onClose }: Props) {
  const [selectedPage, setSelectedPage] = useState<ArchivedPage | null>(
    job.pages.find((p) => p.status === "success") ?? null
  );
  const [activeTab, setActiveTab] = useState<Tab>("preview");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPages = job.pages.filter(
    (p) =>
      p.url.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const successCount = job.pages.filter((p) => p.status === "success").length;
  const errorCount = job.pages.filter((p) => p.status === "error").length;

  return (
    <div className="fixed inset-0 z-50 bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-700 px-4 py-3 flex items-center gap-4 shrink-0">
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Globe className="w-5 h-5 text-cyan-400 shrink-0" />
          <div className="min-w-0">
            <h2 className="text-white font-semibold truncate text-sm">
              {job.siteName}
            </h2>
            <p className="text-gray-500 text-xs truncate">{job.rootUrl}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm shrink-0">
          <span className="text-green-400 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5" />
            {successCount} başarılı
          </span>
          {errorCount > 0 && (
            <span className="text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {errorCount} hata
            </span>
          )}
          <span className="text-gray-500 text-xs">{formatDate(job.startedAt)}</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar – Page List */}
        <div className="w-72 bg-gray-900 border-r border-gray-700 flex flex-col shrink-0">
          {/* Search */}
          <div className="p-3 border-b border-gray-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Sayfa ara..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Page List */}
          <div className="flex-1 overflow-y-auto">
            {filteredPages.map((page) => (
              <button
                key={page.id}
                onClick={() => {
                  setSelectedPage(page);
                  setActiveTab("preview");
                }}
                className={`w-full text-left px-4 py-3 border-b border-gray-800 hover:bg-gray-800 transition-colors flex items-start gap-3 ${
                  selectedPage?.id === page.id
                    ? "bg-cyan-500/10 border-l-2 border-l-cyan-500"
                    : ""
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {page.status === "success" ? (
                    <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-white font-medium truncate leading-tight">
                    {page.title || "Başlıksız"}
                  </p>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {page.url}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">
                    {formatBytes(page.size)}
                  </p>
                </div>
                <ChevronRight
                  className={`w-3.5 h-3.5 text-gray-600 shrink-0 mt-1 ${
                    selectedPage?.id === page.id ? "text-cyan-400" : ""
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Right – Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {selectedPage ? (
            <>
              {/* Page Header */}
              <div className="bg-gray-900 border-b border-gray-700 px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-white font-semibold text-base">
                      {selectedPage.title || "Başlıksız"}
                    </h3>
                    <a
                      href={selectedPage.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center gap-1 mt-1"
                    >
                      {selectedPage.url}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    {selectedPage.description && (
                      <p className="text-gray-400 text-sm mt-1 line-clamp-2">
                        {selectedPage.description}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-sm text-gray-500">
                    <p>{formatBytes(selectedPage.size)}</p>
                    <p>{selectedPage.images.length} resim</p>
                    <p>{selectedPage.links.length} link</p>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 mt-4">
                  {(
                    [
                      { id: "preview", label: "Önizleme", Icon: Eye },
                      { id: "html", label: "HTML", Icon: Code },
                      { id: "images", label: `Resimler (${selectedPage.images.length})`, Icon: Image },
                      { id: "links", label: `Linkler (${selectedPage.links.length})`, Icon: Link2 },
                      { id: "pages", label: "Metin", Icon: FileText },
                    ] as { id: Tab; label: string; Icon: React.FC<{ className?: string }> }[]
                  ).map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      onClick={() => setActiveTab(id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        activeTab === id
                          ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                          : "text-gray-400 hover:text-white hover:bg-gray-800"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-auto">
                {/* Preview Tab */}
                {activeTab === "preview" && (
                  <div className="h-full bg-white">
                    {selectedPage.status === "error" ? (
                      <div className="flex items-center justify-center h-full bg-gray-950">
                        <div className="text-center text-red-400">
                          <AlertCircle className="w-12 h-12 mx-auto mb-3" />
                          <p className="font-medium">Sayfa çekilemedi</p>
                          <p className="text-sm text-gray-500 mt-1">{selectedPage.errorMsg}</p>
                        </div>
                      </div>
                    ) : (
                      <iframe
                        srcDoc={selectedPage.html}
                        className="w-full h-full border-0"
                        sandbox="allow-same-origin"
                        title={selectedPage.title}
                      />
                    )}
                  </div>
                )}

                {/* HTML Tab */}
                {activeTab === "html" && (
                  <div className="p-4 h-full overflow-auto">
                    <pre className="text-xs text-green-300 font-mono whitespace-pre-wrap leading-relaxed">
                      {selectedPage.html || "HTML içeriği yok"}
                    </pre>
                  </div>
                )}

                {/* Text Tab */}
                {activeTab === "pages" && (
                  <div className="p-6 max-w-3xl mx-auto">
                    <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                      {selectedPage.text || "Metin içeriği yok"}
                    </p>
                  </div>
                )}

                {/* Images Tab */}
                {activeTab === "images" && (
                  <div className="p-4">
                    {selectedPage.images.length === 0 ? (
                      <div className="text-center py-16 text-gray-500">
                        <Image className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>Resim bulunamadı</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {selectedPage.images.map((src, i) => (
                          <a
                            key={i}
                            href={src}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700 hover:border-cyan-500 transition-colors group"
                          >
                            <div className="aspect-square overflow-hidden">
                              <img
                                src={src}
                                alt=""
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).src =
                                    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%23374151' width='100' height='100'/%3E%3Ctext y='50' x='50' text-anchor='middle' fill='%236B7280' font-size='30'%3E🖼️%3C/text%3E%3C/svg%3E";
                                }}
                              />
                            </div>
                            <p className="text-xs text-gray-500 px-2 py-1 truncate">{src.split("/").pop()}</p>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Links Tab */}
                {activeTab === "links" && (
                  <div className="p-4">
                    {selectedPage.links.length === 0 ? (
                      <div className="text-center py-16 text-gray-500">
                        <Link2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p>Link bulunamadı</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {selectedPage.links.map((link, i) => {
                          const archived = job.pages.find((p) => p.url === link);
                          return (
                            <div
                              key={i}
                              className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3 border border-gray-700 hover:border-gray-600"
                            >
                              {archived ? (
                                <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />
                              ) : (
                                <Link2 className="w-4 h-4 text-gray-500 shrink-0" />
                              )}
                              <span className="text-sm text-gray-300 flex-1 truncate">
                                {link}
                              </span>
                              {archived ? (
                                <button
                                  onClick={() => {
                                    setSelectedPage(archived);
                                    setActiveTab("preview");
                                  }}
                                  className="text-xs text-cyan-400 hover:text-cyan-300 shrink-0 px-2 py-1 bg-cyan-500/10 rounded-lg"
                                >
                                  Görüntüle
                                </button>
                              ) : (
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-gray-500 hover:text-white shrink-0"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <FileText className="w-16 h-16 mx-auto mb-4 opacity-20" />
                <p>Sol panelden bir sayfa seçin</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
