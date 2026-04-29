"use client";

import { useEffect, useState } from "react";
import { AdminCollectionToolbar } from "@/components/admin/AdminCollectionToolbar";
import { triggerAdminRevalidation } from "@/lib/admin-revalidate";
import {
  compareAdminDates,
  compareAdminNumbers,
  compareAdminStrings,
  matchesAdminSearch,
} from "@/lib/admin-collections";
import { copyTextToClipboard } from "@/lib/client-clipboard";
import { createClient } from "@/lib/supabase/client";
import { formatDate, getStatusColor, getStatusLabel } from "@/lib/utils";
import { FaCopy, FaPlus, FaEdit, FaTrash, FaSave, FaTimes, FaUpload, FaEye } from "react-icons/fa";
import toast from "react-hot-toast";
import type { Page, Product } from "@/types";

export default function AdminPagesPage() {
  const [pages, setPages] = useState<Page[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Page | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generatingSeo, setGeneratingSeo] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("manual");
  const [form, setForm] = useState({
    title: "", slug: "", content_html: "", featured_image: "",
    seo_title: "", seo_description: "", status: "draft", sort_order: 0,
    product_id: "", hide_header_footer: false,
  });

  useEffect(() => { void loadPages(); }, []);

  async function loadPages() {
    const supabase = createClient();
    const [{ data }, { data: productData }] = await Promise.all([
      supabase.from("pages").select("*, product:products!pages_product_id_fkey(id,title,slug,thumbnail_url,price,affiliate_commission_rate)").order("sort_order"),
      supabase.from("products").select("*").eq("is_active", true).order("title"),
    ]);
    setPages((data || []) as Page[]);
    setProducts((productData || []) as Product[]);
    setLoading(false);
  }

  function startCreate() {
    setCreating(true);
    setEditing(null);
    setForm({ title: "", slug: "", content_html: "", featured_image: "", seo_title: "", seo_description: "", status: "draft", sort_order: 0, product_id: "", hide_header_footer: false });
  }

  function startEdit(page: Page) {
    setEditing(page);
    setCreating(false);
    setForm({
      title: page.title, slug: page.slug, content_html: page.content_html || "",
      featured_image: page.featured_image || "",
      seo_title: page.seo_title || "", seo_description: page.seo_description || "",
      status: page.status, sort_order: page.sort_order,
      product_id: page.product_id || "",
      hide_header_footer: page.hide_header_footer || false,
    });
  }

  function cancel() { setEditing(null); setCreating(false); }

  async function handleSave() {
    if (!form.title || !form.slug) { toast.error("Judul dan slug wajib diisi."); return; }
    const supabase = createClient();
    const previousSlug = editing?.slug || "";
    const payload = {
      ...form,
      product_id: form.product_id || null,
    };

    if (creating) {
      const { error } = await supabase.from("pages").insert(payload);
      if (error) { toast.error(error.message); return; }
      toast.success("Halaman berhasil dibuat!");
    } else if (editing) {
      const { error } = await supabase.from("pages").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Halaman berhasil diperbarui!");
    }
    await triggerAdminRevalidation({
      tags: ["public-pages"],
      paths: compactPaths([`/${previousSlug}`, `/${payload.slug}`]),
    });
    cancel();
    await loadPages();
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus halaman ini?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("pages").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Halaman berhasil dihapus!");
    const deletedPage = pages.find((page) => page.id === id);
    await triggerAdminRevalidation({
      tags: ["public-pages"],
      paths: compactPaths([deletedPage ? `/${deletedPage.slug}` : ""]),
    });
    await loadPages();
  }

  async function handleImportHtml(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setForm((current) => ({ ...current, content_html: text }));
    toast.success("File HTML berhasil diimport!");
  }

  async function handleGenerateSeo() {
    if (!form.content_html.trim()) {
      toast.error("Isi atau impor HTML dulu agar AI punya acuan.");
      return;
    }

    setGeneratingSeo(true);

    try {
      const response = await fetch("/api/admin/pages/seo-suggestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: form.title,
          slug: form.slug,
          contentHtml: form.content_html,
          productTitle: selectedProduct?.title || "",
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | {
            suggestions?: {
              seoTitle?: string;
              seoDescription?: string;
              summary?: string;
            };
            error?: string;
          }
        | null;

      if (!response.ok || !payload?.suggestions) {
        throw new Error(
          payload?.error || "Gagal membuat saran SEO halaman dengan AI."
        );
      }

      setForm((current) => ({
        ...current,
        seo_title: payload.suggestions?.seoTitle || current.seo_title,
        seo_description:
          payload.suggestions?.seoDescription || current.seo_description,
      }));

      toast.success(
        payload.suggestions.summary
          ? `SEO terisi. ${payload.suggestions.summary}`
          : "Judul SEO dan deskripsi SEO berhasil dibuat."
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal membuat saran SEO halaman dengan AI."
      );
    } finally {
      setGeneratingSeo(false);
    }
  }

  const selectedProduct = products.find((product) => product.id === form.product_id);

  function getPageUrl(slug = form.slug) {
    return slug.trim() ? `/${slug.trim()}` : "";
  }

  function getCheckoutUrl(product = selectedProduct) {
    return product ? `/order/${product.slug}` : "";
  }

  async function copyUrl(path: string, message: string) {
    if (!path) {
      toast.error("Pilih produk atau isi slug dulu.");
      return;
    }

    try {
      await copyTextToClipboard(`${window.location.origin}${path}`);
      toast.success(message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal menyalin tautan."
      );
    }
  }

  const filteredPages = pages
    .filter((page) => {
      if (statusFilter !== "all" && page.status !== statusFilter) return false;
      return matchesAdminSearch(
        searchQuery,
        page.title,
        page.slug,
        page.status,
        page.product?.title
      );
    })
    .sort((left, right) => {
      switch (sortBy) {
        case "newest-created":
          return compareAdminDates(left.created_at, right.created_at, "desc");
        case "oldest-created":
          return compareAdminDates(left.created_at, right.created_at, "asc");
        case "updated":
          return compareAdminDates(left.updated_at, right.updated_at, "desc");
        case "alpha":
          return compareAdminStrings(left.title, right.title);
        case "manual":
        default:
          return compareAdminNumbers(left.sort_order, right.sort_order, "asc");
      }
    });

  if (editing || creating) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">{creating ? "Tambah Halaman" : "Ubah Halaman"}</h1>
          <button onClick={cancel} className="flex items-center gap-2 px-4 py-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800 transition-all"><FaTimes /> Batal</button>
        </div>
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Judul *</label>
              <input type="text" value={form.title} onChange={(e) => setForm({...form, title: e.target.value, slug: form.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/g, '')})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Slug *</label>
              <input type="text" value={form.slug} onChange={(e) => setForm({...form, slug: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-dark-300">Konten HTML</label>
              <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent-500/20 text-accent-400 hover:bg-accent-500/30 cursor-pointer transition-colors">
                <FaUpload size={10} /> Impor HTML
                <input type="file" accept=".html,.htm" onChange={handleImportHtml} className="hidden" />
              </label>
            </div>
            <textarea value={form.content_html} onChange={(e) => setForm({...form, content_html: e.target.value})} rows={15} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white font-mono text-sm focus:outline-none focus:border-primary-500/50 resize-y" placeholder="<h1>Judul</h1><p>Konten halaman...</p>" />
          </div>
          <div className="rounded-xl bg-dark-800 border border-dark-700 p-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Hubungkan ke Produk</label>
                <select value={form.product_id} onChange={(e) => setForm({...form, product_id: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-900 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50">
                  <option value="">Tidak dihubungkan</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.title}
                    </option>
                  ))}
                </select>
                {selectedProduct && (
                  <div className="mt-3 flex items-center gap-3 rounded-xl bg-dark-900 border border-dark-700 p-3">
                    {selectedProduct.thumbnail_url ? (
                      <img src={selectedProduct.thumbnail_url} alt={selectedProduct.title} className="h-12 w-12 rounded-lg object-cover bg-dark-950" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-dark-950 text-xs font-bold text-dark-400">
                        {selectedProduct.title.charAt(0)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">{selectedProduct.title}</div>
                      <div className="text-xs text-dark-500">/order/{selectedProduct.slug}</div>
                    </div>
                  </div>
                )}
              </div>
              <label className="flex items-center gap-3 rounded-xl bg-dark-900 border border-dark-700 px-4 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.hide_header_footer}
                  onChange={(e) => setForm({...form, hide_header_footer: e.target.checked})}
                />
                <span className="text-sm text-dark-300">
                  Sembunyikan header dan footer
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="rounded-lg bg-dark-900 border border-dark-700 p-3">
                <div className="text-dark-400 text-xs mb-2">Link Halaman LP Ini</div>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-dark-950 border border-dark-800 px-3 py-2 text-primary-300 text-xs">
                    {getPageUrl() || "Isi slug halaman dulu"}
                  </code>
                  <button type="button" onClick={() => copyUrl(getPageUrl(), "Link halaman disalin!")} className="p-2 rounded-lg bg-primary-500/20 text-primary-400 hover:bg-primary-500/30">
                    <FaCopy size={12} />
                  </button>
                </div>
              </div>
              <div className="rounded-lg bg-dark-900 border border-dark-700 p-3">
                <div className="text-dark-400 text-xs mb-2">Checkout Form Produk</div>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-md bg-dark-950 border border-dark-800 px-3 py-2 text-accent-300 text-xs">
                    {getCheckoutUrl() || "Pilih produk dulu"}
                  </code>
                  <button type="button" onClick={() => copyUrl(getCheckoutUrl(), "Link checkout produk disalin!")} className="p-2 rounded-lg bg-accent-500/20 text-accent-400 hover:bg-accent-500/30">
                    <FaCopy size={12} />
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-dark-500">
              Untuk HTML, tombol pesan bisa pakai <code className="text-primary-300">{"{{CHECKOUT_URL}}"}</code>. Jika afiliasi memakai halaman ini, sistem otomatis menambahkan kode referral.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-dark-300">Judul SEO</label>
                <button
                  type="button"
                  onClick={handleGenerateSeo}
                  disabled={generatingSeo}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary-500/15 px-3 py-1.5 text-xs font-semibold text-primary-300 transition-colors hover:bg-primary-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <FaUpload size={10} />
                  {generatingSeo ? "Generating..." : "Generate SEO AI"}
                </button>
              </div>
              <input type="text" value={form.seo_title} onChange={(e) => setForm({...form, seo_title: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Deskripsi SEO</label>
              <input type="text" value={form.seo_description} onChange={(e) => setForm({...form, seo_description: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Status</label>
              <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50">
                <option value="draft">Draf</option>
                <option value="published">Diterbitkan</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Urutan</label>
              <input type="number" value={form.sort_order} onChange={(e) => setForm({...form, sort_order: parseInt(e.target.value) || 0})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">URL Gambar Utama</label>
            <input type="text" value={form.featured_image} onChange={(e) => setForm({...form, featured_image: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" placeholder="/uploads/pages/image.jpg" />
          </div>
          <button onClick={handleSave} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 text-white font-bold shadow-lg transition-all hover:scale-[1.02]">
            <FaSave /> Simpan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">CMS Halaman</h1>
        <button onClick={startCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors">
          <FaPlus size={12} /> Tambah Halaman
        </button>
      </div>
      <AdminCollectionToolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Cari judul, slug, produk terkait, atau status halaman..."
        selects={[
          {
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { label: "Semua status", value: "all" },
              { label: "Draf", value: "draft" },
              { label: "Diterbitkan", value: "published" },
            ],
          },
          {
            label: "Urutkan",
            value: sortBy,
            onChange: setSortBy,
            options: [
              { label: "Urutan manual", value: "manual" },
              { label: "Pembuatan terbaru", value: "newest-created" },
              { label: "Pembuatan terlama", value: "oldest-created" },
              { label: "Terbaru diubah", value: "updated" },
              { label: "Judul A-Z", value: "alpha" },
            ],
          },
        ]}
        summary={`${filteredPages.length} dari ${pages.length} halaman`}
      />

      {loading ? (
        <div className="text-dark-400">Memuat...</div>
      ) : filteredPages.length === 0 ? (
        <div className="text-center py-16 text-dark-500">Tidak ada halaman yang cocok.</div>
      ) : (
        <div className="rounded-2xl bg-dark-900 border border-dark-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700 bg-dark-850">
                  <th className="text-left text-dark-400 py-3 px-4">Judul</th>
                  <th className="text-left text-dark-400 py-3 px-4">Slug</th>
                  <th className="text-left text-dark-400 py-3 px-4">Status</th>
                  <th className="text-left text-dark-400 py-3 px-4">Produk</th>
                  <th className="text-left text-dark-400 py-3 px-4">Tanggal</th>
                  <th className="text-right text-dark-400 py-3 px-4">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredPages.map((page) => (
                  <tr key={page.id} className="border-b border-dark-800 hover:bg-dark-800/50">
                    <td className="py-3 px-4 text-white font-medium">{page.title}</td>
                    <td className="py-3 px-4 text-dark-400 font-mono text-xs">/{page.slug}</td>
                    <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${getStatusColor(page.status)}`}>{getStatusLabel(page.status)}</span></td>
                    <td className="py-3 px-4">
                      {page.product ? (
                        <div className="flex items-center gap-3">
                          {page.product.thumbnail_url ? (
                            <img src={page.product.thumbnail_url} alt={page.product.title} className="h-10 w-10 rounded-lg object-cover bg-dark-950" />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dark-800 text-xs font-bold text-dark-400">
                              {page.product.title.charAt(0)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="truncate text-sm text-white">{page.product.title}</div>
                            <div className="text-xs text-dark-500">/order/{page.product.slug}</div>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-dark-400">-</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-dark-400">{formatDate(page.created_at)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a href={`/${page.slug}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-dark-400 hover:text-accent-400 hover:bg-accent-500/10 transition-all" title="Lihat Halaman"><FaEye size={14} /></a>
                        <button onClick={() => startEdit(page)} className="p-2 rounded-lg text-dark-400 hover:text-primary-400 hover:bg-primary-500/10 transition-all"><FaEdit size={14} /></button>
                        <button onClick={() => handleDelete(page.id)} className="p-2 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-all"><FaTrash size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function compactPaths(paths: string[]) {
  return paths.filter(Boolean);
}
