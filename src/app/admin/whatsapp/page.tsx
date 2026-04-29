"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getWhatsappNotificationConfig,
  serializeWhatsappNotificationConfig,
  type WhatsappApiProvider,
  type WhatsappDeviceInfo,
  type WhatsappNotificationConfig,
  type WhatsappStatus,
} from "@/lib/whatsapp-notifications";
import type { WhatsappBroadcast, WhatsappFollowupJob } from "@/types";
import {
  FaClock,
  FaImage,
  FaPaperPlane,
  FaPause,
  FaPlay,
  FaSave,
  FaStop,
  FaSyncAlt,
  FaVideo,
  FaWhatsapp,
} from "react-icons/fa";
import toast from "react-hot-toast";

const STATUS_OPTIONS: Array<{ value: WhatsappStatus; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

type TabKey = "notifications" | "broadcast" | "followups";

type AutomationDashboard = {
  activeBroadcast: WhatsappBroadcast | null;
  recentBroadcasts: WhatsappBroadcast[];
  recentFollowups: Array<
    WhatsappFollowupJob & {
      order: {
        id: string;
        order_code: string;
        buyer_name: string;
        buyer_whatsapp: string;
        status: string;
      } | null;
    }
  >;
  followupCounts: {
    pending: number;
    dueNow: number;
    sent: number;
    failed: number;
  };
};

export default function AdminWhatsappPage() {
  const [settingsId, setSettingsId] = useState("");
  const [fallbackWhatsapp, setFallbackWhatsapp] = useState("");
  const [socialLinks, setSocialLinks] = useState<Record<string, unknown>>({});
  const [config, setConfig] = useState<WhatsappNotificationConfig | null>(null);
  const [testNumber, setTestNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [automationBusy, setAutomationBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("notifications");
  const [devices, setDevices] = useState<WhatsappDeviceInfo[]>([]);
  const [dashboard, setDashboard] = useState<AutomationDashboard>({
    activeBroadcast: null,
    recentBroadcasts: [],
    recentFollowups: [],
    followupCounts: {
      pending: 0,
      dueNow: 0,
      sent: 0,
      failed: 0,
    },
  });

  const loadAutomation = useCallback(async () => {
    const response = await fetch("/api/admin/whatsapp/automation", {
      method: "GET",
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      success?: boolean;
      dashboard?: AutomationDashboard;
      error?: string;
    };

    if (!response.ok || !payload.success || !payload.dashboard) {
      throw new Error(payload.error || "Gagal memuat data automasi WhatsApp.");
    }

    setDashboard(payload.dashboard);
  }, []);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("site_settings")
      .select("id, whatsapp_number, social_links")
      .limit(1)
      .single();

    if (error || !data) {
      toast.error(error?.message || "Pengaturan situs tidak ditemukan.");
      setLoading(false);
      return;
    }

    const links = (data.social_links || {}) as Record<string, unknown>;
    const nextConfig = getWhatsappNotificationConfig(
      links,
      data.whatsapp_number || ""
    );

    setSettingsId(data.id);
    setFallbackWhatsapp(data.whatsapp_number || "");
    setSocialLinks(links);
    setConfig(nextConfig);
    setTestNumber(nextConfig.adminNumber || data.whatsapp_number || "");

    try {
      await loadAutomation();
    } catch (automationError) {
      toast.error(
        automationError instanceof Error
          ? automationError.message
          : "Gagal memuat automasi WhatsApp."
      );
    } finally {
      setLoading(false);
    }
  }, [loadAutomation]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const canConnectApi = useMemo(() => {
    return Boolean(
      config?.apiUrl.trim() &&
        config.apiUsername.trim() &&
        config.apiPassword.trim()
    );
  }, [config]);

  const canSendTest = useMemo(() => {
    return Boolean(canConnectApi && testNumber.trim());
  }, [canConnectApi, testNumber]);

  const canRunAutomation = useMemo(() => {
    return Boolean(
      config?.enabled &&
        config.apiUrl.trim() &&
        config.apiUsername.trim() &&
        config.apiPassword.trim()
    );
  }, [config]);

  const providerMeta = useMemo(() => {
    if (!config) return null;
    return config.provider === "instablast"
      ? {
          title: "InstaBlast Compatibility API",
          usernameLabel: "Email Login API",
          usernamePlaceholder: "azam@gmail.com",
          helper:
            "Untuk InstaBlast, username API harus email user yang login di aplikasi WA Instablast.",
          videoNote:
            "API kompatibilitas InstaBlast belum menyediakan endpoint video. Jika video broadcast diaktifkan, sistem akan mengirim caption + link video agar job tetap selesai.",
        }
      : {
          title: "GOWA API",
          usernameLabel: "Username API",
          usernamePlaceholder: "username",
          helper: "Gunakan username/password API dari provider GOWA Anda.",
          videoNote: "",
        };
  }, [config]);

  async function handleSave() {
    if (!config || !settingsId) return;

    setSaving(true);
    const supabase = createClient();
    const nextSocialLinks = {
      ...socialLinks,
      whatsapp_notifications: serializeWhatsappNotificationConfig(config),
    };

    const { error } = await supabase
      .from("site_settings")
      .update({
        social_links: nextSocialLinks,
      })
      .eq("id", settingsId);

    if (error) {
      toast.error(error.message);
    } else {
      setSocialLinks(nextSocialLinks);
      toast.success("Pengaturan Notifikasi WA berhasil disimpan.");
      try {
        await loadAutomation();
      } catch (automationError) {
        toast.error(
          automationError instanceof Error
            ? automationError.message
            : "Gagal menyegarkan automasi WhatsApp."
        );
      }
    }

    setSaving(false);
  }

  async function handleSendTest() {
    if (!config) return;

    setSendingTest(true);
    try {
      const response = await fetch("/api/admin/whatsapp/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          number: testNumber.trim(),
          config: serializeWhatsappNotificationConfig(config),
        }),
      });

      const payload = (await response.json()) as { error?: string; success?: boolean };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Tes WhatsApp gagal.");
      }

      toast.success("Tes WhatsApp berhasil dikirim.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Tes WhatsApp gagal.");
    } finally {
      setSendingTest(false);
    }
  }

  async function handleLoadDevices() {
    if (!config) return;

    setLoadingDevices(true);
    try {
      const response = await fetch("/api/admin/whatsapp/devices", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          config: serializeWhatsappNotificationConfig(config),
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        devices?: WhatsappDeviceInfo[];
      };

      if (!response.ok || !payload.success) {
        throw new Error(payload.error || "Gagal memuat daftar device.");
      }

      setDevices(payload.devices || []);
      toast.success("Daftar device berhasil dimuat.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal memuat daftar device."
      );
    } finally {
      setLoadingDevices(false);
    }
  }

  async function handleAutomationAction(
    action:
      | "start-broadcast"
      | "pause-broadcast"
      | "resume-broadcast"
      | "stop-broadcast"
      | "process-now",
    broadcastId?: string
  ) {
    if (!config) return;

    setAutomationBusy(true);
    try {
      const response = await fetch("/api/admin/whatsapp/automation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          broadcastId,
          config: serializeWhatsappNotificationConfig(config),
        }),
      });

      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        dashboard?: AutomationDashboard;
      };

      if (!response.ok || !payload.success || !payload.dashboard) {
        throw new Error(payload.error || "Aksi automasi WhatsApp gagal.");
      }

      setDashboard(payload.dashboard);

      const messages: Record<string, string> = {
        "start-broadcast": "Broadcast pelanggan berhasil dimulai.",
        "pause-broadcast": "Broadcast dijeda.",
        "resume-broadcast": "Broadcast dilanjutkan.",
        "stop-broadcast": "Broadcast dihentikan.",
        "process-now": "Antrian WhatsApp diproses sekarang.",
      };
      toast.success(messages[action]);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Aksi automasi WhatsApp gagal."
      );
    } finally {
      setAutomationBusy(false);
    }
  }

  function updateField<K extends keyof WhatsappNotificationConfig>(
    key: K,
    value: WhatsappNotificationConfig[K]
  ) {
    setConfig((current) => (current ? { ...current, [key]: value } : current));
  }

  function toggleStatusField(
    key: "notifyOnStatuses" | "broadcastStatuses" | "followupStatuses",
    status: WhatsappStatus
  ) {
    setConfig((current) => {
      if (!current) return current;
      const exists = current[key].includes(status);
      return {
        ...current,
        [key]: exists
          ? current[key].filter((item) => item !== status)
          : [...current[key], status],
      };
    });
  }

  if (loading || !config) {
    return <div className="text-dark-400">Memuat...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Notifikasi WhatsApp</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-dark-500">
            Kelola koneksi API WhatsApp, notifikasi order, broadcast pelanggan
            massal, follow-up otomatis 1/2/3, dan media broadcast dalam satu panel.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleAutomationAction("process-now")}
            disabled={!canRunAutomation || automationBusy}
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FaSyncAlt size={14} />
            {automationBusy ? "Memproses..." : "Proses Sekarang"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 disabled:opacity-50"
          >
            <FaSave size={14} /> {saving ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>

      <section className="rounded-3xl border border-dark-800 bg-dark-900 p-6 shadow-xl shadow-slate-950/5">
        <div className="mb-4 flex items-center gap-3">
          <div
            className={`relative h-6 w-11 cursor-pointer rounded-full transition-colors ${
              config.enabled ? "bg-primary-500" : "bg-dark-700"
            }`}
            onClick={() => updateField("enabled", !config.enabled)}
          >
            <div
              className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                config.enabled ? "translate-x-5" : ""
              }`}
            />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              {config.enabled ? "Notifikasi WA Aktif" : "Notifikasi WA Nonaktif"}
            </h2>
            <p className="text-xs text-dark-500">
              Nomor admin fallback dari pengaturan situs: {fallbackWhatsapp || "-"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <SelectField
            label="Provider API WhatsApp"
            value={config.provider}
            onChange={(value) => updateField("provider", value as WhatsappApiProvider)}
            options={[
              { value: "gowa", label: "GOWA" },
              { value: "instablast", label: "InstaBlast" },
            ]}
            helperText="Pilih provider yang dipakai agar format auth, device, dan media sesuai."
          />
          <Field
            label="URL API WhatsApp"
            value={config.apiUrl}
            onChange={(value) => updateField("apiUrl", value)}
            placeholder="http://localhost:3000"
          />
          <Field
            label="Device ID"
            value={config.deviceId}
            onChange={(value) => updateField("deviceId", value)}
            placeholder="contoh: admin"
            helperText="Kosongkan jika ingin ambil otomatis dari device yang sedang logged in."
          />
          <Field
            label="Nomor Admin"
            value={config.adminNumber}
            onChange={(value) => updateField("adminNumber", value)}
            placeholder="628xxxxxxx"
          />
          <Field
            label={providerMeta?.usernameLabel || "Username API"}
            value={config.apiUsername}
            onChange={(value) => updateField("apiUsername", value)}
            placeholder={providerMeta?.usernamePlaceholder || "username"}
            helperText={providerMeta?.helper}
          />
          <PasswordField
            label="Password API"
            value={config.apiPassword}
            onChange={(value) => updateField("apiPassword", value)}
            placeholder="password"
          />
        </div>

        <div className="mt-5 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-slate-700 shadow-sm">
          <div className="font-semibold text-slate-900">
            Provider aktif: {providerMeta?.title || "-"}
          </div>
          <div className="mt-1">
            Untuk deployment Coolify, mode yang paling stabil adalah cron. Set env
            `WHATSAPP_AUTOMATION_MODE=cron` dan `WHATSAPP_AUTOMATION_CRON_SECRET`,
            lalu jadwalkan request ke `/api/cron/whatsapp?key=SECRET` tiap 1 menit.
            Jika Anda ingin tetap punya cadangan proses internal, pakai mode `hybrid`.
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-dark-800 bg-dark-950/50 p-4">
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Daftar Device Provider</div>
              <div className="mt-1 text-xs text-dark-500">
                Muat device dari {config.provider === "instablast" ? "InstaBlast" : "GOWA"} lalu klik
                &quot;Pakai&quot; untuk mengisi `device_id` otomatis.
              </div>
            </div>
            <button
              type="button"
              onClick={handleLoadDevices}
              disabled={!canConnectApi || loadingDevices}
              className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-slate-700 to-slate-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FaSyncAlt size={14} />
              {loadingDevices ? "Memuat..." : "Muat Device"}
            </button>
          </div>

          {devices.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-dark-800">
              <div className="grid grid-cols-[1fr_1fr_0.8fr_0.8fr_0.6fr] bg-dark-950/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-dark-500">
                <div>Device</div>
                <div>Nomor</div>
                <div>Status</div>
                <div>Koneksi</div>
                <div>Aksi</div>
              </div>
              {devices.map((device) => (
                <div
                  key={device.id}
                  className="grid grid-cols-[1fr_1fr_0.8fr_0.8fr_0.6fr] items-center border-t border-dark-800 px-4 py-3 text-sm text-dark-300"
                >
                  <div className="truncate">
                    <div className="font-medium text-white">{device.displayName || device.id}</div>
                    <div className="text-xs text-dark-500">{device.deviceId}</div>
                  </div>
                  <div>{device.phone || "-"}</div>
                  <div>{device.state || "-"}</div>
                  <div>{device.isLoggedIn ? "Logged in" : device.isConnected ? "Connected" : "Offline"}</div>
                  <div>
                    <button
                      type="button"
                      onClick={() => updateField("deviceId", device.id)}
                      className="rounded-xl border border-primary-600/40 bg-primary-600/10 px-3 py-2 text-xs font-semibold text-primary-200 transition hover:bg-primary-600/20"
                    >
                      Pakai
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-dark-700 bg-dark-950/30 px-4 py-5 text-sm text-dark-400">
              Belum ada device yang dimuat.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-dark-800 bg-dark-900 p-3 shadow-xl shadow-slate-950/5">
        <div className="flex flex-wrap gap-2">
          <TabButton
            label="Notifikasi"
            active={activeTab === "notifications"}
            onClick={() => setActiveTab("notifications")}
          />
          <TabButton
            label="Broadcast"
            active={activeTab === "broadcast"}
            onClick={() => setActiveTab("broadcast")}
          />
          <TabButton
            label="Follow-up"
            active={activeTab === "followups"}
            onClick={() => setActiveTab("followups")}
          />
        </div>
      </section>

      {activeTab === "notifications" ? (
        <>
          <section className="rounded-3xl border border-dark-800 bg-dark-900 p-6 shadow-xl shadow-slate-950/5">
            <h2 className="mb-4 font-semibold text-white">Perilaku Notifikasi</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ToggleCard
                label="Notifikasi Admin untuk order baru"
                checked={config.notifyAdmin}
                onChange={(checked) => updateField("notifyAdmin", checked)}
              />
              <ToggleCard
                label="Notifikasi Pelanggan saat order dibuat"
                checked={config.notifyCustomer}
                onChange={(checked) => updateField("notifyCustomer", checked)}
              />
              <ToggleCard
                label="Notifikasi Pelanggan saat status berubah"
                checked={config.notifyCustomerStatus}
                onChange={(checked) => updateField("notifyCustomerStatus", checked)}
              />
              <ToggleCard
                label="Format nomor otomatis ke 62"
                checked={config.formatNumber}
                onChange={(checked) => updateField("formatNumber", checked)}
              />
              <ToggleCard
                label="Kirim gambar bersama notifikasi order"
                checked={config.enableImage}
                onChange={(checked) => updateField("enableImage", checked)}
              />
            </div>

            <div className="mt-5">
              <Field
                label="URL Gambar Default"
                value={config.defaultImageUrl}
                onChange={(value) => updateField("defaultImageUrl", value)}
                placeholder="https://example.com/image.jpg atau /qris.webp"
              />
            </div>

            <div className="mt-5">
              <h3 className="mb-2 text-sm font-semibold text-dark-300">
                Status yang memicu notifikasi update
              </h3>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((status) => {
                  const active = config.notifyOnStatuses.includes(status.value);
                  return (
                    <ChipButton
                      key={status.value}
                      active={active}
                      label={status.label}
                      onClick={() => toggleStatusField("notifyOnStatuses", status.value)}
                    />
                  );
                })}
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-dark-800 bg-dark-900 p-6 shadow-xl shadow-slate-950/5">
            <h2 className="mb-4 font-semibold text-white">Template Pesan Order</h2>
            <div className="grid grid-cols-1 gap-5">
              <TemplateField
                label="Template Pesan ke Pelanggan Saat Order Baru"
                value={config.customerTemplate}
                onChange={(value) => updateField("customerTemplate", value)}
              />
              <TemplateField
                label="Template Pesan ke Admin Saat Order Baru"
                value={config.adminTemplate}
                onChange={(value) => updateField("adminTemplate", value)}
              />
              <TemplateField
                label="Template Update Status ke Pelanggan"
                value={config.statusTemplate}
                onChange={(value) => updateField("statusTemplate", value)}
              />
              <TemplateHint />
            </div>
          </section>

          <section className="rounded-3xl border border-dark-800 bg-dark-900 p-6 shadow-xl shadow-slate-950/5">
            <div className="mb-4 flex items-center gap-3">
              <FaWhatsapp className="text-green-400" />
              <h2 className="font-semibold text-white">Tes Kirim</h2>
            </div>
            <p className="mb-4 text-sm text-dark-400">
              Tes kirim akan memakai provider {providerMeta?.title || "-"} dan device
              yang sedang dipilih.
            </p>

            <div className="grid grid-cols-1 gap-5 md:grid-cols-[1fr_auto]">
              <Field
                label="Nomor Tujuan Tes"
                value={testNumber}
                onChange={setTestNumber}
                placeholder="628xxxxxxx"
              />
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={!canSendTest || sendingTest}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <FaPaperPlane size={14} />
                  {sendingTest ? "Mengirim..." : "Kirim Tes"}
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}

      {activeTab === "broadcast" ? (
        <>
          <section className="rounded-3xl border border-dark-800 bg-dark-900 p-6 shadow-xl shadow-slate-950/5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-white">Broadcast Pelanggan Massal</h2>
                <p className="mt-1 text-sm text-dark-400">
                  Mengambil pelanggan unik dari riwayat order sesuai filter, lalu
                  mengirim pesan satu per satu dengan delay acak seperti sistem broadcast legacy.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!dashboard.activeBroadcast ? (
                  <button
                    type="button"
                    onClick={() => void handleAutomationAction("start-broadcast")}
                    disabled={
                      !canRunAutomation ||
                      automationBusy ||
                      config.broadcastStatuses.length === 0
                    }
                    className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <FaPlay size={14} />
                    Mulai Broadcast
                  </button>
                ) : null}

                {dashboard.activeBroadcast?.status === "running" ? (
                  <button
                    type="button"
                    onClick={() =>
                      void handleAutomationAction(
                        "pause-broadcast",
                        dashboard.activeBroadcast?.id
                      )
                    }
                    disabled={automationBusy}
                    className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-amber-500/20 disabled:opacity-50"
                  >
                    <FaPause size={14} />
                    Jeda
                  </button>
                ) : null}

                {dashboard.activeBroadcast?.status === "paused" ? (
                  <button
                    type="button"
                    onClick={() =>
                      void handleAutomationAction(
                        "resume-broadcast",
                        dashboard.activeBroadcast?.id
                      )
                    }
                    disabled={automationBusy}
                    className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                  >
                    <FaPlay size={14} />
                    Lanjutkan
                  </button>
                ) : null}

                {dashboard.activeBroadcast ? (
                  <button
                    type="button"
                    onClick={() =>
                      void handleAutomationAction(
                        "stop-broadcast",
                        dashboard.activeBroadcast?.id
                      )
                    }
                    disabled={automationBusy}
                    className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-red-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-500/20 disabled:opacity-50"
                  >
                    <FaStop size={14} />
                    Hentikan
                  </button>
                ) : null}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <TemplateField
                label="Template Broadcast"
                value={config.broadcastTemplate}
                onChange={(value) => updateField("broadcastTemplate", value)}
                rows={8}
              />

              <div className="space-y-5">
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-dark-300">
                    Status order pelanggan yang diambil
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {STATUS_OPTIONS.map((status) => {
                      const active = config.broadcastStatuses.includes(status.value);
                      return (
                        <ChipButton
                          key={status.value}
                          active={active}
                          label={status.label}
                          onClick={() =>
                            toggleStatusField("broadcastStatuses", status.value)
                          }
                        />
                      );
                    })}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-dark-500">
                    {config.broadcastStatuses.length > 0
                      ? `Filter aktif: ${config.broadcastStatuses
                          .map((status) => STATUS_OPTIONS.find((item) => item.value === status)?.label || status)
                          .join(", ")}`
                      : "Belum ada status yang dipilih. Broadcast tidak bisa dimulai."}
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <Field
                    label="Tanggal Order Dari"
                    value={config.broadcastDateFrom}
                    onChange={(value) => updateField("broadcastDateFrom", value)}
                    type="date"
                  />
                  <Field
                    label="Tanggal Order Sampai"
                    value={config.broadcastDateTo}
                    onChange={(value) => updateField("broadcastDateTo", value)}
                    type="date"
                  />
                </div>

                <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                  <Field
                    label="Delay Minimum (detik)"
                    value={String(config.broadcastMinDelaySeconds)}
                    onChange={(value) =>
                      updateField("broadcastMinDelaySeconds", Math.max(1, Number(value || 1)))
                    }
                    type="number"
                    min={1}
                  />
                  <Field
                    label="Delay Maksimum (detik)"
                    value={String(config.broadcastMaxDelaySeconds)}
                    onChange={(value) =>
                      updateField(
                        "broadcastMaxDelaySeconds",
                        Math.max(1, Number(value || config.broadcastMinDelaySeconds || 1))
                      )
                    }
                    type="number"
                    min={1}
                  />
                </div>

                <div className="rounded-2xl border border-dark-800 bg-dark-950/50 px-4 py-3 text-sm leading-6 text-dark-300">
                  <div className="font-semibold text-white">Ringkasan filter broadcast</div>
                  <div className="mt-1">
                    Mengambil pelanggan unik berdasarkan nomor WhatsApp dari order dengan status{" "}
                    <strong className="text-white">
                      {config.broadcastStatuses.length > 0
                        ? config.broadcastStatuses
                            .map((status) => STATUS_OPTIONS.find((item) => item.value === status)?.label || status)
                            .join(", ")
                        : "belum dipilih"}
                    </strong>
                    {config.broadcastDateFrom || config.broadcastDateTo ? (
                      <>
                        {" "}pada rentang{" "}
                        <strong className="text-white">
                          {formatDateRangeSummary(
                            config.broadcastDateFrom,
                            config.broadcastDateTo
                          )}
                        </strong>
                      </>
                    ) : (
                      <> dari semua tanggal order</>
                    )}
                    .
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-dark-800 bg-dark-900 p-6 shadow-xl shadow-slate-950/5">
            <h2 className="mb-4 font-semibold text-white">Media Broadcast</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ToggleCard
                icon={<FaImage className="text-sky-400" />}
                label="Kirim gambar pada broadcast"
                checked={config.broadcastEnableImage}
                onChange={(checked) => updateField("broadcastEnableImage", checked)}
              />
              <ToggleCard
                icon={<FaVideo className="text-pink-400" />}
                label="Kirim video pada broadcast"
                checked={config.broadcastEnableVideo}
                onChange={(checked) => updateField("broadcastEnableVideo", checked)}
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field
                label="URL Gambar Broadcast"
                value={config.broadcastImageUrl}
                onChange={(value) => updateField("broadcastImageUrl", value)}
                placeholder="https://example.com/promo.jpg"
              />
              <Field
                label="URL Video Broadcast"
                value={config.broadcastVideoUrl}
                onChange={(value) => updateField("broadcastVideoUrl", value)}
                placeholder="https://example.com/promo.mp4"
              />
            </div>
            {config.provider === "instablast" ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                {providerMeta?.videoNote}
              </div>
            ) : null}
          </section>

          <section className="rounded-3xl border border-dark-800 bg-dark-900 p-6 shadow-xl shadow-slate-950/5">
            <h2 className="mb-4 font-semibold text-white">Status Broadcast</h2>
            {dashboard.activeBroadcast ? (
              <div className="rounded-xl border border-primary-500/20 bg-primary-500/5 p-5">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white">
                      Broadcast aktif: {statusLabelBroadcast(dashboard.activeBroadcast.status)}
                    </div>
                    <div className="mt-1 text-xs text-dark-400">
                      Dimulai {formatDateTime(dashboard.activeBroadcast.started_at)}
                    </div>
                    <div className="mt-1 text-xs text-dark-400">
                      {describeBroadcastFilters(dashboard.activeBroadcast)}
                    </div>
                  </div>
                  <div className="text-sm text-dark-300">
                    {dashboard.activeBroadcast.current_index} /{" "}
                    {dashboard.activeBroadcast.total_recipients} pelanggan diproses
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                  <StatCard
                    label="Terkirim"
                    value={String(dashboard.activeBroadcast.sent_count)}
                  />
                  <StatCard
                    label="Gagal"
                    value={String(dashboard.activeBroadcast.failed_count)}
                  />
                  <StatCard
                    label="Total"
                    value={String(dashboard.activeBroadcast.total_recipients)}
                  />
                  <StatCard
                    label="Error Terakhir"
                    value={dashboard.activeBroadcast.last_error || "-"}
                    compact
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-dark-700 bg-dark-950/40 p-5 text-sm text-dark-400">
                Belum ada broadcast aktif. Simpan pengaturan, lalu mulai broadcast saat siap.
              </div>
            )}

            <div className="mt-6 overflow-hidden rounded-xl border border-dark-800">
              <div className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_1fr] bg-dark-950/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-dark-500">
                <div>Broadcast</div>
                <div>Status</div>
                <div>Terkirim</div>
                <div>Gagal</div>
                <div>Dibuat</div>
              </div>
              {dashboard.recentBroadcasts.length > 0 ? (
                dashboard.recentBroadcasts.map((broadcast) => (
                  <div
                    key={broadcast.id}
                    className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_1fr] items-center border-t border-dark-800 px-4 py-3 text-sm text-dark-300"
                  >
                    <div className="truncate">
                      <div className="truncate">
                        {broadcast.template.slice(0, 70) || "Tanpa template"}
                      </div>
                      <div className="mt-1 truncate text-xs text-dark-500">
                        {describeBroadcastFilters(broadcast)}
                      </div>
                    </div>
                    <div>{statusLabelBroadcast(broadcast.status)}</div>
                    <div>{broadcast.sent_count}</div>
                    <div>{broadcast.failed_count}</div>
                    <div>{formatDateTime(broadcast.created_at)}</div>
                  </div>
                ))
              ) : (
                <div className="border-t border-dark-800 px-4 py-5 text-sm text-dark-400">
                  Belum ada riwayat broadcast.
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}

      {activeTab === "followups" ? (
        <>
          <section className="rounded-3xl border border-dark-800 bg-dark-900 p-6 shadow-xl shadow-slate-950/5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-white">Follow-up Otomatis Bertahap</h2>
                <p className="mt-1 text-sm text-dark-400">
                  Follow-up 1/2/3 akan dijadwalkan otomatis untuk order yang tetap
                  berada pada status yang Anda pilih.
                </p>
              </div>
              <ToggleCard
                label="Aktifkan follow-up otomatis"
                checked={config.followupEnabled}
                onChange={(checked) => updateField("followupEnabled", checked)}
                inline
              />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-dark-300">
                Status order yang perlu follow-up
              </h3>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((status) => {
                  const active = config.followupStatuses.includes(status.value);
                  return (
                    <ChipButton
                      key={status.value}
                      active={active}
                      label={status.label}
                      onClick={() => toggleStatusField("followupStatuses", status.value)}
                    />
                  );
                })}
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
              <FollowupLevelCard
                title="Follow-up 1"
                enabled={config.followupEnabled}
                mandatory
                delayHours={config.followupDelayHours}
                template={config.followupTemplate}
                onDelayChange={(value) =>
                  updateField("followupDelayHours", Math.max(1, Number(value || 1)))
                }
                onTemplateChange={(value) => updateField("followupTemplate", value)}
              />
              <FollowupLevelCard
                title="Follow-up 2"
                enabled={config.followup2Enabled}
                delayHours={config.followupDelayHours2}
                template={config.followupTemplate2}
                onToggle={(checked) => updateField("followup2Enabled", checked)}
                onDelayChange={(value) =>
                  updateField("followupDelayHours2", Math.max(1, Number(value || 1)))
                }
                onTemplateChange={(value) => updateField("followupTemplate2", value)}
              />
              <FollowupLevelCard
                title="Follow-up 3"
                enabled={config.followup3Enabled}
                delayHours={config.followupDelayHours3}
                template={config.followupTemplate3}
                onToggle={(checked) => updateField("followup3Enabled", checked)}
                onDelayChange={(value) =>
                  updateField("followupDelayHours3", Math.max(1, Number(value || 1)))
                }
                onTemplateChange={(value) => updateField("followupTemplate3", value)}
              />
            </div>

            <div className="mt-5">
              <TemplateHint />
            </div>
          </section>

          <section className="rounded-2xl border border-dark-800 bg-dark-900 p-6">
            <div className="mb-4 flex items-center gap-3">
              <FaClock className="text-primary-300" />
              <h2 className="font-semibold text-white">Antrian Follow-up</h2>
            </div>

            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard
                label="Pending"
                value={String(dashboard.followupCounts.pending)}
              />
              <StatCard
                label="Jatuh Tempo"
                value={String(dashboard.followupCounts.dueNow)}
              />
              <StatCard
                label="Terkirim"
                value={String(dashboard.followupCounts.sent)}
              />
              <StatCard
                label="Gagal"
                value={String(dashboard.followupCounts.failed)}
              />
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-dark-800">
              <div className="grid grid-cols-[0.6fr_1fr_1fr_0.8fr_0.8fr_1fr] bg-dark-950/70 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-dark-500">
                <div>Level</div>
                <div>Order</div>
                <div>Pelanggan</div>
                <div>Status</div>
                <div>Percobaan</div>
                <div>Jadwal</div>
              </div>
              {dashboard.recentFollowups.length > 0 ? (
                dashboard.recentFollowups.map((job) => (
                  <div
                    key={job.id}
                    className="grid grid-cols-[0.6fr_1fr_1fr_0.8fr_0.8fr_1fr] items-center border-t border-dark-800 px-4 py-3 text-sm text-dark-300"
                  >
                    <div>{job.level}</div>
                    <div>{job.order?.order_code || "-"}</div>
                    <div className="truncate">{job.order?.buyer_name || "-"}</div>
                    <div>{statusLabelFollowup(job.status)}</div>
                    <div>{job.attempts}</div>
                    <div>{formatDateTime(job.scheduled_for)}</div>
                  </div>
                ))
              ) : (
                <div className="border-t border-dark-800 px-4 py-5 text-sm text-dark-400">
                  Belum ada job follow-up.
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? "bg-gradient-to-r from-primary-600 to-blue-600 text-white shadow-lg shadow-blue-500/20"
          : "bg-dark-950 text-dark-500 hover:bg-dark-800 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  helperText,
  type = "text",
  min,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  type?: "text" | "password" | "number" | "date";
  min?: number;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-dark-300">{label}</label>
      <input
        type={type}
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-dark-700 bg-dark-800 px-4 py-3 text-white shadow-sm transition focus:border-primary-500/50 focus:outline-none focus:ring-4 focus:ring-primary-500/10"
      />
      {helperText ? <p className="mt-2 text-xs leading-5 text-dark-500">{helperText}</p> : null}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  helperText,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  helperText?: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-dark-300">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-dark-700 bg-dark-800 px-4 py-3 text-white shadow-sm transition focus:border-primary-500/50 focus:outline-none focus:ring-4 focus:ring-primary-500/10"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helperText ? <p className="mt-2 text-xs leading-5 text-dark-500">{helperText}</p> : null}
    </div>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <Field
      label={label}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      type="password"
    />
  );
}

function TemplateField({
  label,
  value,
  onChange,
  rows = 6,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-dark-300">{label}</label>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-2xl border border-dark-700 bg-dark-800 px-4 py-3 font-mono text-sm text-white shadow-sm transition focus:border-primary-500/50 focus:outline-none focus:ring-4 focus:ring-primary-500/10"
      />
    </div>
  );
}

function ToggleCard({
  label,
  checked,
  onChange,
  icon,
  inline = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: ReactNode;
  inline?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-dark-700 bg-dark-800 px-4 py-3 shadow-sm transition hover:border-dark-600 ${
        inline ? "min-w-[280px]" : ""
      }`}
    >
      <span className="flex items-center gap-3 text-sm font-medium text-dark-200">
        {icon}
        {label}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function ChipButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-3 py-2.5 text-xs font-semibold transition ${
        active
          ? "border-primary-600 bg-primary-600 text-white shadow-lg shadow-primary-500/20"
          : "border-dark-700 bg-dark-800 text-dark-500 hover:border-dark-600 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function FollowupLevelCard({
  title,
  enabled,
  delayHours,
  template,
  onToggle,
  onDelayChange,
  onTemplateChange,
  mandatory = false,
}: {
  title: string;
  enabled: boolean;
  delayHours: number;
  template: string;
  onToggle?: (checked: boolean) => void;
  onDelayChange: (value: string) => void;
  onTemplateChange: (value: string) => void;
  mandatory?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-dark-800 bg-dark-950/50 p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-white">{title}</div>
          <div className="mt-1 text-xs leading-5 text-dark-500">
            {mandatory
              ? "Level dasar follow-up."
              : "Dikirim setelah level sebelumnya tetap tidak berubah."}
          </div>
        </div>
        {mandatory ? (
          <span className="rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold text-white">
            Wajib
          </span>
        ) : (
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle?.(e.target.checked)}
          />
        )}
      </div>
      <div className="space-y-4">
        <Field
          label="Delay (jam)"
          value={String(delayHours)}
          onChange={onDelayChange}
          type="number"
          min={1}
        />
        <TemplateField
          label="Template Follow-up"
          value={template}
          onChange={onTemplateChange}
          rows={8}
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-dark-800 bg-dark-950/50 p-4 shadow-sm">
      <div className="text-xs uppercase tracking-wide text-dark-500">{label}</div>
      <div
        className={`mt-2 font-semibold text-white ${compact ? "text-sm" : "text-xl"}`}
      >
        {value}
      </div>
    </div>
  );
}

function TemplateHint() {
  return (
    <p className="text-xs leading-6 text-dark-500">
      Variabel tersedia: <code>{"{order_id}"}</code>, <code>{"{customer_name}"}</code>,{" "}
      <code>{"{order_total}"}</code>, <code>{"{order_date}"}</code>,{" "}
      <code>{"{order_status}"}</code>, <code>{"{previous_status}"}</code>,{" "}
      <code>{"{order_items}"}</code>, <code>{"{customer_email}"}</code>,{" "}
      <code>{"{customer_phone}"}</code>, <code>{"{payment_method}"}</code>,{" "}
      <code>{"{site_title}"}</code>, <code>{"{last_order_id}"}</code>,{" "}
      <code>{"{last_order_date}"}</code>, <code>{"{last_order_total}"}</code>.
      Broadcast juga mendukung spintax sederhana seperti{" "}
      <code>{"{Promo A|Promo B|Promo C}"}</code>.
    </p>
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("id-ID");
}

function formatDateRangeSummary(dateFrom?: string | null, dateTo?: string | null) {
  if (dateFrom && dateTo) {
    return `${dateFrom} s/d ${dateTo}`;
  }

  if (dateFrom) {
    return `sejak ${dateFrom}`;
  }

  if (dateTo) {
    return `hingga ${dateTo}`;
  }

  return "semua tanggal";
}

function describeBroadcastFilters(broadcast: WhatsappBroadcast) {
  const statuses =
    broadcast.filter_statuses && broadcast.filter_statuses.length > 0
      ? broadcast.filter_statuses.join(", ")
      : "tanpa status";
  const dateSummary = formatDateRangeSummary(
    broadcast.filter_date_from,
    broadcast.filter_date_to
  );

  return `Status: ${statuses} | Tanggal: ${dateSummary}`;
}

function statusLabelBroadcast(status: string) {
  const mapping: Record<string, string> = {
    running: "Berjalan",
    paused: "Dijeda",
    completed: "Selesai",
    stopped: "Dihentikan",
    failed: "Gagal",
    draft: "Draft",
  };

  return mapping[status] || status;
}

function statusLabelFollowup(status: string) {
  const mapping: Record<string, string> = {
    pending: "Pending",
    processing: "Diproses",
    sent: "Terkirim",
    cancelled: "Dibatalkan",
    failed: "Gagal",
  };

  return mapping[status] || status;
}
