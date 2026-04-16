import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Database,
  Globe,
  HardDrive,
  FileText,
  Search,
  Archive,
  Cloud,
  CloudDownload,
  RefreshCw,
} from "lucide-react";
import type { ArchiveJob } from "./types";
import { loadJobs, upsertJob, deleteJob, formatBytes, saveJobs } from "./store";
import { scrapePage } from "./scraper";
import {
  deleteJobFromCloud,
  downloadJobFromCloud,
  isCloudConfigured,
  listCloudJobIds,
  uploadJobToCloud,
} from "./cloud";
import NewArchiveModal from "./components/NewArchiveModal";
import JobCard from "./components/JobCard";
import ArchiveViewer from "./components/ArchiveViewer";

const activeJobRefs = new Map<string, boolean>();

const cloudReady = isCloudConfigured();

export default function App() {
  const [jobs, setJobs] = useState<ArchiveJob[]>(() => loadJobs());
  const [showModal, setShowModal] = useState(false);
  const [viewingJob, setViewingJob] = useState<ArchiveJob | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [cloudBusy, setCloudBusy] = useState(false);
  const [cloudMessage, setCloudMessage] = useState("");

  const refreshJobs = useCallback(() => {
    setJobs(loadJobs());
  }, []);

  useEffect(() => {
    const running = jobs.some((j) => j.status === "running");
    if (!running) return;

    const interval = setInterval(refreshJobs, 800);
    return () => clearInterval(interval);
  }, [jobs, refreshJobs]);

  const syncOneJobToCloud = useCallback(
    async (job: ArchiveJob) => {
      if (!cloudReady) return;
      const result = await uploadJobToCloud(job);
      if (result.error) {
        setCloudMessage(`Buluta yukleme hatasi: ${result.error}`);
        return;
      }

      const syncedJob: ArchiveJob = {
        ...job,
        cloudPath: result.path,
        cloudSyncedAt: new Date().toISOString(),
      };
      upsertJob(syncedJob);
      setJobs(loadJobs());
    },
    []
  );

  const handleStart = async (url: string, maxPages: number) => {
    setShowModal(false);

    let rootUrl = url.trim();
    if (!/^https?:\/\//i.test(rootUrl)) {
      rootUrl = `https://${rootUrl}`;
    }

    let hostname = rootUrl;
    try {
      hostname = new URL(rootUrl).hostname;
    } catch {
      alert("Lutfen gecerli bir URL gir.");
      return;
    }

    const jobId = crypto.randomUUID();

    const newJob: ArchiveJob = {
      id: jobId,
      rootUrl,
      siteName: hostname,
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

    const visited = new Set<string>();
    const queue: string[] = [rootUrl];
    visited.add(rootUrl);

    let doneCount = 0;
    let currentJob = { ...newJob };

    while (queue.length > 0 && doneCount < maxPages) {
      if (!activeJobRefs.get(jobId)) break;

      const pageUrl = queue.shift() as string;
      const page = await scrapePage(pageUrl);
      doneCount += 1;

      if (!currentJob.favicon && page.favicon) {
        currentJob.favicon = page.favicon;
      }

      currentJob = {
        ...currentJob,
        pages: [...currentJob.pages, page],
        donePages: doneCount,
        status: "running",
      };

      upsertJob(currentJob);

      if (page.status === "success") {
        for (const link of page.links) {
          if (!visited.has(link) && doneCount + queue.length < maxPages) {
            visited.add(link);
            queue.push(link);
          }
        }
      }

      await new Promise((r) => setTimeout(r, 250));
    }

    const finalizedStatus: ArchiveJob["status"] =
      currentJob.pages.some((p) => p.status === "success") || doneCount > 0
        ? "done"
        : "error";

    currentJob = {
      ...currentJob,
      status: finalizedStatus,
      finishedAt: new Date().toISOString(),
      totalPages: doneCount,
      donePages: doneCount,
      errorMsg:
        finalizedStatus === "error"
          ? "Sayfalar arsivlenemedi. Proxy engeline takilmis olabilir."
          : undefined,
    };

    upsertJob(currentJob);
    activeJobRefs.delete(jobId);
    setJobs(loadJobs());

    if (cloudReady) {
      await syncOneJobToCloud(currentJob);
      setCloudMessage("Arsiv buluta da yedeklendi.");
    }
  };

  const handleDelete = async (id: string) => {
    activeJobRefs.set(id, false);
    deleteJob(id);
    setJobs(loadJobs());
    if (viewingJob?.id === id) setViewingJob(null);

    if (cloudReady) {
      const cloudError = await deleteJobFromCloud(id);
      if (cloudError) {
        setCloudMessage(`Buluttan silme hatasi: ${cloudError}`);
      }
    }
  };

  const handleView = (job: ArchiveJob) => {
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

  const handleSyncSingle = async (job: ArchiveJob) => {
    if (!cloudReady) {
      setCloudMessage("Supabase ayarlari yapilmadigi icin bulut kapali.");
      return;
    }
    setCloudBusy(true);
    setCloudMessage("");
    await syncOneJobToCloud(job);
    setCloudBusy(false);
    setCloudMessage(`${job.siteName} buluta senkronlandi.`);
  };

  const handleSyncAll = async () => {
    if (!cloudReady) {
      setCloudMessage("Supabase ayarlari yapilmadigi icin bulut kapali.");
      return;
    }

    setCloudBusy(true);
    setCloudMessage("");
    const latestJobs = loadJobs();

    for (const job of latestJobs) {
      await syncOneJobToCloud(job);
    }

    setCloudBusy(false);
    setCloudMessage(`${latestJobs.length} arsiv buluta gonderildi.`);
  };

  const handlePullCloud = async () => {
    if (!cloudReady) {
      setCloudMessage("Supabase ayarlari yapilmadigi icin bulut kapali.");
      return;
    }

    setCloudBusy(true);
    setCloudMessage("");

    const listResult = await listCloudJobIds();
    if (listResult.error) {
      setCloudBusy(false);
      setCloudMessage(`Bulut listeleme hatasi: ${listResult.error}`);
      return;
    }

    const merged = new Map(loadJobs().map((job) => [job.id, job]));
    let restoredCount = 0;

    for (const jobId of listResult.ids) {
      const result = await downloadJobFromCloud(jobId);
      if (result.job) {
        merged.set(jobId, result.job);
        restoredCount += 1;
      }
    }

    saveJobs(Array.from(merged.values()));
    setJobs(loadJobs());
    setCloudBusy(false);
    setCloudMessage(`${restoredCount} arsiv buluttan geri yuklendi.`);
  };

  const filteredJobs = jobs.filter(
    (j) =>
      j.siteName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      j.rootUrl.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalPages = jobs.reduce(
    (a, j) => a + j.pages.filter((p) => p.status === "success").length,
    0
  );
  const totalSize = jobs.reduce(
    (a, j) => a + j.pages.reduce((b, p) => b + p.size, 0),
    0
  );
  const totalImages = jobs.reduce(
    (a, j) => a + j.pages.reduce((b, p) => b + p.images.length, 0),
    0
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {showModal && (
        <NewArchiveModal
          onClose={() => setShowModal(false)}
          onStart={handleStart}
        />
      )}
      {viewingJob && (
        <ArchiveViewer job={viewingJob} onClose={() => setViewingJob(null)} />
      )}

      <header className="border-b border-zinc-800 bg-zinc-900/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20">
              <Archive className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-tight text-white">WebArsiv</h1>
              <p className="text-xs text-zinc-500">Site Kopyalama ve Arsivleme</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Arsivlerde ara..."
                className="w-52 rounded-xl border border-zinc-700 bg-zinc-800 py-2 pr-4 pl-9 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <button
              onClick={handlePullCloud}
              disabled={cloudBusy}
              className="inline-flex items-center gap-1 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CloudDownload className="h-4 w-4" />
              <span className="hidden md:inline">Buluttan cek</span>
            </button>
            <button
              onClick={handleSyncAll}
              disabled={cloudBusy}
              className="inline-flex items-center gap-1 rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${cloudBusy ? "animate-spin" : ""}`} />
              <span className="hidden md:inline">Buluta senkronla</span>
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 font-semibold text-zinc-950 transition-colors hover:bg-cyan-400"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Yeni Arsiv</span>
              <span className="sm:hidden">Ekle</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-4 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm text-zinc-300">
          <p className="inline-flex items-center gap-2">
            <Cloud className="h-4 w-4 text-cyan-400" />
            {cloudReady
              ? "Bulut yedek acik. Arsivler Supabase Storage uzerine senkronlanabilir."
              : "Bulut kapali. .env icine VITE_SUPABASE_URL ve VITE_SUPABASE_ANON_KEY eklemelisin."}
          </p>
          {cloudMessage && <p className="text-xs text-cyan-400">{cloudMessage}</p>}
        </div>

        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            {
              label: "Arsivlenen Site",
              value: jobs.length,
              Icon: Globe,
              color: "text-cyan-400",
              bg: "bg-cyan-500/10 border-cyan-500/20",
            },
            {
              label: "Toplam Sayfa",
              value: totalPages,
              Icon: FileText,
              color: "text-violet-400",
              bg: "bg-violet-500/10 border-violet-500/20",
            },
            {
              label: "Toplam Resim",
              value: totalImages,
              Icon: Database,
              color: "text-emerald-400",
              bg: "bg-emerald-500/10 border-emerald-500/20",
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
              className={`flex items-center gap-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 ${bg}`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${bg}`}
              >
                <Icon className={`h-5 w-5 ${color}`} />
              </div>
              <div>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-zinc-500">{label}</p>
              </div>
            </div>
          ))}
        </div>

        {filteredJobs.length === 0 ? (
          <div className="py-24 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900">
              <Archive className="h-10 w-10 text-zinc-600" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-white">
              {searchQuery ? "Sonuc bulunamadi" : "Henuz arsiv yok"}
            </h2>
            <p className="mx-auto mb-6 max-w-md text-zinc-500">
              {searchQuery
                ? `"${searchQuery}" icin eslesen arsiv bulunamadi.`
                : '"Yeni Arsiv" butonuna basip istedigin sitenin URL bilgisini girebilirsin.'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowModal(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-6 py-3 font-semibold text-zinc-900 transition-colors hover:bg-cyan-400"
              >
                <Plus className="h-5 w-5" />
                Ilk Arsivi Baslat
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredJobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onView={handleView}
                onDelete={handleDelete}
                onExport={handleExport}
                onSyncCloud={handleSyncSingle}
                cloudEnabled={cloudReady}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="mt-8 border-t border-zinc-800 px-6 py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 text-xs text-zinc-600 sm:flex-row">
          <div className="flex items-center gap-2">
            <Archive className="h-3.5 w-3.5" />
            <span>WebArsiv - Site Kopyalama ve Arsivleme Araci</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <HardDrive className="h-3 w-3" />
              Tum arsiv icerigi once cihazinda saklanir
            </span>
            <span className="flex items-center gap-1">
              <Cloud className="h-3 w-3" />
              Bulut aciksa Supabase uzerinde yedeklenir
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
