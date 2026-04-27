import { useState, type FormEvent } from "react";
import { X, Globe, Play } from "lucide-react";

interface NewArchiveModalProps {
  onClose: () => void;
  onStart: (url: string, maxPages: number) => void;
}

export default function NewArchiveModal({ onClose, onStart }: NewArchiveModalProps) {
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(20);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    onStart(url.trim(), Math.max(1, Math.min(200, maxPages)));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Yeni Arsiv Baslat</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Bir sitenin URL adresini gir, uygulama sayfalari tarayip arsivlesin.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <label className="block space-y-2">
            <span className="text-sm text-zinc-300">Site URL</span>
            <div className="relative">
              <Globe className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="ornek.com"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 pr-4 pl-9 text-sm text-white placeholder:text-zinc-500 focus:border-cyan-500 focus:outline-none"
                autoFocus
              />
            </div>
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-zinc-300">Maksimum sayfa sayisi</span>
            <input
              type="number"
              min={1}
              max={200}
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value || 1))}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-white focus:border-cyan-500 focus:outline-none"
            />
          </label>

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 transition-colors hover:bg-zinc-800"
            >
              Vazgec
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 font-semibold text-zinc-950 transition-colors hover:bg-cyan-400"
            >
              <Play className="h-4 w-4" />
              Arsivlemeyi Baslat
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}