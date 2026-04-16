import { useMemo, useState } from "react";
import { X, Search, FileText, Link as LinkIcon, Image as ImageIcon } from "lucide-react";
import type { ArchiveJob } from "../types";
import { formatBytes, formatDate } from "../store";

interface ArchiveViewerProps {
  job: ArchiveJob;
  onClose: () => void;
}

export default function ArchiveViewer({ job, onClose }: ArchiveViewerProps) {
  const [query, setQuery] = useState("");
  const [activePageId, setActivePageId] = useState<string | null>(job.pages[0]?.id ?? null);

  const filteredPages = useMemo(
    () =>
      job.pages.filter(
        (page) =>
          page.url.toLowerCase().includes(query.toLowerCase()) ||
          page.title.toLowerCase().includes(query.toLowerCase())
      ),
    [job.pages, query]
  );

  const activePage =
    filteredPages.find((page) => page.id === activePageId) ?? filteredPages[0] ?? null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 p-4 md:p-6">
      <div className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950">
        <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3 md:px-6">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-white md:text-lg">{job.siteName}</h2>
            <p className="truncate text-xs text-zinc-500 md:text-sm">{job.rootUrl}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[320px_1fr]">
          <aside className="border-b border-zinc-800 md:border-r md:border-b-0">
            <div className="border-b border-zinc-800 p-4">
              <div className="relative">
                <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Sayfa ara..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-900 py-2 pr-4 pl-9 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-500 focus:outline-none"
                />
              </div>
              <p className="mt-3 text-xs text-zinc-500">{filteredPages.length} sayfa listeleniyor</p>
            </div>

            <div className="max-h-[40vh] overflow-y-auto md:max-h-none md:h-[calc(100vh-240px)]">
              {filteredPages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => setActivePageId(page.id)}
                  className={`w-full border-b border-zinc-900 px-4 py-3 text-left transition-colors ${
                    activePage?.id === page.id ? "bg-zinc-900" : "hover:bg-zinc-900/60"
                  }`}
                >
                  <p className="truncate text-sm text-zinc-100">{page.title || page.url}</p>
                  <p className="mt-1 truncate text-xs text-zinc-500">{page.url}</p>
                </button>
              ))}
            </div>
          </aside>

          <section className="min-h-0 overflow-y-auto p-4 md:p-6">
            {activePage ? (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-white">{activePage.title || activePage.url}</h3>
                  <p className="mt-1 break-all text-sm text-zinc-500">{activePage.url}</p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 md:grid-cols-4">
                  <p className="inline-flex items-center gap-1.5">
                    <FileText className="h-3.5 w-3.5" />
                    {formatBytes(activePage.size)}
                  </p>
                  <p className="inline-flex items-center gap-1.5">
                    <LinkIcon className="h-3.5 w-3.5" />
                    {activePage.links.length} link
                  </p>
                  <p className="inline-flex items-center gap-1.5">
                    <ImageIcon className="h-3.5 w-3.5" />
                    {activePage.images.length} resim
                  </p>
                  <p>{formatDate(activePage.archivedAt)}</p>
                </div>

                {activePage.status === "error" ? (
                  <div className="rounded-xl border border-red-900/70 bg-red-950/20 p-3 text-sm text-red-300">
                    Sayfa alinamadi: {activePage.errorMsg ?? "Bilinmeyen hata"}
                  </div>
                ) : (
                  <iframe
                    title={activePage.title || activePage.url}
                    srcDoc={activePage.html}
                    sandbox="allow-same-origin"
                    className="h-[55vh] w-full rounded-xl border border-zinc-800 bg-white"
                  />
                )}

                {activePage.text && (
                  <details className="rounded-xl border border-zinc-800 bg-zinc-900 p-3">
                    <summary className="cursor-pointer text-sm text-zinc-300">Metin icerigini goster</summary>
                    <pre className="mt-3 max-h-52 overflow-auto whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-400">
                      {activePage.text.slice(0, 3000)}
                    </pre>
                  </details>
                )}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-500">Gosterilecek sayfa yok</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}