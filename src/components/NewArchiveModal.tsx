import { useState } from "react";
import { X, Globe, Hash, AlertCircle, Loader2 } from "lucide-react";

interface Props {
  onClose: () => void;
  onStart: (url: string, maxPages: number) => void;
}

const PRESETS = [5, 10, 25, 50, 100];

export default function NewArchiveModal({ onClose, onStart }: Props) {
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(10);
  const [customMax, setCustomMax] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [error, setError] = useState("");

  const validate = (): boolean => {
    setError("");
    const trimmed = url.trim();
    if (!trimmed) {
      setError("Lütfen bir URL girin.");
      return false;
    }
    try {
      const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        setError("Sadece http/https URL'leri desteklenir.");
        return false;
      }
    } catch {
      setError("Geçersiz URL formatı. Örn: https://example.com");
      return false;
    }
    const pages = useCustom ? parseInt(customMax, 10) : maxPages;
    if (!pages || pages < 1 || pages > 500) {
      setError("Sayfa sayısı 1-500 arasında olmalıdır.");
      return false;
    }
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    const trimmed = url.trim();
    const normalized = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    const pages = useCustom ? parseInt(customMax, 10) : maxPages;
    onStart(normalized, pages);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-800">
          <div>
            <h2 className="text-white font-bold text-lg">Yeni Arşiv Başlat</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              Taranacak sitenin URL'sini girin
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          {/* URL Input */}
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2">
              Web Sitesi URL'si
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError("");
                }}
                placeholder="https://example.com"
                autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
            <p className="text-gray-600 text-xs mt-1.5">
              Ana sayfa URL'si — aynı domain'deki alt sayfalar otomatik taranır.
            </p>
          </div>

          {/* Max Pages */}
          <div>
            <label className="block text-gray-300 text-sm font-medium mb-2 flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-gray-500" />
              Maksimum Sayfa Sayısı
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    setMaxPages(p);
                    setUseCustom(false);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                    !useCustom && maxPages === p
                      ? "bg-cyan-500 border-cyan-500 text-gray-900"
                      : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setUseCustom(true)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border ${
                  useCustom
                    ? "bg-cyan-500 border-cyan-500 text-gray-900"
                    : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500"
                }`}
              >
                Özel
              </button>
            </div>
            {useCustom && (
              <input
                type="number"
                value={customMax}
                onChange={(e) => setCustomMax(e.target.value)}
                placeholder="Sayfa sayısı girin (1-500)"
                min={1}
                max={500}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            )}
            <p className="text-gray-600 text-xs mt-1.5">
              Büyük siteler için daha az sayfa seçmeniz önerilir (localStorage sınırı ~5 MB).
            </p>
          </div>

          {/* Warning */}
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex gap-3">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-amber-300/80 text-xs leading-relaxed">
              Tarama işlemi CORS proxy üzerinden gerçekleşir. Bazı siteler proxy erişimini engelleyebilir. İşlem arka planda devam eder.
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 flex gap-3">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-sm font-medium transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
            >
              <Loader2 className="w-4 h-4 hidden" />
              Arşivi Başlat
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
