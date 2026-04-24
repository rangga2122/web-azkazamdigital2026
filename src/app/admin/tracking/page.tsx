"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_TRACKING_CONFIG,
  TRACKING_EVENTS,
  makeTrackingUid,
  normalizeTrackingConfig,
  type TrackingConfig,
  type TrackingEventName,
  type TrackingRule,
} from "@/lib/tracking-config";
import { FaPlus, FaSave, FaTrash } from "react-icons/fa";
import toast from "react-hot-toast";
import type { Page, Product } from "@/types";

type SiteTrackingRow = {
  id: string;
  pixel_enabled: boolean | null;
  facebook_pixel_id: string | null;
  custom_head_script: string | null;
  custom_body_script: string | null;
  custom_meta_script: string | null;
  custom_tracking_script: string | null;
  social_links: Record<string, unknown> | null;
};

const DEFAULT_EVENTS: TrackingEventName[] = [
  "PageView",
  "ViewContent",
  "InitiateCheckout",
  "Purchase",
];

export default function AdminTrackingPage() {
  const [settingsId, setSettingsId] = useState<string>("");
  const [pixelEnabled, setPixelEnabled] = useState(false);
  const [headScript, setHeadScript] = useState("");
  const [bodyScript, setBodyScript] = useState("");
  const [metaScript, setMetaScript] = useState("");
  const [trackingScript, setTrackingScript] = useState("");
  const [socialLinks, setSocialLinks] = useState<Record<string, unknown>>({});
  const [config, setConfig] = useState<TrackingConfig>(DEFAULT_TRACKING_CONFIG);
  const [pages, setPages] = useState<Page[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const activePixels = useMemo(
    () => config.pixels.filter((pixel) => pixel.active && pixel.pixelId.trim()),
    [config.pixels]
  );

  const load = useCallback(async () => {
    const supabase = createClient();
    const [settingsRes, pagesRes, productsRes] = await Promise.all([
      supabase
        .from("site_settings")
        .select(
          "id, pixel_enabled, facebook_pixel_id, custom_head_script, custom_body_script, custom_meta_script, custom_tracking_script, social_links"
        )
        .limit(1)
        .single(),
      supabase
        .from("pages")
        .select("id,title,slug,status")
        .eq("status", "published")
        .order("title"),
      supabase
        .from("products")
        .select("id,title,slug,thumbnail_url,price,is_active")
        .eq("is_active", true)
        .order("title"),
    ]);

    const settings = settingsRes.data as SiteTrackingRow | null;
    if (settings) {
      const links = settings.social_links || {};
      setSettingsId(settings.id);
      setPixelEnabled(settings.pixel_enabled || false);
      setHeadScript(settings.custom_head_script || "");
      setBodyScript(settings.custom_body_script || "");
      setMetaScript(settings.custom_meta_script || "");
      setTrackingScript(settings.custom_tracking_script || "");
      setSocialLinks(links);
      setConfig(
        normalizeTrackingConfig(links.tracking_pixels_config, {
          enabled: settings.pixel_enabled,
          pixelId: settings.facebook_pixel_id,
        })
      );
    }

    setPages((pagesRes.data || []) as Page[]);
    setProducts((productsRes.data || []) as Product[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function handleSave() {
    if (!settingsId) return;
    setSaving(true);

    const cleanedConfig = normalizeTrackingConfig(config);
    const primaryPixel =
      cleanedConfig.pixels.find((pixel) => pixel.active && pixel.pixelId.trim()) ||
      cleanedConfig.pixels[0];

    const supabase = createClient();
    const { error } = await supabase
      .from("site_settings")
      .update({
        pixel_enabled: pixelEnabled,
        facebook_pixel_id: primaryPixel?.pixelId || null,
        custom_head_script: headScript || null,
        custom_body_script: bodyScript || null,
        custom_meta_script: metaScript || null,
        custom_tracking_script: trackingScript || null,
        social_links: {
          ...socialLinks,
          tracking_pixels_config: cleanedConfig,
        },
      })
      .eq("id", settingsId);

    if (error) {
      toast.error(error.message);
    } else {
      setConfig(cleanedConfig);
      setSocialLinks((current) => ({
        ...current,
        tracking_pixels_config: cleanedConfig,
      }));
      toast.success("Pengaturan pelacakan disimpan!");
    }
    setSaving(false);
  }

  function addPixel() {
    setConfig((current) => ({
      ...current,
      pixels: [
        ...current.pixels,
        {
          uid: makeTrackingUid(),
          name: `Pixel ${current.pixels.length + 1}`,
          pixelId: "",
          active: true,
        },
      ],
    }));
  }

  function updatePixel(
    uid: string,
    key: "name" | "pixelId" | "active",
    value: string | boolean
  ) {
    setConfig((current) => ({
      ...current,
      pixels: current.pixels.map((pixel) =>
        pixel.uid === uid ? { ...pixel, [key]: value } : pixel
      ),
    }));
  }

  function deletePixel(uid: string) {
    if (!confirm("Hapus pixel ini dari konfigurasi?")) return;
    setConfig((current) => ({
      ...current,
      pixels: current.pixels.filter((pixel) => pixel.uid !== uid),
      rules: {
        global: removePixelFromRule(current.rules.global, uid),
        home: removePixelFromRule(current.rules.home, uid),
        pages: removePixelFromRuleMap(current.rules.pages, uid),
        checkoutProducts: removePixelFromRuleMap(
          current.rules.checkoutProducts,
          uid
        ),
        thankYouProducts: removePixelFromRuleMap(
          current.rules.thankYouProducts,
          uid
        ),
      },
    }));
  }

  function updateRule(path: RulePath, rule: TrackingRule) {
    setConfig((current) => {
      if (path.type === "global" || path.type === "home") {
        return {
          ...current,
          rules: { ...current.rules, [path.type]: rule },
        };
      }

      const currentMap = current.rules[path.type];
      return {
        ...current,
        rules: {
          ...current.rules,
          [path.type]: {
            ...currentMap,
            [path.key]: rule,
          },
        },
      };
    });
  }

  function getRule(path: RulePath) {
    if (path.type === "global" || path.type === "home") {
      return config.rules[path.type];
    }

    return config.rules[path.type][path.key] || { pixelUids: [], events: [] };
  }

  if (loading) return <div className="text-dark-400">Memuat...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Pixel / Pelacakan</h1>
          <p className="text-dark-400 text-sm mt-1">
            Kelola banyak Facebook Pixel, target halaman, produk checkout, dan
            event masing-masing.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-semibold disabled:opacity-50"
        >
          <FaSave size={14} /> {saving ? "Menyimpan..." : "Simpan"}
        </button>
      </div>

      <div className="space-y-6">
        <Section title="Status Pixel">
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              className={`relative w-11 h-6 rounded-full transition-colors ${
                pixelEnabled ? "bg-primary-500" : "bg-dark-700"
              }`}
              onClick={() => setPixelEnabled(!pixelEnabled)}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  pixelEnabled ? "translate-x-5" : ""
                }`}
              />
            </div>
            <span className="text-sm text-dark-400">
              {pixelEnabled ? "Aktif" : "Nonaktif"}
            </span>
          </label>
        </Section>

        <Section
          title="Daftar Facebook Pixel"
          action={
            <button
              type="button"
              onClick={addPixel}
              className="flex items-center gap-2 rounded-lg bg-primary-600 px-3 py-2 text-xs font-semibold text-white hover:bg-primary-700"
            >
              <FaPlus size={11} /> Tambah Pixel
            </button>
          }
        >
          {config.pixels.length === 0 ? (
            <div className="rounded-xl border border-dashed border-dark-700 p-5 text-sm text-dark-400">
              Belum ada pixel. Klik Tambah Pixel untuk menambahkan Facebook
              Pixel ID.
            </div>
          ) : (
            <div className="space-y-3">
              {config.pixels.map((pixel) => (
                <div
                  key={pixel.uid}
                  className="grid grid-cols-1 gap-3 rounded-xl border border-dark-700 bg-dark-800 p-4 lg:grid-cols-[1fr_1fr_auto_auto]"
                >
                  <input
                    value={pixel.name}
                    onChange={(e) =>
                      updatePixel(pixel.uid, "name", e.target.value)
                    }
                    className="rounded-xl border border-dark-700 bg-dark-900 px-4 py-3 text-sm text-white outline-none focus:border-primary-500/50"
                    placeholder="Nama pixel"
                  />
                  <input
                    value={pixel.pixelId}
                    onChange={(e) =>
                      updatePixel(pixel.uid, "pixelId", e.target.value)
                    }
                    className="rounded-xl border border-dark-700 bg-dark-900 px-4 py-3 text-sm text-white outline-none focus:border-primary-500/50"
                    placeholder="Facebook Pixel ID"
                  />
                  <label className="flex items-center gap-2 text-sm text-dark-300">
                    <input
                      type="checkbox"
                      checked={pixel.active}
                      onChange={(e) =>
                        updatePixel(pixel.uid, "active", e.target.checked)
                      }
                    />
                    Aktif
                  </label>
                  <button
                    type="button"
                    onClick={() => deletePixel(pixel.uid)}
                    className="flex items-center justify-center rounded-lg px-3 py-2 text-red-400 hover:bg-red-500/10"
                    title="Hapus pixel"
                  >
                    <FaTrash size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Global / Semua Halaman">
          <RuleEditor
            rule={getRule({ type: "global" })}
            pixels={config.pixels}
            onChange={(rule) => updateRule({ type: "global" }, rule)}
          />
        </Section>

        <Section title="Halaman Beranda">
          <RuleEditor
            rule={getRule({ type: "home" })}
            pixels={config.pixels}
            onChange={(rule) => updateRule({ type: "home" }, rule)}
          />
        </Section>

        <Section title="Halaman CMS Satu per Satu">
          <div className="space-y-4">
            {pages.length === 0 ? (
              <p className="text-sm text-dark-400">Belum ada halaman terbit.</p>
            ) : (
              pages.map((page) => (
                <TargetRuleRow
                  key={page.slug}
                  title={page.title}
                  subtitle={`/${page.slug}`}
                  rule={getRule({ type: "pages", key: page.slug })}
                  pixels={config.pixels}
                  onChange={(rule) =>
                    updateRule({ type: "pages", key: page.slug }, rule)
                  }
                />
              ))
            )}
          </div>
        </Section>

        <Section title="Checkout Produk">
          <div className="space-y-4">
            {products.length === 0 ? (
              <p className="text-sm text-dark-400">Belum ada produk aktif.</p>
            ) : (
              products.map((product) => (
                <TargetRuleRow
                  key={product.id}
                  title={product.title}
                  subtitle={`/order/${product.slug}`}
                  image={product.thumbnail_url}
                  rule={getRule({
                    type: "checkoutProducts",
                    key: product.id,
                  })}
                  pixels={config.pixels}
                  onChange={(rule) =>
                    updateRule(
                      { type: "checkoutProducts", key: product.id },
                      rule
                    )
                  }
                />
              ))
            )}
          </div>
        </Section>

        <Section title="Halaman Terima Kasih per Produk">
          <div className="space-y-4">
            {products.length === 0 ? (
              <p className="text-sm text-dark-400">Belum ada produk aktif.</p>
            ) : (
              products.map((product) => (
                <TargetRuleRow
                  key={product.id}
                  title={product.title}
                  subtitle="Diterapkan pada /thank-you setelah order produk ini"
                  image={product.thumbnail_url}
                  rule={getRule({
                    type: "thankYouProducts",
                    key: product.id,
                  })}
                  pixels={config.pixels}
                  onChange={(rule) =>
                    updateRule(
                      { type: "thankYouProducts", key: product.id },
                      rule
                    )
                  }
                />
              ))
            )}
          </div>
        </Section>

        <Section title="Skrip Khusus">
          <div className="space-y-5">
            <ScriptField
              label="Skrip Khusus Head"
              value={headScript}
              onChange={setHeadScript}
              rows={5}
              placeholder="<!-- Skrip untuk disisipkan di <head> -->"
            />
            <ScriptField
              label="Skrip Khusus Body"
              value={bodyScript}
              onChange={setBodyScript}
              rows={5}
              placeholder="<!-- Skrip untuk disisipkan sebelum </body> -->"
            />
            <ScriptField
              label="Skrip Meta Khusus"
              value={metaScript}
              onChange={setMetaScript}
              rows={3}
              placeholder="<!-- Tag meta -->"
            />
            <ScriptField
              label="Skrip Pelacakan Khusus"
              value={trackingScript}
              onChange={setTrackingScript}
              rows={3}
              placeholder="<!-- Skrip pelacakan tambahan -->"
            />
          </div>
        </Section>

        <div className="rounded-xl bg-primary-500/5 border border-primary-500/20 p-4">
          <h4 className="text-white text-sm font-semibold mb-2">
            Catatan Event
          </h4>
          <p className="text-dark-400 text-xs leading-relaxed">
            Global berlaku untuk semua target. Pengaturan spesifik halaman atau
            produk akan ditambahkan bersama global. Event checkout dan thank-you
            mengikuti produk order, jadi tiap produk bisa memakai pixel berbeda.
          </p>
          <p className="mt-2 text-dark-500 text-xs">
            Pixel aktif saat ini: {activePixels.length}
          </p>
        </div>
      </div>
    </div>
  );
}

type RulePath =
  | { type: "global" }
  | { type: "home" }
  | { type: "pages"; key: string }
  | { type: "checkoutProducts"; key: string }
  | { type: "thankYouProducts"; key: string };

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-dark-900 border border-dark-800 p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-white font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function TargetRuleRow({
  title,
  subtitle,
  image,
  rule,
  pixels,
  onChange,
}: {
  title: string;
  subtitle: string;
  image?: string | null;
  rule: TrackingRule;
  pixels: TrackingConfig["pixels"];
  onChange: (rule: TrackingRule) => void;
}) {
  return (
    <div className="rounded-xl border border-dark-700 bg-dark-800 p-4">
      <div className="mb-4 flex items-center gap-3">
        {image ? (
          <img
            src={image}
            alt={title}
            className="h-12 w-12 rounded-lg object-cover bg-dark-900"
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-dark-900 text-xs font-bold text-dark-400">
            {title.charAt(0)}
          </div>
        )}
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="text-xs text-dark-500">{subtitle}</div>
        </div>
      </div>
      <RuleEditor rule={rule} pixels={pixels} onChange={onChange} compact />
    </div>
  );
}

function RuleEditor({
  rule,
  pixels,
  onChange,
  compact = false,
}: {
  rule: TrackingRule;
  pixels: TrackingConfig["pixels"];
  onChange: (rule: TrackingRule) => void;
  compact?: boolean;
}) {
  function togglePixel(uid: string) {
    const selected = rule.pixelUids.includes(uid);
    onChange({
      ...rule,
      pixelUids: selected
        ? rule.pixelUids.filter((item) => item !== uid)
        : [...rule.pixelUids, uid],
    });
  }

  function toggleEvent(event: TrackingEventName) {
    const selected = rule.events.includes(event);
    onChange({
      ...rule,
      events: selected
        ? rule.events.filter((item) => item !== event)
        : [...rule.events, event],
    });
  }

  function applyDefaultEvents() {
    onChange({
      ...rule,
      events: DEFAULT_EVENTS,
    });
  }

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-dark-500">
          Pixel yang dipakai
        </div>
        {pixels.length === 0 ? (
          <div className="rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-xs text-dark-500">
            Tambahkan pixel terlebih dahulu.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {pixels.map((pixel) => (
              <button
                key={pixel.uid}
                type="button"
                onClick={() => togglePixel(pixel.uid)}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                  rule.pixelUids.includes(pixel.uid)
                    ? "border-primary-500 bg-primary-500/20 text-primary-300"
                    : "border-dark-700 bg-dark-900 text-dark-400 hover:text-white"
                }`}
              >
                {pixel.name || pixel.pixelId || "Pixel"}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-dark-500">
            Event
          </div>
          <button
            type="button"
            onClick={applyDefaultEvents}
            className="rounded-md bg-dark-800 px-2 py-1 text-[11px] font-semibold text-dark-300 hover:text-white"
          >
            Default
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {TRACKING_EVENTS.map((event) => (
            <button
              key={event}
              type="button"
              onClick={() => toggleEvent(event)}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                rule.events.includes(event)
                  ? "border-accent-500 bg-accent-500/20 text-accent-300"
                  : "border-dark-700 bg-dark-900 text-dark-400 hover:text-white"
              }`}
            >
              {event}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScriptField({
  label,
  value,
  onChange,
  rows,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows: number;
  placeholder: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-dark-300 mb-2">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white font-mono text-sm focus:outline-none focus:border-primary-500/50 resize-y"
        placeholder={placeholder}
      />
    </div>
  );
}

function removePixelFromRule(rule: TrackingRule, uid: string): TrackingRule {
  return {
    ...rule,
    pixelUids: rule.pixelUids.filter((item) => item !== uid),
  };
}

function removePixelFromRuleMap(
  map: Record<string, TrackingRule>,
  uid: string
) {
  return Object.fromEntries(
    Object.entries(map).map(([key, rule]) => [
      key,
      removePixelFromRule(rule, uid),
    ])
  );
}
