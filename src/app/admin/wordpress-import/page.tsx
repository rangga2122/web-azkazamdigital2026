"use client";

import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  FaCloudDownloadAlt,
  FaExternalLinkAlt,
  FaGlobe,
  FaLink,
  FaMagic,
  FaRedoAlt,
  FaSave,
} from "react-icons/fa";

type ImportTarget = {
  url: string;
  slug: string;
  sourceType: "page" | "product";
  importable: boolean;
  reason?: string;
  title?: string;
};

type ImportResult = {
  url: string;
  slug?: string;
  pageId?: string;
  title?: string;
  status: "created" | "updated" | "skipped" | "failed";
  reason?: string;
  error?: string;
  imageCount?: number;
  productId?: string | null;
};

const DEFAULT_WORDPRESS_URL = "https://www.azkazamdigital.com";

export default function AdminWordpressImportPage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_WORDPRESS_URL);
  const [targets, setTargets] = useState<ImportTarget[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [publishStatus, setPublishStatus] = useState<"draft" | "published">(
    "draft"
  );
  const [results, setResults] = useState<ImportResult[]>([]);

  const importableTargets = useMemo(
    () => targets.filter((target) => target.importable),
    [targets]
  );

  const selectedCount = selectedUrls.length;

  async function handleDiscover() {
    if (!baseUrl.trim()) {
      toast.error("URL WordPress wajib diisi.");
      return;
    }

    setLoading(true);
    setResults([]);

    try {
      const response = await fetch("/api/admin/wordpress-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "discover",
          baseUrl,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Gagal membaca sitemap WordPress.");
      }

      const discoveredTargets = (payload.targets || []) as ImportTarget[];
      setTargets(discoveredTargets);
      setSelectedUrls(
        discoveredTargets
          .filter((target) => target.importable)
          .map((target) => target.url)
      );

      toast.success(
        `${discoveredTargets.filter((target) => target.importable).length} halaman siap diimport.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal membaca sitemap WordPress."
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleImport(urls: string[]) {
    if (urls.length === 0) {
      toast.error("Pilih minimal satu halaman untuk diimport.");
      return;
    }

    setImporting(true);

    try {
      const response = await fetch("/api/admin/wordpress-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "import",
          urls,
          status: publishStatus,
          overwrite,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Gagal import halaman WordPress.");
      }

      const importResults = (payload.results || []) as ImportResult[];
      setResults(importResults);

      const successCount = importResults.filter(
        (result) => result.status === "created" || result.status === "updated"
      ).length;
      const failedCount = importResults.filter(
        (result) => result.status === "failed"
      ).length;

      if (successCount > 0) {
        toast.success(`${successCount} halaman berhasil diimport.`);
      }

      if (failedCount > 0) {
        toast.error(`${failedCount} halaman gagal diimport. Cek hasil di bawah.`);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal import halaman WordPress."
      );
    } finally {
      setImporting(false);
    }
  }

  function toggleSelection(url: string) {
    setSelectedUrls((current) =>
      current.includes(url)
        ? current.filter((item) => item !== url)
        : [...current, url]
    );
  }

  function selectAllImportable() {
    setSelectedUrls(importableTargets.map((target) => target.url));
  }

  function clearSelection() {
    setSelectedUrls([]);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Import WordPress</h1>
          <p className="mt-2 max-w-3xl text-sm text-dark-400">
            Scan sitemap WordPress lama, ambil landing page yang bisa dipakai,
            lalu import HTML beserta gambar ke CMS aplikasi ini. Halaman hasil
            import otomatis disimpan sebagai halaman CMS dan gambar diupload ke
            folder media lokal.
          </p>
        </div>
        <div className="rounded-full border border-primary-500/20 bg-primary-500/10 px-4 py-2 text-xs font-semibold text-primary-400">
          Cocok untuk migrasi landing page HTML satu file
        </div>
      </div>

      <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-2 block text-sm font-medium text-dark-300">
              URL WordPress Lama
            </label>
            <div className="flex items-center gap-3 rounded-xl border border-dark-700 bg-dark-800 px-4 py-3">
              <FaGlobe className="text-primary-400" />
              <input
                type="url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                className="w-full bg-transparent text-white outline-none"
                placeholder="https://www.azkazamdigital.com"
              />
            </div>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleDiscover}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FaLink size={12} />
              {loading ? "Scanning..." : "Scan Sitemap"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-xl border border-dark-700 bg-dark-850 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-dark-500">
              Kandidat
            </div>
            <div className="mt-2 text-2xl font-bold text-white">
              {targets.length}
            </div>
          </div>
          <div className="rounded-xl border border-dark-700 bg-dark-850 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-dark-500">
              Siap Import
            </div>
            <div className="mt-2 text-2xl font-bold text-emerald-400">
              {importableTargets.length}
            </div>
          </div>
          <div className="rounded-xl border border-dark-700 bg-dark-850 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-dark-500">
              Terpilih
            </div>
            <div className="mt-2 text-2xl font-bold text-primary-400">
              {selectedCount}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">
              Pengaturan Import
            </h2>
            <p className="mt-1 text-sm text-dark-400">
              Secara default hasil import dibuat sebagai draft dan header/footer
              disembunyikan agar landing page lama tetap rapi saat dibuka.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={publishStatus}
              onChange={(event) =>
                setPublishStatus(event.target.value as "draft" | "published")
              }
              className="rounded-xl border border-dark-700 bg-dark-800 px-4 py-2.5 text-sm text-white outline-none"
            >
              <option value="draft">Simpan sebagai draft</option>
              <option value="published">Langsung publish</option>
            </select>
            <label className="flex items-center gap-2 rounded-xl border border-dark-700 bg-dark-800 px-4 py-2.5 text-sm text-dark-300">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(event) => setOverwrite(event.target.checked)}
              />
              Overwrite jika slug sudah ada
            </label>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={selectAllImportable}
            disabled={importableTargets.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-dark-700 bg-dark-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-dark-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FaMagic size={12} />
            Pilih Semua
          </button>
          <button
            type="button"
            onClick={clearSelection}
            disabled={selectedCount === 0}
            className="inline-flex items-center gap-2 rounded-xl border border-dark-700 bg-dark-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-dark-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FaRedoAlt size={12} />
            Kosongkan Pilihan
          </button>
          <button
            type="button"
            onClick={() => handleImport(selectedUrls)}
            disabled={importing || selectedCount === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 px-5 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <FaCloudDownloadAlt size={13} />
            {importing ? "Importing..." : `Import ${selectedCount} Halaman`}
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-dark-900 border border-dark-800 overflow-hidden">
        <div className="border-b border-dark-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">
            Kandidat Halaman WordPress
          </h2>
        </div>

        {targets.length === 0 ? (
          <div className="px-6 py-14 text-center text-dark-500">
            Belum ada hasil scan. Mulai dari tombol <span className="text-primary-400">Scan Sitemap</span>.
          </div>
        ) : (
          <div className="divide-y divide-dark-800">
            {targets.map((target) => {
              const isSelected = selectedUrls.includes(target.url);
              return (
                <div
                  key={target.url}
                  className="flex flex-col gap-4 px-6 py-4 lg:flex-row lg:items-start lg:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                          target.sourceType === "product"
                            ? "bg-violet-500/15 text-violet-300"
                            : "bg-sky-500/15 text-sky-300"
                        }`}
                      >
                        {target.sourceType}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          target.importable
                            ? "bg-emerald-500/15 text-emerald-300"
                            : "bg-dark-700 text-dark-400"
                        }`}
                      >
                        {target.importable ? "siap import" : "skip"}
                      </span>
                    </div>
                    <div className="mt-3 text-base font-semibold text-white">
                      {target.title || target.slug || target.url}
                    </div>
                    <div className="mt-1 text-xs text-dark-500">/{target.slug}</div>
                    <div className="mt-2 break-all text-sm text-dark-400">
                      {target.url}
                    </div>
                    {!target.importable && target.reason ? (
                      <div className="mt-2 text-xs text-amber-400">
                        Dilewati otomatis: {target.reason}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <a
                      href={target.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-dark-700 bg-dark-800 px-3 py-2 text-sm text-white transition-colors hover:bg-dark-700"
                    >
                      <FaExternalLinkAlt size={11} />
                      Buka
                    </a>

                    {target.importable ? (
                      <>
                        <label className="inline-flex items-center gap-2 rounded-xl border border-dark-700 bg-dark-800 px-3 py-2 text-sm text-dark-200">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelection(target.url)}
                          />
                          Pilih
                        </label>
                        <button
                          type="button"
                          onClick={() => handleImport([target.url])}
                          disabled={importing}
                          className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <FaSave size={11} />
                          Import
                        </button>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-dark-900 border border-dark-800 overflow-hidden">
        <div className="border-b border-dark-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-white">Hasil Import</h2>
        </div>

        {results.length === 0 ? (
          <div className="px-6 py-12 text-center text-dark-500">
            Belum ada proses import yang dijalankan.
          </div>
        ) : (
          <div className="divide-y divide-dark-800">
            {results.map((result) => (
              <div
                key={`${result.url}-${result.slug || "unknown"}`}
                className="flex flex-col gap-2 px-6 py-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                      result.status === "created"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : result.status === "updated"
                        ? "bg-sky-500/15 text-sky-300"
                        : result.status === "skipped"
                        ? "bg-amber-500/15 text-amber-300"
                        : "bg-red-500/15 text-red-300"
                    }`}
                  >
                    {result.status}
                  </span>
                  {result.slug ? (
                    <span className="text-sm font-medium text-white">
                      /{result.slug}
                    </span>
                  ) : null}
                  {typeof result.imageCount === "number" ? (
                    <span className="text-xs text-dark-500">
                      {result.imageCount} gambar diambil
                    </span>
                  ) : null}
                </div>
                <div className="text-sm text-dark-300">
                  {result.title || result.url}
                </div>
                {result.error ? (
                  <div className="text-sm text-red-400">{result.error}</div>
                ) : null}
                {result.reason ? (
                  <div className="text-sm text-amber-400">{result.reason}</div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
