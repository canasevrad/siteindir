import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Database,
  Globe,
  HardDrive,
  FileText,
  Search,
  Archive,
} from "lucide-react";
import type { ArchiveJob } from "./types";
import { loadJobs, upsertJob, deleteJob, formatBytes } from "./store";
import { scrapePage } from "./scraper";
import NewArchiveModal from "./components/NewArchiveModal";
import JobCard from "./components/JobCard";
import ArchiveViewer from "./components/ArchiveViewer";

// Keep active jobs in memory (for live progress tracking)
const activeJobRefs = new Map<string, boolean>(); // jobId -> shouldContinue

export default function App() {
  const [jobs, setJobs] = useState<ArchiveJob[]>(() => loadJobs());
  const [showModal, setShowModal] = useState(false);
  const [viewingJob, setViewingJob] = useState<ArchiveJob | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Refresh jobs from localStorage periodically
  const refreshJobs = useCallback(() => {
    setJobs(loadJobs());
  }, []);

  // Poll for running jobs
  useEffect(() => {
    const running = jobs.some((j) => j.status === "running");
    if (!running) return;
    const interval = setInterval(refreshJobs, 1000);
    return () => clearInterval(interval);
  }, [jobs, refreshJobs]);

  const handleStart = async (url: string, maxPages: number) => {
    setShowModal(false);

    const jobId = crypto.randomUUID();
    const rootUrl = url.trim();

    const newJob: ArchiveJob = {
      id: jobId,
      rootUrl,
      siteName: new URL(rootUrl).hostname,
      favicon: "",
      totalPages: maxPages,
      donePages: 0,
      status: "running",
      startedAt: new Date().toISOString(),
      pages: [],
    };

    upsertJob(newJob);
    setJobs(loadJobs());

    activeJobRefs.set(jobId, true);

    // BFS crawl
    const visited = new Set<string>();
    const queue: string[] = [rootUrl];
    visited.add(rootUrl);

    let doneCount = 0;
    let currentJob = { ...newJob };

    while (queue.length > 0 && doneCount < maxPages) {
      if (!activeJobRefs.get(jobId)) break; // cancelled

      const pageUrl = queue.shift()!;
      const page = await scrapePage(pageUrl);
      doneCount++;

      // Update favicon from first successful page
      if (!currentJob.favicon && page.favicon) {
        currentJob.favicon = page.favicon;
      }
      if (currentJob.siteName === new URL(rootUrl).hostname && page.title) {
        // keep hostname as site name (cleaner)
      }

      currentJob = {
        ...currentJob,
        pages: [...currentJob.pages, page],
        donePages: doneCount,
        status: "running",
      };

      upsertJob(currentJob);

      // Add new links to queue
      if (page.status === "success") {
        for (const link of page.links) {
          if (!visited.has(link) && doneCount + queue.length < maxPages) {
            visited.add(link);
            queue.push(link);
          }
        }
      }

      // Small delay to avoid hammering the proxy
      await new Promise((r) => setTimeout(r, 300));
    }

    // Finalize
    currentJob = {
      ...currentJob,
      status: "done",
      finishedAt: new Date().toISOString(),
      totalPages: doneCount,
      donePages: doneCount,
    };

    upsertJob(currentJob);
    activeJobRefs.delete(jobId);
    setJobs(loadJobs());
  };

  const handleDelete = (id: string) => {
    activeJobRefs.set(id, false); // stop if running
    deleteJob(id);
    setJobs(loadJobs());
    if (viewingJob?.id === id) setViewingJob(null);
  };

  const handleView = (job: ArchiveJob) => {
    // Get latest version of job
    const latest = loadJobs().find((j) => j.id === job.id) ?? job;
    setViewingJob(latest);
  };

  const handleExport = (job: ArchiveJob) => {
    const data = JSON.stringify(job, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `webarshiv_${job.siteName}_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredJobs = jobs.filter(
    (j) =>
      j.siteName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.rootUrl.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Stats
  const totalPages = jobs.reduce((a, j) => a + j.pages.filter(p => p.status === "success").length, 0);
  const totalSize = jobs.reduce(
    (a, j) => a + j.pages.reduce((b, p) => b + p.size, 0),
    0
  );
  const totalImages = jobs.reduce(
    (a, j) => a + j.pages.reduce((b, p) => b + p.images.length, 0),
    0
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Modals */}
      {showModal && (
        <NewArchiveModal
          onClose={() => setShowModal(false)}
          onStart={handleStart}
        />
      )}
      {viewingJob && (
        <ArchiveViewer
          job={viewingJob}
          onClose={() => setViewingJob(null)}
        />
      )}

      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Archive className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-lg leading-tight">WebArşiv</h1>
              <p className="text-gray-500 text-xs">Site Kopyalama & Arşivleme</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Arşivlerde ara..."
                className="bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 w-52"
              />
            </div>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-semibold rounded-xl transition-colors shadow-lg shadow-cyan-500/20"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Yeni Arşiv</span>
              <span className="sm:hidden">Ekle</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: "Arşivlenen Site",
              value: jobs.length,
              Icon: Globe,
              color: "text-cyan-400",
              bg: "bg-cyan-500/10 border-cyan-500/20",
            },
            {
              label: "Toplam Sayfa",
              value: totalPages,
              Icon: FileText,
              color: "text-purple-400",
              bg: "bg-purple-500/10 border-purple-500/20",
            },
            {
              label: "Toplam Resim",
              value: totalImages,
              Icon: Database,
              color: "text-green-400",
              bg: "bg-green-500/10 border-green-500/20",
            },
            {
              label: "Toplam Boyut",
              value: formatBytes(totalSize),
              Icon: HardDrive,
              color: "text-orange-400",
              bg: "bg-orange-500/10 border-orange-500/20",
            },
          ].map(({ label, value, Icon, color, bg }) => (
            <div
              key={label}
              className={`bg-gray-900 border rounded-2xl p-4 flex items-center gap-4 ${bg}`}
            >
              <div className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${bg}`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className={`font-bold text-xl ${color}`}>{value}</p>
                <p className="text-gray-500 text-xs">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Job Grid */}
        {filteredJobs.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-20 h-20 rounded-2xl bg-gray-900 border border-gray-700 flex items-center justify-center mx-auto mb-6">
              <Archive className="w-10 h-10 text-gray-600" />
            </div>
            <h2 className="text-white font-semibold text-xl mb-2">
              {searchQuery ? "Sonuç bulunamadı" : "Henüz arşiv yok"}
            </h2>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              {searchQuery
                ? `"${searchQuery}" için eşleşen arşiv bulunamadı.`
                : "\"Yeni Arşiv\" butonuna basarak herhangi bir sitenin URL'sini gir ve tüm içeriğini kopyala."}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-semibold rounded-xl transition-colors"
              >
                <Plus className="w-5 h-5" />
                İlk Arşivi Başlat
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onView={handleView}
                onDelete={handleDelete}
                onExport={handleExport}
              />
            ))}
          </div>
        )}

        {/* How to Use */}
        {jobs.length === 0 && (
          <div className="mt-12 bg-gray-900 border border-gray-700 rounded-2xl p-6">
            <h3 className="text-white font-semibold text-base mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5 text-cyan-400" />
              Nasıl Kullanılır?
            </h3>
            <div className="grid md:grid-cols-4 gap-4">
              {[
                {
                  step: "1",
                  title: "URL Gir",
                  desc: "Arşivlemek istediğin sitenin ana sayfasının URL'sini gir. Örn: tumblr, blogspot...",
                  color: "bg-cyan-500",
                },
                {
                  step: "2",
                  title: "Tarama Başlar",
                  desc: "Uygulama otomatik olarak tüm alt sayfaları tarar ve içerikleri indirir.",
                  color: "bg-blue-500",
                },
                {
                  step: "3",
                  title: "Arşiv Kaydedilir",
                  desc: "HTML, resimler, linkler ve metinler tarayıcının yerel belleğine kaydedilir.",
                  color: "bg-purple-500",
                },
                {
                  step: "4",
                  title: "Offline Eriş",
                  desc: "Site kapansa bile arşivini aç, sayfaları görüntüle, JSON olarak dışa aktar.",
                  color: "bg-green-500",
                },
              ].map(({ step, title, desc, color }) => (
                <div key={step} className="flex gap-3">
                  <div
                    className={`w-7 h-7 rounded-full ${color} flex items-center justify-center text-white font-bold text-sm shrink-0 mt-0.5`}
                  >
                    {step}
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">{title}</p>
                    <p className="text-gray-400 text-xs mt-1 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-6 px-6 mt-8">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-gray-600 text-xs">
          <div className="flex items-center gap-2">
            <Archive className="w-3.5 h-3.5" />
            <span>WebArşiv – Site Kopyalama & Arşivleme Aracı</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <HardDrive className="w-3 h-3" />
              Veriler tarayıcı localStorage'ında saklanır
            </span>
            <span>•</span>
            <span>CORS Proxy: allorigins.win / corsproxy.io</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
