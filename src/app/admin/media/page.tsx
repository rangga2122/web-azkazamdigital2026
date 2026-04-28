"use client";
import { useCallback, useEffect, useState } from "react";
import { copyTextToClipboard } from "@/lib/client-clipboard";
import { FaExternalLinkAlt, FaUpload, FaCopy, FaImage, FaTrash } from "react-icons/fa";
import toast from "react-hot-toast";

type MediaFile = {
  filename: string;
  file_path: string;
  original_name: string;
  file_size?: number;
  category?: string;
  updated_at?: string;
};

export default function AdminMediaPage() {
  const [uploading, setUploading] = useState(false);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ t: Date.now().toString() });
      if (category !== "all") {
        query.set("category", category);
      }

      const res = await fetch(`/api/upload?${query.toString()}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setMediaFiles(data.files || []);
    } catch {
      toast.error("Gagal memuat media.");
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    void Promise.resolve().then(loadMedia);
  }, [loadMedia]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const uploadedFiles: MediaFile[] = [];

    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("category", category);

      try {
        const res = await fetch("/api/upload", { method: "POST", body: formData });
        const data = await res.json();
        if (data.success) {
          const uploaded = data.file as MediaFile;
          uploadedFiles.push(uploaded);
          setMediaFiles((current) => [
            uploaded,
            ...current.filter((item) => item.file_path !== uploaded.file_path),
          ]);
          toast.success(`${file.name} berhasil diunggah!`);
        } else {
          toast.error(data.error || "Unggah gagal");
        }
      } catch {
        toast.error(`Gagal mengunggah ${file.name}`);
      }
    }

    setUploading(false);
    e.target.value = "";
    if (uploadedFiles.length > 0) {
      void loadMedia();
    }
  }

  async function copyPath(path: string) {
    try {
      await copyTextToClipboard(path);
      toast.success("Tautan disalin!");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal menyalin tautan."
      );
    }
  }

  async function handleDelete(file: MediaFile) {
    if (!confirm(`Hapus gambar ${file.original_name}?`)) return;

    try {
      const res = await fetch("/api/upload", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ file_path: file.file_path }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Gagal menghapus gambar.");
      }

      toast.success("Gambar dihapus!");
      await loadMedia();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Gagal menghapus gambar.";
      toast.error(message);
    }
  }

  function formatFileSize(size?: number) {
    if (!size) return "";
    if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  function formatCategoryLabel(value?: string) {
    const labels: Record<string, string> = {
      general: "Umum",
      products: "Produk",
      banners: "Banner",
      pages: "Halaman",
      site: "Situs",
      testimonials: "Testimoni",
    };
    return value ? labels[value] || value : "";
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Pengelola Media</h1>
        <button
          onClick={loadMedia}
          className="px-3 py-2 rounded-lg bg-dark-800 text-dark-300 text-sm font-semibold hover:text-white"
        >
          Muat Ulang
        </button>
      </div>

      {/* Upload Card */}
      <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 mb-8">
        <div className="flex items-end gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Kategori</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-4 py-2.5 rounded-xl bg-dark-800 border border-dark-700 text-white text-sm focus:outline-none">
              <option value="all">Semua</option>
              <option value="general">Umum</option>
              <option value="products">Produk</option>
              <option value="banners">Banner</option>
              <option value="pages">Halaman</option>
              <option value="site">Situs</option>
              <option value="testimonials">Testimoni</option>
            </select>
          </div>
          <label className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 text-white font-semibold cursor-pointer hover:scale-[1.02] transition-all shadow-lg">
            <FaUpload /> {uploading ? "Mengunggah..." : "Unggah File"}
            <input type="file" accept="image/*" multiple onChange={handleUpload} disabled={uploading} className="hidden" />
          </label>
        </div>
        <p className="text-dark-500 text-xs">Format: JPEG, PNG, GIF, WebP, SVG. Maksimal 5MB per file.</p>
      </div>

      {loading ? (
        <div className="text-dark-400">Memuat media...</div>
      ) : mediaFiles.length > 0 ? (
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-white font-semibold">Galeri Media</h3>
            <span className="text-xs text-dark-500">{mediaFiles.length} file</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-4 gap-4">
            {mediaFiles.map((file) => (
              <div key={file.file_path} className="rounded-xl bg-dark-800 border border-dark-700 overflow-hidden">
                <div className="h-28 bg-dark-900 flex items-center justify-center overflow-hidden">
                  <img
                    src={file.file_path}
                    alt={file.original_name}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="p-3 space-y-3">
                  <div>
                    <div className="text-white text-sm font-medium truncate" title={file.original_name}>
                      {file.original_name}
                    </div>
                    <div className="text-dark-500 text-xs">
                      {[formatCategoryLabel(file.category), formatFileSize(file.file_size)].filter(Boolean).join(" - ")}
                    </div>
                  </div>
                  <div className="rounded-lg bg-dark-900 border border-dark-700 px-3 py-2 text-dark-300 text-xs font-mono break-all">
                    {file.file_path}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyPath(file.file_path)}
                      className="flex flex-1 items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-primary-500/20 text-primary-400 hover:bg-primary-500/30"
                    >
                      <FaCopy size={10} /> Salin Tautan
                    </button>
                    <a
                      href={file.file_path}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center px-3 py-2 rounded-lg text-xs font-semibold bg-dark-700 text-dark-300 hover:text-white"
                      title="Buka gambar"
                    >
                      <FaExternalLinkAlt size={10} />
                    </a>
                    <button
                      onClick={() => handleDelete(file)}
                      className="flex items-center justify-center px-3 py-2 rounded-lg text-xs font-semibold bg-red-500/10 text-red-400 hover:bg-red-500/20"
                      title="Hapus gambar"
                    >
                      <FaTrash size={10} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-16">
          <FaImage className="mx-auto text-4xl text-dark-700 mb-4" />
          <p className="text-dark-500">Belum ada media di kategori ini.</p>
        </div>
      )}
    </div>
  );
}
