"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { emitThemeModeChange } from "@/components/ui/ThemeModeSync";
import { FaMoon, FaSave, FaSun } from "react-icons/fa";
import toast from "react-hot-toast";
import type { SiteSettings } from "@/types";
import { HOME_TEXT_DEFAULTS, type HomeTextKey } from "@/lib/home-texts";
import {
  NAV_ITEMS,
  getNavDefaults,
  type NavItemKey,
} from "@/lib/site-navigation";

type HomeTextField = {
  key: HomeTextKey;
  label: string;
  multiline?: boolean;
};

const homeHeroFields: HomeTextField[] = [
  { key: "hero_badge", label: "Badge Hero" },
  { key: "hero_secondary_label", label: "Label Tombol Kedua" },
  { key: "hero_secondary_url", label: "URL Tombol Kedua" },
];

const homeStatFields: HomeTextField[] = [
  { key: "stat_1_value", label: "Statistik 1 - Angka" },
  { key: "stat_1_label", label: "Statistik 1 - Label" },
  { key: "stat_2_value", label: "Statistik 2 - Angka" },
  { key: "stat_2_label", label: "Statistik 2 - Label" },
  { key: "stat_3_value", label: "Statistik 3 - Angka" },
  { key: "stat_3_label", label: "Statistik 3 - Label" },
];

const homeProductFields: HomeTextField[] = [
  { key: "hero_product_eyebrow", label: "Label Produk Hero" },
  { key: "hero_product_fallback_title", label: "Judul Produk Hero Jika Kosong" },
  { key: "hero_product_badge", label: "Badge Produk Hero" },
  { key: "products_title", label: "Judul Section Produk" },
  { key: "products_subtitle", label: "Subjudul Section Produk", multiline: true },
  { key: "product_default_badge", label: "Badge Default Produk" },
  { key: "product_rating_label", label: "Label Rating Produk" },
  { key: "product_card_button", label: "Tombol Kartu Produk" },
  { key: "products_all_button", label: "Tombol Semua Produk" },
];

const homeContentFields: HomeTextField[] = [
  { key: "testimonials_title", label: "Judul Testimoni" },
  { key: "testimonials_subtitle", label: "Subjudul Testimoni", multiline: true },
  { key: "faq_title", label: "Judul FAQ" },
  { key: "faq_subtitle", label: "Subjudul FAQ", multiline: true },
  { key: "cta_badge", label: "Badge CTA Bawah" },
  { key: "cta_title", label: "Judul CTA Bawah" },
  { key: "cta_subtitle", label: "Subjudul CTA Bawah", multiline: true },
  { key: "cta_primary_label", label: "Label Tombol CTA Utama" },
  { key: "cta_primary_url", label: "URL Tombol CTA Utama" },
  { key: "cta_secondary_label", label: "Label Tombol CTA Kedua" },
  { key: "cta_secondary_url", label: "URL Tombol CTA Kedua" },
];

const aboutDefaults = {
  title: "Tentang Kami",
  subtitle: "Kenali AzkazamDigital dan cara kami membantu bisnis digital Anda.",
  content_html:
    "<p>AzkazamDigital menyediakan produk digital dan sistem pemasaran yang membantu bisnis online berjalan lebih rapi, cepat, dan mudah dipakai.</p>",
};

const affiliateDefaults = {
  title: "Program Afiliasi",
  subtitle:
    "Promosikan produk digital kami dan dapatkan komisi dari setiap penjualan yang berhasil. Tanpa biaya pendaftaran!",
  primary_label: "Daftar Sekarang",
  primary_url: "/affiliate/register",
  secondary_label: "Masuk Afiliasi",
  secondary_url: "/affiliate/login",
  steps_title: "Cara Kerjanya",
  step1_title: "Daftar",
  step1_desc: "Isi formulir pendaftaran afiliasi secara gratis.",
  step2_title: "Dapatkan Tautan",
  step2_desc: "Setelah disetujui, dapatkan tautan referal unik.",
  step3_title: "Promosikan",
  step3_desc: "Bagikan tautan referal ke jaringan Anda.",
  step4_title: "Dapatkan Komisi",
  step4_desc: "Terima komisi dari setiap penjualan.",
  cta_title: "Siap Menghasilkan?",
  cta_subtitle:
    "Bergabunglah dengan afiliasi yang sudah menghasilkan dari program ini.",
  cta_button_label: "Daftar Afiliasi Gratis",
  cta_button_url: "/affiliate/register",
};

export default function AdminSettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Partial<SiteSettings>>({});
  const [selectedNavKey, setSelectedNavKey] = useState<NavItemKey>("contact");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("site_settings").select("*").limit(1).single();
    if (data) {
      setSettings(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    if (!settings.id) {
      toast.error("Pengaturan tidak ditemukan.");
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from("site_settings")
      .update({
        site_name: settings.site_name || "",
        description: settings.description || "",
        logo_url: settings.logo_url || null,
        favicon_url: settings.favicon_url || null,
        whatsapp_number: settings.whatsapp_number || null,
        email: settings.email || null,
        address: settings.address || null,
        hero_title: settings.hero_title || null,
        hero_subtitle: settings.hero_subtitle || null,
        primary_cta_label: settings.primary_cta_label || null,
        primary_cta_url: settings.primary_cta_url || null,
        footer_text: settings.footer_text || null,
        social_links: settings.social_links || {},
        whatsapp_button_enabled: settings.whatsapp_button_enabled ?? true,
        hide_checkout_chrome: settings.hide_checkout_chrome ?? true,
        hide_thank_you_chrome: settings.hide_thank_you_chrome ?? true,
        checkout_coupon_enabled: settings.checkout_coupon_enabled ?? true,
        payment_bank_name: settings.payment_bank_name || null,
        payment_account_number: settings.payment_account_number || null,
        payment_account_name: settings.payment_account_name || null,
        payment_qris_url: settings.payment_qris_url || null,
      })
      .eq("id", settings.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Pengaturan berhasil disimpan!");
      router.refresh();
    }
    setSaving(false);
  }

  function updateField(key: string, value: string | boolean) {
    setSettings({ ...settings, [key]: value });
  }

  function updateThemeMode(mode: "dark" | "light") {
    const links = { ...(settings.social_links || {}), theme_mode: mode };
    setSettings({ ...settings, social_links: links });
    emitThemeModeChange(mode);
  }

  function getNavField(key: NavItemKey, field: "label" | "href") {
    const defaults = getNavDefaults(key);
    const value = settings.social_links?.[`nav_${key}_${field}`];
    if (typeof value === "string") return value;
    return field === "label" ? defaults.defaultLabel : defaults.defaultHref;
  }

  function updateNavField(
    key: NavItemKey,
    field: "label" | "href",
    value: string
  ) {
    setSettings({
      ...settings,
      social_links: {
        ...(settings.social_links || {}),
        [`nav_${key}_${field}`]: value,
      },
    });
  }

  function getSocialText(key: string, fallback: string) {
    const value = settings.social_links?.[key];
    return typeof value === "string" ? value : fallback;
  }

  function updateSocialText(key: string, value: string) {
    setSettings({
      ...settings,
      social_links: {
        ...(settings.social_links || {}),
        [key]: value,
      },
    });
  }

  function getContactText(key: string, fallback: string) {
    return getSocialText(`contact_${key}`, fallback);
  }

  function updateContactText(key: string, value: string) {
    updateSocialText(`contact_${key}`, value);
  }

  function getAboutText(key: keyof typeof aboutDefaults) {
    return getSocialText(`about_${key}`, aboutDefaults[key]);
  }

  function updateAboutText(key: keyof typeof aboutDefaults, value: string) {
    updateSocialText(`about_${key}`, value);
  }

  function getAffiliateText(key: keyof typeof affiliateDefaults) {
    return getSocialText(`affiliate_${key}`, affiliateDefaults[key]);
  }

  function updateAffiliateText(
    key: keyof typeof affiliateDefaults,
    value: string
  ) {
    updateSocialText(`affiliate_${key}`, value);
  }

  function getHomeText(key: HomeTextKey) {
    const value = settings.social_links?.[`home_${key}`];
    if (typeof value === "string") return value;

    if (key === "hero_title") return settings.hero_title || "";
    if (key === "hero_subtitle") return settings.hero_subtitle || "";
    if (key === "hero_primary_label") return settings.primary_cta_label || "";
    if (key === "hero_primary_url") return settings.primary_cta_url || "";

    return HOME_TEXT_DEFAULTS[key];
  }

  function updateHomeText(key: HomeTextKey, value: string) {
    if (key === "hero_title") {
      updateField("hero_title", value);
      return;
    }
    if (key === "hero_subtitle") {
      updateField("hero_subtitle", value);
      return;
    }
    if (key === "hero_primary_label") {
      updateField("primary_cta_label", value);
      return;
    }
    if (key === "hero_primary_url") {
      updateField("primary_cta_url", value);
      return;
    }

    const links = {
      ...(settings.social_links || {}),
      [`home_${key}`]: value,
    };
    setSettings({ ...settings, social_links: links });
  }

  function renderHomeField(field: HomeTextField) {
    const value = getHomeText(field.key);

    return (
      <div key={field.key}>
        <label className="block text-sm font-medium text-dark-300 mb-2">
          {field.label}
        </label>
        {field.multiline ? (
          <textarea
            value={value}
            onChange={(e) => updateHomeText(field.key, e.target.value)}
            rows={3}
            className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50 resize-y"
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => updateHomeText(field.key, e.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
          />
        )}
      </div>
    );
  }

  if (loading) return <div className="text-dark-400">Memuat...</div>;
  const themeMode = settings.social_links?.theme_mode === "light" ? "light" : "dark";

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Pengaturan Situs</h1>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-semibold disabled:opacity-50">
          <FaSave size={14} /> {saving ? "Menyimpan..." : "Simpan Semua"}
        </button>
      </div>

      <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-5">
        {/* General */}
        <h3 className="text-white font-semibold text-sm border-b border-dark-700 pb-2">Umum</h3>

        <div>
          <label className="block text-sm font-medium text-dark-300 mb-3">Mode Tampilan Situs</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => updateThemeMode("dark")}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                themeMode === "dark"
                  ? "border-primary-500 bg-primary-500/15 text-white shadow-lg shadow-primary-500/10"
                  : "border-dark-700 bg-dark-800 text-dark-300 hover:border-dark-600 hover:text-white"
              }`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-dark-950 text-primary-400">
                <FaMoon />
              </span>
              <span>
                <span className="block text-sm font-semibold">Mode Gelap</span>
                <span className="block text-xs text-dark-400">Tampilan elegan dengan latar gelap.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => updateThemeMode("light")}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all ${
                themeMode === "light"
                  ? "border-primary-500 bg-primary-500/15 text-white shadow-lg shadow-primary-500/10"
                  : "border-dark-700 bg-dark-800 text-dark-300 hover:border-dark-600 hover:text-white"
              }`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-amber-500">
                <FaSun />
              </span>
              <span>
                <span className="block text-sm font-semibold">Mode Terang</span>
                <span className="block text-xs text-dark-400">Tampilan bersih, cerah, dan ringan dibaca.</span>
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Nama Website</label>
            <input type="text" value={settings.site_name || ""} onChange={(e) => updateField("site_name", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Email</label>
            <input type="text" value={settings.email || ""} onChange={(e) => updateField("email", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-dark-300 mb-2">Deskripsi Website</label>
          <input type="text" value={settings.description || ""} onChange={(e) => updateField("description", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">URL Logo</label>
            <input type="text" value={settings.logo_url || ""} onChange={(e) => updateField("logo_url", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">URL Favicon</label>
            <input type="text" value={settings.favicon_url || ""} onChange={(e) => updateField("favicon_url", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Nomor WhatsApp</label>
            <input type="text" value={settings.whatsapp_number || ""} onChange={(e) => updateField("whatsapp_number", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Alamat</label>
            <input type="text" value={settings.address || ""} onChange={(e) => updateField("address", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
          </div>
        </div>

        <h3 className="text-white font-semibold text-sm border-b border-dark-700 pb-2 pt-4">Menu Navigasi Situs</h3>
        <div className="rounded-xl bg-dark-800 border border-dark-700 p-4 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Pilih Menu</label>
              <select
                value={selectedNavKey}
                onChange={(e) => setSelectedNavKey(e.target.value as NavItemKey)}
                className="w-full px-4 py-3 rounded-xl bg-dark-900 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
              >
                {NAV_ITEMS.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.defaultLabel}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Nama Menu</label>
              <input
                type="text"
                value={getNavField(selectedNavKey, "label")}
                onChange={(e) =>
                  updateNavField(selectedNavKey, "label", e.target.value)
                }
                className="w-full px-4 py-3 rounded-xl bg-dark-900 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Link Menu</label>
              <input
                type="text"
                value={getNavField(selectedNavKey, "href")}
                onChange={(e) =>
                  updateNavField(selectedNavKey, "href", e.target.value)
                }
                className="w-full px-4 py-3 rounded-xl bg-dark-900 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
              />
            </div>
          </div>

          {selectedNavKey === "contact" && (
            <div className="rounded-xl bg-dark-900 border border-dark-700 p-4 space-y-5">
              <h4 className="text-sm font-semibold text-white">Isi Halaman Kontak</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Judul Kontak</label>
                  <input
                    type="text"
                    value={getContactText("title", "Hubungi Kami")}
                    onChange={(e) => updateContactText("title", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Judul Form</label>
                  <input
                    type="text"
                    value={getContactText("form_title", "Kirim Pesan")}
                    onChange={(e) =>
                      updateContactText("form_title", e.target.value)
                    }
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Subjudul Kontak</label>
                <textarea
                  rows={3}
                  value={getContactText(
                    "subtitle",
                    "Ada pertanyaan atau butuh bantuan? Tim kami siap membantu Anda."
                  )}
                  onChange={(e) => updateContactText("subtitle", e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50 resize-y"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Nomor WhatsApp</label>
                  <input
                    type="text"
                    value={settings.whatsapp_number || ""}
                    onChange={(e) => updateField("whatsapp_number", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Email</label>
                  <input
                    type="text"
                    value={settings.email || ""}
                    onChange={(e) => updateField("email", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Alamat</label>
                  <input
                    type="text"
                    value={settings.address || ""}
                    onChange={(e) => updateField("address", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Tombol Form</label>
                  <input
                    type="text"
                    value={getContactText("button_label", "Kirim Pesan")}
                    onChange={(e) =>
                      updateContactText("button_label", e.target.value)
                    }
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Placeholder Pesan</label>
                  <input
                    type="text"
                    value={getContactText("message_placeholder", "Tulis pesan Anda...")}
                    onChange={(e) =>
                      updateContactText("message_placeholder", e.target.value)
                    }
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
              </div>
            </div>
          )}

          {selectedNavKey === "about" && (
            <div className="rounded-xl bg-dark-900 border border-dark-700 p-4 space-y-5">
              <h4 className="text-sm font-semibold text-white">Isi Halaman Tentang</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Judul Tentang</label>
                  <input
                    type="text"
                    value={getAboutText("title")}
                    onChange={(e) => updateAboutText("title", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Subjudul Tentang</label>
                  <input
                    type="text"
                    value={getAboutText("subtitle")}
                    onChange={(e) => updateAboutText("subtitle", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Isi Tentang (HTML boleh)</label>
                <textarea
                  rows={8}
                  value={getAboutText("content_html")}
                  onChange={(e) => updateAboutText("content_html", e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50 resize-y"
                />
              </div>
              <p className="text-xs text-dark-500">
                Field ini dipakai untuk halaman /tentang-kami. Jika kosong,
                konten CMS halaman tetap menjadi fallback.
              </p>
            </div>
          )}

          {selectedNavKey === "affiliate" && (
            <div className="rounded-xl bg-dark-900 border border-dark-700 p-4 space-y-5">
              <h4 className="text-sm font-semibold text-white">Isi Halaman Afiliasi</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Judul Afiliasi</label>
                  <input
                    type="text"
                    value={getAffiliateText("title")}
                    onChange={(e) => updateAffiliateText("title", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Judul Bagian Cara Kerja</label>
                  <input
                    type="text"
                    value={getAffiliateText("steps_title")}
                    onChange={(e) => updateAffiliateText("steps_title", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-300 mb-2">Subjudul Afiliasi</label>
                <textarea
                  rows={3}
                  value={getAffiliateText("subtitle")}
                  onChange={(e) => updateAffiliateText("subtitle", e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50 resize-y"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Label Tombol Utama</label>
                  <input
                    type="text"
                    value={getAffiliateText("primary_label")}
                    onChange={(e) => updateAffiliateText("primary_label", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">URL Tombol Utama</label>
                  <input
                    type="text"
                    value={getAffiliateText("primary_url")}
                    onChange={(e) => updateAffiliateText("primary_url", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Label Tombol Kedua</label>
                  <input
                    type="text"
                    value={getAffiliateText("secondary_label")}
                    onChange={(e) => updateAffiliateText("secondary_label", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">URL Tombol Kedua</label>
                  <input
                    type="text"
                    value={getAffiliateText("secondary_url")}
                    onChange={(e) => updateAffiliateText("secondary_url", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {(["1", "2", "3", "4"] as const).map((step) => (
                  <div key={step} className="rounded-xl bg-dark-800 border border-dark-700 p-4 space-y-3">
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-dark-400">
                      Langkah {step}
                    </h5>
                    <input
                      type="text"
                      value={getAffiliateText(`step${step}_title`)}
                      onChange={(e) =>
                        updateAffiliateText(`step${step}_title`, e.target.value)
                      }
                      className="w-full px-4 py-3 rounded-xl bg-dark-900 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                    />
                    <textarea
                      rows={2}
                      value={getAffiliateText(`step${step}_desc`)}
                      onChange={(e) =>
                        updateAffiliateText(`step${step}_desc`, e.target.value)
                      }
                      className="w-full px-4 py-3 rounded-xl bg-dark-900 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50 resize-y"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Judul CTA Bawah</label>
                  <input
                    type="text"
                    value={getAffiliateText("cta_title")}
                    onChange={(e) => updateAffiliateText("cta_title", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Label Tombol CTA Bawah</label>
                  <input
                    type="text"
                    value={getAffiliateText("cta_button_label")}
                    onChange={(e) => updateAffiliateText("cta_button_label", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">URL Tombol CTA Bawah</label>
                  <input
                    type="text"
                    value={getAffiliateText("cta_button_url")}
                    onChange={(e) => updateAffiliateText("cta_button_url", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-300 mb-2">Subjudul CTA Bawah</label>
                  <textarea
                    rows={3}
                    value={getAffiliateText("cta_subtitle")}
                    onChange={(e) => updateAffiliateText("cta_subtitle", e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50 resize-y"
                  />
                </div>
              </div>
            </div>
          )}

          {!["contact", "about", "affiliate"].includes(selectedNavKey) && (
            <p className="text-xs text-dark-500">
              Menu ini hanya mengatur nama dan link navigasi.
            </p>
          )}
        </div>

        {/* Hero */}
        <h3 className="text-white font-semibold text-sm border-b border-dark-700 pb-2 pt-4">Bagian Hero</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Judul Hero</label>
            <input type="text" value={settings.hero_title || ""} onChange={(e) => updateField("hero_title", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Subjudul Hero</label>
            <input type="text" value={settings.hero_subtitle || ""} onChange={(e) => updateField("hero_subtitle", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {homeHeroFields.map(renderHomeField)}
        </div>

        <h3 className="text-white font-semibold text-sm border-b border-dark-700 pb-2 pt-4">Teks Statistik Beranda</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {homeStatFields.map(renderHomeField)}
        </div>

        <h3 className="text-white font-semibold text-sm border-b border-dark-700 pb-2 pt-4">Teks Produk Beranda</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {homeProductFields.map(renderHomeField)}
        </div>

        <h3 className="text-white font-semibold text-sm border-b border-dark-700 pb-2 pt-4">Teks Testimoni, FAQ, dan CTA Beranda</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {homeContentFields.map(renderHomeField)}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Label Tombol CTA</label>
            <input type="text" value={settings.primary_cta_label || ""} onChange={(e) => updateField("primary_cta_label", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">URL CTA</label>
            <input type="text" value={settings.primary_cta_url || ""} onChange={(e) => updateField("primary_cta_url", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-dark-300 mb-2">Teks Footer</label>
          <input type="text" value={settings.footer_text || ""} onChange={(e) => updateField("footer_text", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
        </div>

        {/* WhatsApp Float */}
        <h3 className="text-white font-semibold text-sm border-b border-dark-700 pb-2 pt-4">Tombol WhatsApp</h3>

        <label className="flex items-center gap-3 cursor-pointer">
          <div className={`relative w-11 h-6 rounded-full transition-colors ${settings.whatsapp_button_enabled ? 'bg-primary-500' : 'bg-dark-700'}`} onClick={() => updateField("whatsapp_button_enabled", !settings.whatsapp_button_enabled)}>
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${settings.whatsapp_button_enabled ? 'translate-x-5' : ''}`} />
          </div>
          <span className="text-sm text-dark-400">{settings.whatsapp_button_enabled ? 'Aktif' : 'Nonaktif'}</span>
        </label>

        {/* Checkout */}
        <h3 className="text-white font-semibold text-sm border-b border-dark-700 pb-2 pt-4">Checkout & Terima Kasih</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { key: "hide_checkout_chrome", label: "Checkout tanpa header/footer" },
            { key: "hide_thank_you_chrome", label: "Terima kasih tanpa header/footer" },
            { key: "checkout_coupon_enabled", label: "Tampilkan field kode kupon" },
          ].map((item) => (
            <label key={item.key} className="flex items-center justify-between gap-3 rounded-xl bg-dark-800 border border-dark-700 px-4 py-3 cursor-pointer">
              <span className="text-sm text-dark-300">{item.label}</span>
              <input
                type="checkbox"
                checked={Boolean(settings[item.key as keyof SiteSettings] ?? true)}
                onChange={(e) => updateField(item.key, e.target.checked)}
              />
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Nama Bank</label>
            <input type="text" value={settings.payment_bank_name || ""} onChange={(e) => updateField("payment_bank_name", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" placeholder="BCA" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Nomor Rekening</label>
            <input type="text" value={settings.payment_account_number || ""} onChange={(e) => updateField("payment_account_number", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" placeholder="7891502145" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">Nama Pemilik Rekening</label>
            <input type="text" value={settings.payment_account_name || ""} onChange={(e) => updateField("payment_account_name", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" placeholder="ASNIDAR NUR" />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">URL QRIS</label>
            <input type="text" value={settings.payment_qris_url || ""} onChange={(e) => updateField("payment_qris_url", e.target.value)} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" placeholder="/qris.webp" />
          </div>
        </div>
      </div>
    </div>
  );
}
