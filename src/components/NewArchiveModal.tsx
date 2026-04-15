import { useState } from "react";
import { X, Globe, Info } from "lucide-react";

interface Props {
  onClose: () => void;
  onStart: (url: string, maxPages: number) => void;
}

export default function NewArchiveModal({ onClose, onStart }: Props) {
  const [url, setUrl] = useState("");
  const [maxPages, setMaxPages] = useState(30);
  const [error, setError] = useState("");

  const handleStart = () => {
    setError("");
    let trimmed = url.trim();
    if (!trimmed) {
      setError("Lütfen bir URL girin.");
      return;
    }
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      trimmed = "https://" + trimmed;
    }
    try {
      new URL(trimmed);
    } catch {
      setError("Geçersiz URL formatı.");
      return;
    }
    onStart(trimmed, maxPages);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
              <Globe className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold text-lg">Yeni Site Arşivi</h2>
              <p className="text-gray-400 text-sm">URL girerek siteyi arşivle</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {/* URL Input */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Site URL'si
            </label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
                placeholder="https://minorityreport0.tumblr.com/"
                className="w-full bg-gray-800 border border-gray-600 rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all"
              />
            </div>
            {error && (
              <p className="text-red-400 text-sm mt-1.5">{error}</p>
            )}
          </div>

          {/* Max Pages */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Maksimum Sayfa Sayısı:{" "}
              <span className="text-cyan-400 font-bold">{maxPages}</span>
            </label>
            <input
              type="range"
              min={1}
              max={200}
              value={maxPages}
              onChange={(e) => setMaxPages(Number(e.target.value))}
              className="w-full accent-cyan-500"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1 sayfa</span>
              <span>200 sayfa</span>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex gap-3">
            <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-300 space-y-1">
              <p className="font-medium">Nasıl çalışır?</p>
              <ul className="text-blue-400 space-y-0.5 list-disc list-inside">
                <li>Verdiğin URL'den başlayarak sayfaları tarar</li>
                <li>Aynı domain'deki linkleri takip eder</li>
                <li>HTML, başlık, açıklama, resimler ve linkleri kaydeder</li>
                <li>Tarayıcının yerel belleğine (localStorage) arşivler</li>
                <li>Site kapansa bile arşivi görüntüleyebilirsin</li>
              </ul>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 flex gap-3">
            <Info className="w-4 h-4 text-yellow-400 mt-0.5 shrink-0" />
            <p className="text-sm text-yellow-300">
              <span className="font-medium">CORS Notu:</span> Tarayıcı güvenlik
              kısıtlamaları nedeniyle bazı siteler (özellikle JS-render gerektirenler)
              kısmen veya hiç çekilemeyebilir. Tumblr ve Blogspot genellikle çalışır.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 pt-0 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-600 text-gray-300 hover:bg-gray-800 transition-colors"
          >
            İptal
          </button>
          <button
            onClick={handleStart}
            className="flex-1 px-4 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-gray-900 font-semibold transition-colors flex items-center justify-center gap-2"
          >
            <Globe className="w-4 h-4" />
            Arşivlemeye Başla
          </button>
        </div>
      </div>
    </div>
  );
}
