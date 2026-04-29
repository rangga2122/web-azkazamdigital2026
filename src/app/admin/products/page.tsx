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
import { formatPrice, getProductCommissionLabel } from "@/lib/utils";
import { FaCopy, FaExternalLinkAlt, FaImage, FaPlus, FaEdit, FaTrash, FaSave, FaTimes, FaEye } from "react-icons/fa";
import toast from "react-hot-toast";
import type { Product, Category, Page } from "@/types";

type MediaFile = {
  filename: string;
  file_path: string;
  original_name: string;
  category?: string;
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: "", slug: "", short_description: "", description_html: "",
    landing_page_mode: "default" as Product["landing_page_mode"],
    landing_page_html: "",
    click_target_type: "checkout" as Product["click_target_type"],
    click_target_page_id: "",
    price: 0, compare_at_price: 0, thumbnail_url: "", banner_url: "",
    affiliate_commission_type: "percent" as Product["affiliate_commission_type"],
    affiliate_commission_rate: 30,
    affiliate_commission_amount: 0,
    is_active: true, is_featured: false, badge: "",
    purchase_url: "", checkout_url: "", demo_url: "", digital_file_url: "",
    seo_title: "", seo_description: "",
  });

  useEffect(() => { void loadData(); }, []);

  async function loadData() {
    const supabase = createClient();
    const [{ data: prods }, { data: cats }, { data: pageData }, media] = await Promise.all([
      supabase.from("products").select("*, click_target_page:pages!products_click_target_page_id_fkey(id,title,slug)").order("created_at", { ascending: false }),
      supabase.from("categories").select("*").order("sort_order"),
      supabase.from("pages").select("*, product:products!pages_product_id_fkey(id,title,slug,thumbnail_url,price,affiliate_commission_rate,affiliate_commission_type,affiliate_commission_amount)").eq("status", "published").order("title"),
      fetch("/api/upload")
        .then((res) => res.json())
        .catch(() => ({ files: [] })),
    ]);
    setProducts((prods || []) as Product[]);
    setCategories((cats || []) as Category[]);
    setPages((pageData || []) as Page[]);
    setMediaFiles(media.files || []);
    setLoading(false);
  }

  function startCreate() {
    setCreating(true); setEditing(null); setSelectedCats([]);
    setForm({ title: "", slug: "", short_description: "", description_html: "", landing_page_mode: "default", landing_page_html: "", click_target_type: "checkout", click_target_page_id: "", price: 0, compare_at_price: 0, thumbnail_url: "", banner_url: "", affiliate_commission_type: "percent", affiliate_commission_rate: 30, affiliate_commission_amount: 0, is_active: true, is_featured: false, badge: "", purchase_url: "", checkout_url: "", demo_url: "", digital_file_url: "", seo_title: "", seo_description: "" });
  }

  async function startEdit(product: Product) {
    setEditing(product); setCreating(false);
    setForm({ title: product.title, slug: product.slug, short_description: product.short_description || "", description_html: product.description_html || "", landing_page_mode: product.landing_page_mode || "default", landing_page_html: product.landing_page_html || "", click_target_type: product.click_target_type || "checkout", click_target_page_id: product.click_target_page_id || "", price: product.price, compare_at_price: product.compare_at_price || 0, thumbnail_url: product.thumbnail_url || "", banner_url: product.banner_url || "", affiliate_commission_type: product.affiliate_commission_type || "percent", affiliate_commission_rate: product.affiliate_commission_rate || 30, affiliate_commission_amount: product.affiliate_commission_amount || 0, is_active: product.is_active, is_featured: product.is_featured, badge: product.badge || "", purchase_url: product.purchase_url || "", checkout_url: product.checkout_url || "", demo_url: product.demo_url || "", digital_file_url: product.digital_file_url || "", seo_title: product.seo_title || "", seo_description: product.seo_description || "" });
    const supabase = createClient();
    const { data } = await supabase.from("product_categories").select("category_id").eq("product_id", product.id);
    setSelectedCats((data || []).map(d => d.category_id));
  }

  async function handleSave() {
    if (!form.title || !form.slug) { toast.error("Nama dan slug wajib."); return; }
    if (form.click_target_type === "cms_page" && !form.click_target_page_id) {
      toast.error("Pilih landing page CMS untuk tujuan produk.");
      return;
    }
    const supabase = createClient();
    const previousTargetPath = editing ? resolveProductTargetPathForProduct(editing) : "";
    const payload = {
      ...form,
      click_target_page_id:
        form.click_target_type === "cms_page" && form.click_target_page_id
          ? form.click_target_page_id
          : null,
    };

    if (creating) {
      const { data, error } = await supabase.from("products").insert(payload).select().single();
      if (error) { toast.error(error.message); return; }
      if (data && selectedCats.length > 0) {
        await supabase.from("product_categories").insert(selectedCats.map(cid => ({ product_id: data.id, category_id: cid })));
      }
      toast.success("Produk berhasil dibuat!");
    } else if (editing) {
      const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
      if (error) { toast.error(error.message); return; }
      await supabase.from("product_categories").delete().eq("product_id", editing.id);
      if (selectedCats.length > 0) {
        await supabase.from("product_categories").insert(selectedCats.map(cid => ({ product_id: editing.id, category_id: cid })));
      }
      toast.success("Produk berhasil diperbarui!");
    }
    await triggerAdminRevalidation({
      tags: ["public-pages"],
      paths: compactPaths([
        previousTargetPath,
        resolvePreviewTargetPath(payload.click_target_type, payload.click_target_page_id, pages, payload.slug),
        `/produk/${payload.slug}`,
        `/order/${payload.slug}`,
      ]),
    });
    setCreating(false); setEditing(null); await loadData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus produk ini?")) return;
    const supabase = createClient();
    await supabase.from("product_categories").delete().eq("product_id", id);
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Produk dihapus!");
    const deletedProduct = products.find((product) => product.id === id);
    await triggerAdminRevalidation({
      tags: ["public-pages"],
      paths: compactPaths([
        deletedProduct ? resolveProductTargetPathForProduct(deletedProduct) : "",
        deletedProduct?.slug ? `/produk/${deletedProduct.slug}` : "",
        deletedProduct?.slug ? `/order/${deletedProduct.slug}` : "",
      ]),
    });
    await loadData();
  }

  function setProductImage(field: "thumbnail_url" | "banner_url", path: string) {
    setForm({ ...form, [field]: path });
    toast.success(field === "thumbnail_url" ? "Thumbnail dipilih!" : "Banner dipilih!");
  }

  function formatMediaCategory(value?: string) {
    const labels: Record<string, string> = {
      general: "Umum",
      products: "Produk",
      banners: "Banner",
      pages: "Halaman",
      site: "Situs",
      testimonials: "Testimoni",
    };

    return value ? labels[value] || value : "Media";
  }

  const selectedTargetPage = pages.find((page) => page.id === form.click_target_page_id);

  function productPath(type: "gateway" | "checkout", slug: string) {
    const cleanSlug = slug.trim();
    if (!cleanSlug) return "";
    return type === "gateway" ? `/produk/${cleanSlug}` : `/order/${cleanSlug}`;
  }

  function resolveProductTargetPath() {
    if (form.click_target_type === "cms_page" && selectedTargetPage?.slug) {
      return `/${selectedTargetPage.slug}`;
    }

    return productPath("checkout", form.slug);
  }

  function resolveProductTargetPathForProduct(product: Product) {
    if (product.click_target_type === "cms_page" && product.click_target_page?.slug) {
      return `/${product.click_target_page.slug}`;
    }

    return productPath("checkout", product.slug);
  }

  async function copyAbsolutePath(path: string, message: string) {
    if (!path) {
      toast.error("Tautan belum tersedia.");
      return;
    }

    const url = `${window.location.origin}${path}`;
    try {
      await copyTextToClipboard(url);
      toast.success(message);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal menyalin tautan."
      );
    }
  }

  function openAbsolutePath(path: string) {
    if (!path) {
      toast.error("Tautan belum tersedia.");
      return;
    }

    window.open(path, "_blank", "noopener,noreferrer");
  }

  const filteredProducts = products
    .filter((product) => {
      if (statusFilter === "active" && !product.is_active) return false;
      if (statusFilter === "inactive" && product.is_active) return false;
      if (statusFilter === "featured" && !product.is_featured) return false;
      return matchesAdminSearch(
        searchQuery,
        product.title,
        product.slug,
        product.short_description,
        product.badge,
        product.click_target_page?.title
      );
    })
    .sort((left, right) => {
      switch (sortBy) {
        case "oldest":
          return compareAdminDates(left.created_at, right.created_at, "asc");
        case "title":
          return compareAdminStrings(left.title, right.title);
        case "price-high":
          return compareAdminNumbers(left.price, right.price, "desc");
        case "price-low":
          return compareAdminNumbers(left.price, right.price, "asc");
        case "newest":
        default:
          return compareAdminDates(left.created_at, right.created_at, "desc");
      }
    });

  if (editing || creating) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">{creating ? "Tambah Produk" : "Ubah Produk"}</h1>
          <button onClick={() => { setEditing(null); setCreating(false); }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800"><FaTimes /> Batal</button>
        </div>
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Nama Produk *</label>
              <input type="text" value={form.title} onChange={(e) => setForm({...form, title: e.target.value, slug: form.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-')})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Slug *</label>
              <input type="text" value={form.slug} onChange={(e) => setForm({...form, slug: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Deskripsi Singkat</label>
            <input type="text" value={form.short_description} onChange={(e) => setForm({...form, short_description: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
          </div>
          <div className="rounded-xl bg-dark-800 border border-dark-700 p-4">
            <div className="mb-3">
              <h3 className="text-white font-semibold">Link siap pakai</h3>
              <p className="text-dark-400 text-sm">Salin link checkout untuk tombol di landing page tunggal atau iklan FB Ads.</p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {[
                { label: "Tujuan Tombol Lihat Produk", path: resolveProductTargetPath(), tone: "primary" as const, copyMessage: "Link tujuan produk disalin!" },
                { label: "Checkout Form", path: productPath("checkout", form.slug), tone: "accent" as const, copyMessage: "Link checkout disalin!" },
              ].map((item) => {
                return (
                  <div key={item.label} className="rounded-lg bg-dark-900 border border-dark-700 p-3">
                    <div className="text-dark-400 text-xs mb-2">{item.label}</div>
                    <div className="flex items-center gap-2">
                      <code className="min-w-0 flex-1 truncate rounded-md bg-dark-950 border border-dark-800 px-3 py-2 text-primary-300 text-xs">
                        {item.path || "Lengkapi target produk dulu"}
                      </code>
                      <button
                        type="button"
                        onClick={() => copyAbsolutePath(item.path, item.copyMessage)}
                        className={`p-2 rounded-lg ${
                          item.tone === "primary"
                            ? "bg-primary-500/20 text-primary-400 hover:bg-primary-500/30"
                            : "bg-accent-500/20 text-accent-400 hover:bg-accent-500/30"
                        }`}
                        title={`Salin ${item.label}`}
                      >
                        <FaCopy size={12} />
                      </button>
                      <button type="button" onClick={() => openAbsolutePath(item.path)} className="p-2 rounded-lg bg-dark-800 text-dark-300 hover:text-white" title={`Buka ${item.label}`}>
                        <FaExternalLinkAlt size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Deskripsi HTML</label>
            <textarea value={form.description_html} onChange={(e) => setForm({...form, description_html: e.target.value})} rows={10} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white font-mono text-sm focus:outline-none focus:border-primary-500/50 resize-y" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Tujuan Tombol Lihat Produk</label>
              <select value={form.click_target_type} onChange={(e) => setForm({...form, click_target_type: e.target.value as Product["click_target_type"], click_target_page_id: e.target.value === "checkout" ? "" : form.click_target_page_id})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50">
                <option value="checkout">Langsung ke Checkout Form</option>
                <option value="cms_page">Landing Page CMS</option>
              </select>
            </div>
            <div className="lg:col-span-2 rounded-xl bg-dark-800 border border-dark-700 p-4 text-sm text-dark-400">
              Ketika user klik produk, sistem akan langsung menuju landing page CMS yang dipilih atau ke checkout form. Route /produk/{form.slug || "slug-produk"} akan otomatis mengikuti target ini.
            </div>
          </div>
          {form.click_target_type === "cms_page" && (
            <div className="rounded-xl bg-dark-800 border border-dark-700 p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Pilih Landing Page CMS</label>
                <select value={form.click_target_page_id} onChange={(e) => setForm({...form, click_target_page_id: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-900 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50">
                  <option value="">Pilih halaman</option>
                  {pages.map((page) => (
                    <option key={page.id} value={page.id}>
                      {page.title} ({page.slug})
                    </option>
                  ))}
                </select>
              </div>
              {selectedTargetPage && (
                <div className="flex items-center gap-3 rounded-lg bg-dark-900 border border-dark-700 p-3">
                  {selectedTargetPage.product?.thumbnail_url ? (
                    <img src={selectedTargetPage.product.thumbnail_url} alt={selectedTargetPage.product.title || selectedTargetPage.title} className="h-12 w-12 rounded-lg object-cover bg-dark-950" />
                  ) : (
                    <div className="h-12 w-12 rounded-lg bg-dark-950 flex items-center justify-center text-xs font-bold text-dark-400">
                      {(selectedTargetPage.product?.title || selectedTargetPage.title).charAt(0)}
                    </div>
                  )}
                  <div>
                    <div className="text-white text-sm font-medium">{selectedTargetPage.title}</div>
                    <div className="text-dark-500 text-xs">/{selectedTargetPage.slug}</div>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Harga (IDR) *</label>
              <input type="number" value={form.price} onChange={(e) => setForm({...form, price: parseFloat(e.target.value) || 0})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Harga Coret (opsional)</label>
              <input type="number" value={form.compare_at_price} onChange={(e) => setForm({...form, compare_at_price: parseFloat(e.target.value) || 0})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Tipe Komisi</label>
              <select value={form.affiliate_commission_type} onChange={(e) => setForm({...form, affiliate_commission_type: e.target.value as Product["affiliate_commission_type"]})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50">
                <option value="percent">Persen</option>
                <option value="fixed">Nominal Tetap</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">
                {form.affiliate_commission_type === "fixed" ? "Komisi Tetap (IDR)" : "Komisi Afiliasi (%)"}
              </label>
              <input type="number" min={0} max={form.affiliate_commission_type === "percent" ? 100 : undefined} value={form.affiliate_commission_type === "fixed" ? form.affiliate_commission_amount : form.affiliate_commission_rate} onChange={(e) => setForm({...form, [form.affiliate_commission_type === "fixed" ? "affiliate_commission_amount" : "affiliate_commission_rate"]: parseFloat(e.target.value) || 0})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Label Promo</label>
              <input type="text" value={form.badge} onChange={(e) => setForm({...form, badge: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" placeholder="Best Seller, Baru, Promo" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">URL Thumbnail</label>
              <input type="text" value={form.thumbnail_url} onChange={(e) => setForm({...form, thumbnail_url: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" placeholder="/uploads/products/thumb.jpg" />
              {form.thumbnail_url && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-dark-800 border border-dark-700 p-2">
                  <img src={form.thumbnail_url} alt="" className="h-12 w-16 rounded object-cover bg-dark-900" />
                  <span className="text-xs text-dark-400 font-mono break-all">{form.thumbnail_url}</span>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">URL Banner</label>
              <input type="text" value={form.banner_url} onChange={(e) => setForm({...form, banner_url: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
              {form.banner_url && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-dark-800 border border-dark-700 p-2">
                  <img src={form.banner_url} alt="" className="h-12 w-16 rounded object-cover bg-dark-900" />
                  <span className="text-xs text-dark-400 font-mono break-all">{form.banner_url}</span>
                </div>
              )}
            </div>
          </div>
          {mediaFiles.length > 0 ? (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <FaImage className="text-primary-400" />
                <label className="text-sm font-medium text-dark-300">Pilih dari Semua Media</label>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 max-h-96 overflow-y-auto pr-1">
                {mediaFiles.map((file) => (
                  <div key={file.file_path} className="rounded-xl bg-dark-800 border border-dark-700 overflow-hidden">
                    <div className="h-24 bg-dark-900 overflow-hidden">
                      <img src={file.file_path} alt={file.original_name} className="h-full w-full object-cover" loading="lazy" />
                    </div>
                    <div className="p-3 space-y-3">
                      <div className="text-white text-sm font-medium truncate" title={file.original_name}>{file.original_name}</div>
                      <div className="inline-flex rounded-md bg-dark-900 border border-dark-700 px-2 py-1 text-[11px] font-semibold text-primary-300">
                        {formatMediaCategory(file.category)}
                      </div>
                      <div className="rounded-lg bg-dark-900 border border-dark-700 px-2 py-1.5 text-dark-400 text-xs font-mono break-all">{file.file_path}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setProductImage("thumbnail_url", file.file_path)}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                            form.thumbnail_url === file.file_path ? "bg-primary-500 text-white" : "bg-primary-500/20 text-primary-400 hover:bg-primary-500/30"
                          }`}
                        >
                          Jadikan Thumbnail
                        </button>
                        <button
                          type="button"
                          onClick={() => setProductImage("banner_url", file.file_path)}
                          className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                            form.banner_url === file.file_path ? "bg-accent-500 text-white" : "bg-accent-500/20 text-accent-400 hover:bg-accent-500/30"
                          }`}
                        >
                          Jadikan Banner
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-dark-800 border border-dark-700 p-4 text-sm text-dark-400">
              Belum ada media produk. Unggah gambar di menu Media dengan kategori Produk.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Link WhatsApp / Pembelian Alternatif</label>
              <input type="text" value={form.purchase_url} onChange={(e) => setForm({...form, purchase_url: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Link Demo</label>
              <input type="text" value={form.demo_url} onChange={(e) => setForm({...form, demo_url: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Link Checkout Eksternal (opsional)</label>
            <input type="text" value={form.checkout_url} onChange={(e) => setForm({...form, checkout_url: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" placeholder="Kosongkan agar tombol beli memakai /order/slug dan komisi otomatis." />
          </div>
          {/* Categories */}
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Kategori</label>
            <div className="flex flex-wrap gap-2">
              {categories.map(cat => (
                <label key={cat.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer text-sm transition-all ${selectedCats.includes(cat.id) ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-dark-800 text-dark-400 border border-dark-700'}`}>
                  <input type="checkbox" checked={selectedCats.includes(cat.id)} onChange={(e) => { if (e.target.checked) setSelectedCats([...selectedCats, cat.id]); else setSelectedCats(selectedCats.filter(id => id !== cat.id)); }} className="hidden" />
                  {cat.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({...form, is_active: e.target.checked})} /><span className="text-sm text-dark-300">Aktif</span></label>
            <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.is_featured} onChange={(e) => setForm({...form, is_featured: e.target.checked})} /><span className="text-sm text-dark-300">Unggulan (diprioritaskan di beranda)</span></label>
          </div>
          <button onClick={handleSave} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 text-white font-bold shadow-lg transition-all hover:scale-[1.02]"><FaSave /> Simpan</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Produk</h1>
        <button onClick={startCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700"><FaPlus size={12} /> Tambah Produk</button>
      </div>
      <AdminCollectionToolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Cari nama, slug, badge, deskripsi singkat, atau landing produk..."
        selects={[
          {
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { label: "Semua produk", value: "all" },
              { label: "Aktif", value: "active" },
              { label: "Nonaktif", value: "inactive" },
              { label: "Unggulan", value: "featured" },
            ],
          },
          {
            label: "Urutkan",
            value: sortBy,
            onChange: setSortBy,
            options: [
              { label: "Produk terbaru", value: "newest" },
              { label: "Produk terlama", value: "oldest" },
              { label: "Nama A-Z", value: "title" },
              { label: "Harga tertinggi", value: "price-high" },
              { label: "Harga terendah", value: "price-low" },
            ],
          },
        ]}
        summary={`${filteredProducts.length} dari ${products.length} produk`}
      />
      {loading ? <div className="text-dark-400">Memuat...</div> : filteredProducts.length === 0 ? <div className="text-center py-16 text-dark-500">Tidak ada produk yang cocok.</div> : (
        <div className="rounded-2xl bg-dark-900 border border-dark-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-dark-700 bg-dark-850">
                <th className="text-left text-dark-400 py-3 px-4">Produk</th>
                <th className="text-left text-dark-400 py-3 px-4">Harga</th>
                <th className="text-left text-dark-400 py-3 px-4">Komisi</th>
                <th className="text-left text-dark-400 py-3 px-4">Landing</th>
                <th className="text-left text-dark-400 py-3 px-4">Status</th>
                <th className="text-left text-dark-400 py-3 px-4">Unggulan</th>
                <th className="text-left text-dark-400 py-3 px-4">Link</th>
                <th className="text-right text-dark-400 py-3 px-4">Aksi</th>
              </tr></thead>
              <tbody>
                {filteredProducts.map((p) => (
                  <tr key={p.id} className="border-b border-dark-800 hover:bg-dark-800/50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        {p.thumbnail_url ? <img src={p.thumbnail_url} className="h-10 w-10 rounded-lg object-cover" alt="" /> : <div className="h-10 w-10 rounded-lg bg-dark-700 flex items-center justify-center text-xs font-bold text-dark-400">{p.title.charAt(0)}</div>}
                        <div><div className="text-white font-medium">{p.title}</div><div className="text-dark-500 text-xs font-mono">/{p.slug}</div></div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-white font-semibold">{formatPrice(p.price)}</td>
                    <td className="py-3 px-4 text-dark-300">{getProductCommissionLabel(p)}</td>
                    <td className="py-3 px-4 text-dark-300">{p.click_target_type === "cms_page" ? (p.click_target_page?.title || "CMS") : "Checkout"}</td>
                    <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${p.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>{p.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                    <td className="py-3 px-4 text-dark-400">{p.is_featured ? 'Ya' : '-'}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <button onClick={() => copyAbsolutePath(resolveProductTargetPathForProduct(p), "Link tujuan produk disalin!")} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-primary-500/20 text-primary-400 text-xs font-semibold hover:bg-primary-500/30" title="Salin tujuan lihat produk"><FaCopy size={10} /> Target</button>
                        <button onClick={() => copyAbsolutePath(productPath("checkout", p.slug), "Link checkout disalin!")} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-dark-800 text-dark-300 text-xs font-semibold hover:text-white" title="Salin checkout form"><FaCopy size={10} /> Checkout</button>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a href={resolveProductTargetPathForProduct(p)} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg text-dark-400 hover:text-accent-400 hover:bg-accent-500/10 transition-all" title="Lihat Produk"><FaEye size={14} /></a>
                        <button onClick={() => startEdit(p)} className="p-2 rounded-lg text-dark-400 hover:text-primary-400 hover:bg-primary-500/10"><FaEdit size={14} /></button>
                        <button onClick={() => handleDelete(p.id)} className="p-2 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10"><FaTrash size={14} /></button>
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

function resolvePreviewTargetPath(
  clickTargetType: Product["click_target_type"],
  clickTargetPageId: string | null,
  pages: Page[],
  slug: string
) {
  if (clickTargetType === "cms_page" && clickTargetPageId) {
    const page = pages.find((item) => item.id === clickTargetPageId);
    if (page?.slug) {
      return `/${page.slug}`;
    }
  }

  return slug.trim() ? `/order/${slug.trim()}` : "";
}
