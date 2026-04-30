"use client";

import { useEffect, useMemo, useState } from "react";
import {
  FaBell,
  FaBox,
  FaCheckCircle,
  FaClipboardCheck,
  FaEdit,
  FaExclamationTriangle,
  FaKey,
  FaPlus,
  FaShieldAlt,
  FaShoppingCart,
  FaTimes,
  FaTrash,
  FaUserShield,
  FaUsers,
  FaWifi,
} from "react-icons/fa";
import toast from "react-hot-toast";
import { formatDate, formatPrice, getStatusColor, getStatusLabel } from "@/lib/utils";
import type {
  LicenseBootstrap,
  LicenseNotification,
  LicenseOrderLead,
  LicenseProduct,
  LicenseSession,
  LicenseUser,
} from "@/types/license-manager";

type LicenseTab =
  | "dashboard"
  | "users"
  | "orders"
  | "products"
  | "sessions"
  | "notifications"
  | "validate";

type ModalState =
  | { type: "none" }
  | { type: "add-user" }
  | { type: "edit-user"; user: LicenseUser }
  | { type: "add-product-for-email"; email: string; role: "admin" | "user" }
  | { type: "create-users-from-order"; order: LicenseOrderLead }
  | { type: "product"; product: LicenseProduct | null }
  | { type: "notification"; notification: LicenseNotification | null };

type ProductEntryForm = {
  productName: string;
  selected: boolean;
  expiryDate: string;
  maxSessions: string;
  disabled?: boolean;
  badge?: string | null;
};

const TAB_ITEMS: Array<{
  key: LicenseTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { key: "dashboard", label: "Dashboard", icon: FaClipboardCheck },
  { key: "users", label: "Pengguna", icon: FaUsers },
  { key: "orders", label: "Order Masuk", icon: FaShoppingCart },
  { key: "products", label: "Produk", icon: FaBox },
  { key: "sessions", label: "Sesi Aktif", icon: FaWifi },
  { key: "notifications", label: "Notifikasi", icon: FaBell },
  { key: "validate", label: "Cek Akses", icon: FaCheckCircle },
];

const DEFAULT_BOOTSTRAP: LicenseBootstrap = {
  configured: false,
  users: [],
  products: [],
  catalogProducts: [],
  sessions: [],
  notifications: [],
  orderLeads: [],
};

export default function AdminLicensesPage() {
  const [activeTab, setActiveTab] = useState<LicenseTab>("dashboard");
  const [data, setData] = useState<LicenseBootstrap>(DEFAULT_BOOTSTRAP);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [userSearch, setUserSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [validateEmail, setValidateEmail] = useState("");
  const [validateResult, setValidateResult] = useState<{
    checked: boolean;
    valid: boolean;
    message: string;
    users: LicenseUser[];
  }>({
    checked: false,
    valid: false,
    message: "",
    users: [],
  });

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const body = document.body;
    const previousRootTheme = root.getAttribute("data-site-theme");
    const previousBodyTheme = body?.getAttribute("data-site-theme") ?? null;
    const previousRootScheme = root.style.colorScheme;
    const previousBodyScheme = body?.style.colorScheme ?? "";

    root.setAttribute("data-site-theme", "dark");
    root.style.colorScheme = "dark";

    if (body) {
      body.setAttribute("data-site-theme", "dark");
      body.style.colorScheme = "dark";
    }

    return () => {
      if (previousRootTheme) {
        root.setAttribute("data-site-theme", previousRootTheme);
      } else {
        root.removeAttribute("data-site-theme");
      }
      root.style.colorScheme = previousRootScheme;

      if (!body) return;

      if (previousBodyTheme) {
        body.setAttribute("data-site-theme", previousBodyTheme);
      } else {
        body.removeAttribute("data-site-theme");
      }
      body.style.colorScheme = previousBodyScheme;
    };
  }, []);

  async function loadData() {
    setLoading(true);

    try {
      const response = await fetch("/api/admin/licenses", { cache: "no-store" });
      const payload = (await response.json()) as {
        success?: boolean;
        error?: string;
        data?: LicenseBootstrap;
      };

      if (!response.ok || !payload.data) {
        throw new Error(payload.error || "Gagal memuat data lisensi.");
      }

      setData(payload.data);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal memuat data lisensi."
      );
    } finally {
      setLoading(false);
    }
  }

  async function runAction(action: string, payload: Record<string, unknown>) {
    setSubmitting(true);

    try {
      const response = await fetch("/api/admin/licenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const result = (await response.json()) as {
        error?: string;
        data?:
          | LicenseBootstrap
          | {
              data?: LicenseBootstrap;
              results?: Array<{ productName: string; status: string }>;
            };
      };

      if (!response.ok) {
        throw new Error(result.error || "Aksi lisensi gagal.");
      }

      const nextData =
        result.data && "configured" in result.data
          ? (result.data as LicenseBootstrap)
          : (result.data as { data?: LicenseBootstrap })?.data;

      if (nextData) {
        setData(nextData);
      }

      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Aksi lisensi gagal.");
      throw error;
    } finally {
      setSubmitting(false);
    }
  }

  const groupedUsers = useMemo(() => {
    const search = userSearch.trim().toLowerCase();
    const filtered = data.users.filter((user) => {
      if (!search) return true;
      return [user.email, user.role, user.product_name]
        .some((value) => String(value || "").toLowerCase().includes(search));
    });

    return Array.from(
      filtered.reduce((map, user) => {
        if (!map.has(user.email)) {
          map.set(user.email, []);
        }
        map.get(user.email)?.push(user);
        return map;
      }, new Map<string, LicenseUser[]>())
    );
  }, [data.users, userSearch]);

  const filteredOrderLeads = useMemo(() => {
    const search = orderSearch.trim().toLowerCase();
    if (!search) return data.orderLeads;

    return data.orderLeads.filter((order) =>
      [order.nama, order.email, order.no_hp, order.produk, order.status, order.wp_order_id]
        .some((value) => String(value || "").toLowerCase().includes(search))
    );
  }, [data.orderLeads, orderSearch]);

  const activeLicenseUsers = data.users.filter((user) =>
    user.is_active && isUserNotExpired(user)
  );
  const activeSessionsByUserId = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of data.sessions) {
      map.set(session.user_id, (map.get(session.user_id) || 0) + 1);
    }
    return map;
  }, [data.sessions]);
  const paidOrProcessingOrders = data.orderLeads.filter((order) =>
    ["processing", "completed", "paid"].includes(String(order.status || "").toLowerCase())
  );

  function resetValidate() {
    setValidateResult({ checked: false, valid: false, message: "", users: [] });
  }

  function submitValidate() {
    const email = validateEmail.trim().toLowerCase();
    if (!email) {
      toast.error("Masukkan email dulu.");
      return;
    }

    const users = data.users.filter(
      (user) => user.email.trim().toLowerCase() === email
    );

    if (users.length === 0) {
      setValidateResult({
        checked: true,
        valid: false,
        message: "Email tidak terdaftar dalam sistem.",
        users: [],
      });
      return;
    }

    const activeUsers = users.filter((user) => user.is_active && isUserNotExpired(user));
    if (activeUsers.length === 0) {
      setValidateResult({
        checked: true,
        valid: false,
        message: "Email ada, tetapi aksesnya tidak aktif atau sudah kadaluarsa.",
        users,
      });
      return;
    }

    const products = activeUsers.map((user) => user.product_name || "Semua").join(", ");
    setValidateResult({
      checked: true,
      valid: true,
      message: `Aktivasi valid untuk produk: ${products}`,
      users: activeUsers,
    });
  }

  async function handleDeleteUser(user: LicenseUser) {
    if (!confirm(`Hapus registrasi ${user.email} untuk produk "${user.product_name || "Tanpa Produk"}"?`)) {
      return;
    }

    await runAction("delete-user", { id: user.id });
    toast.success("Registrasi pengguna dihapus.");
  }

  async function handleToggleUser(user: LicenseUser, nextActive: boolean) {
    await runAction("update-user", {
      id: user.id,
      isActive: nextActive,
    });
    toast.success(nextActive ? "Akses diaktifkan." : "Akses dinonaktifkan.");
  }

  async function handleKickAllSessions(userId: string, email: string) {
    if (!confirm(`Kick semua session untuk ${email}?`)) return;
    await runAction("kick-all-sessions", { userId });
    toast.success("Semua session pengguna berhasil di-kick.");
  }

  async function handleKickSession(session: LicenseSession) {
    if (!confirm(`Kick session ${session.user_email}?`)) return;
    await runAction("kick-session", { token: session.session_token });
    toast.success("Session berhasil di-kick.");
  }

  async function handleDeleteOrderLead(order: LicenseOrderLead) {
    if (!confirm(`Hapus data pembeli ${order.email || order.nama || order.id}?`)) {
      return;
    }

    await runAction("delete-order-lead", { id: order.id });
    toast.success("Data order lead dihapus.");
  }

  async function handleDeleteProduct(product: LicenseProduct) {
    if (!confirm(`Hapus produk lisensi "${product.name}"?`)) return;
    await runAction("delete-product", { id: product.id });
    toast.success("Produk lisensi dihapus.");
  }

  async function handleDeleteNotification(notification: LicenseNotification) {
    if (!confirm(`Hapus notifikasi "${notification.title}"?`)) return;
    await runAction("delete-notification", { id: notification.id });
    toast.success("Notifikasi dihapus.");
  }

  function openAddUserModal() {
    setModal({ type: "add-user" });
  }

  function openEditUserModal(user: LicenseUser) {
    setModal({ type: "edit-user", user });
  }

  function openAddProductForEmail(email: string, role: "admin" | "user") {
    setModal({ type: "add-product-for-email", email, role });
  }

  function openCreateUsersFromOrder(order: LicenseOrderLead) {
    setModal({ type: "create-users-from-order", order });
  }

  function openProductModal(product: LicenseProduct | null) {
    setModal({ type: "product", product });
  }

  function openNotificationModal(notification: LicenseNotification | null) {
    setModal({ type: "notification", notification });
  }

  const titleMap: Record<LicenseTab, string> = {
    dashboard: "Dashboard",
    users: "Pengguna",
    orders: "Order Masuk",
    products: "Produk",
    sessions: "Sesi Aktif",
    notifications: "Notifikasi",
    validate: "Cek Akses",
  };

  return (
    <div
      data-license-theme="dark"
      className="license-admin-root space-y-6 rounded-[2rem] bg-[#0a0e1a] p-4 text-slate-100 shadow-[0_24px_80px_rgba(2,6,23,0.45)] lg:p-6"
    >
      <style>{`
        [data-license-theme="dark"] {
          color-scheme: dark;
          --license-bg-primary: #0a0e1a;
          --license-bg-secondary: #111827;
          --license-bg-card: #1a1f35;
          --license-bg-card-hover: #222842;
          --license-bg-input: #0d1225;
          --license-text-primary: #f0f4ff;
          --license-text-secondary: #cbd5e1;
          --license-text-muted: #8b95b8;
          --license-border: rgba(99, 102, 241, 0.15);
          --license-border-subtle: rgba(255,255,255,0.06);
          --license-gradient: linear-gradient(145deg, rgba(26,31,53,0.96), rgba(17,24,39,0.98));
          background: var(--license-bg-primary) !important;
          font-family: Inter, var(--font-sans), sans-serif !important;
        }

        [data-license-theme="dark"] h1,
        [data-license-theme="dark"] h2,
        [data-license-theme="dark"] h3,
        [data-license-theme="dark"] th,
        [data-license-theme="dark"] label,
        [data-license-theme="dark"] .text-white {
          color: #f8fafc !important;
        }

        [data-license-theme="dark"] p,
        [data-license-theme="dark"] td,
        [data-license-theme="dark"] .text-dark-300 {
          color: #cbd5e1 !important;
        }

        [data-license-theme="dark"] .text-dark-400,
        [data-license-theme="dark"] .text-dark-500 {
          color: var(--license-text-muted) !important;
        }

        [data-license-theme="dark"] section,
        [data-license-theme="dark"] article {
          box-shadow: 0 10px 40px rgba(2, 6, 23, 0.22);
        }

        [data-license-theme="dark"] [class*="bg-dark-900"] {
          background: var(--license-gradient) !important;
        }

        [data-license-theme="dark"] [class*="bg-dark-950"] {
          background: rgba(10, 14, 26, 0.94) !important;
        }

        [data-license-theme="dark"] [class*="border-dark-800"] {
          border-color: var(--license-border) !important;
        }

        [data-license-theme="dark"] [class*="border-dark-700"] {
          border-color: rgba(148, 163, 184, 0.14) !important;
        }

        [data-license-theme="dark"] [class*="bg-white"] {
          background: #ffffff !important;
          color: #0f172a !important;
        }

        [data-license-theme="dark"] [class*="text-slate-900"] {
          color: #0f172a !important;
        }

        [data-license-theme="dark"] [class*="bg-primary-600"] {
          background: linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7) !important;
          color: #fff !important;
        }

        [data-license-theme="dark"] [class*="bg-dark-800"] {
          background: var(--license-bg-card-hover) !important;
        }

        [data-license-theme="dark"] input,
        [data-license-theme="dark"] select,
        [data-license-theme="dark"] textarea {
          background: var(--license-bg-input) !important;
          color: var(--license-text-primary) !important;
          border-color: rgba(148, 163, 184, 0.2) !important;
        }

        [data-license-theme="dark"] input::placeholder,
        [data-license-theme="dark"] textarea::placeholder {
          color: #64748b !important;
        }

        [data-license-theme="dark"] thead tr,
        [data-license-theme="dark"] th {
          background: rgba(2, 6, 23, 0.28) !important;
        }

        [data-license-theme="dark"] td,
        [data-license-theme="dark"] tr {
          background: transparent !important;
        }

        [data-license-theme="dark"] table tr:hover td {
          background: rgba(30, 41, 59, 0.5) !important;
        }

        [data-license-theme="dark"] code {
          background: rgba(15, 23, 42, 0.95) !important;
          color: #c4b5fd !important;
        }

        [data-license-theme="dark"] button {
          box-shadow: none;
        }

        [data-license-theme="dark"] .license-tab-active {
          background: rgba(99, 102, 241, 0.16) !important;
          color: #e9ddff !important;
          border: 1px solid rgba(99, 102, 241, 0.28) !important;
        }

        [data-license-theme="dark"] .license-tab-idle {
          background: rgba(255, 255, 255, 0.04) !important;
          color: #cbd5e1 !important;
          border: 1px solid rgba(255, 255, 255, 0.05) !important;
        }

        [data-license-theme="dark"] .license-soft-button {
          background: rgba(255, 255, 255, 0.06) !important;
          color: #f8fafc !important;
          border: 1px solid rgba(255, 255, 255, 0.08) !important;
        }

        [data-license-theme="dark"] .license-soft-button:hover {
          background: rgba(255, 255, 255, 0.1) !important;
          border-color: rgba(99, 102, 241, 0.3) !important;
        }

        [data-license-theme="dark"] .license-primary-button {
          background: linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7) !important;
          color: #ffffff !important;
          border: none !important;
          box-shadow: 0 10px 24px rgba(99, 102, 241, 0.24) !important;
        }

        [data-license-theme="dark"] .license-primary-button:hover {
          box-shadow: 0 14px 30px rgba(99, 102, 241, 0.3) !important;
        }
      `}</style>
      <section className="rounded-[2rem] border border-violet-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.18),_transparent_42%),linear-gradient(180deg,rgba(17,24,39,0.98),rgba(10,14,26,0.98))] p-6 shadow-2xl shadow-slate-950/25 lg:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-violet-200">
              <FaShieldAlt size={12} />
              License Manager
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white lg:text-4xl">
              Lisensi
            </h1>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              onClick={() => void loadData()}
              className="license-soft-button rounded-xl px-4 py-3 text-sm font-semibold transition hover:scale-[1.01]"
            >
              Refresh Data
            </button>
          </div>
        </div>
      </section>

      {!data.configured ? (
        <section className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-6">
          <div className="flex items-start gap-3">
            <FaExclamationTriangle className="mt-0.5 text-amber-400" />
            <div>
              <h2 className="font-semibold text-white">
                Koneksi database lisensi belum tersedia
              </h2>
              <p className="mt-1 text-sm leading-6 text-amber-100/80">
                Halaman sudah siap, tetapi butuh konfigurasi database lisensi lama
                agar semua isi tampil sama seperti `lisensi.html`.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-dark-800 bg-dark-900 p-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {TAB_ITEMS.map((item) => {
            const isActive = activeTab === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveTab(item.key)}
                className={`inline-flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                  isActive
                    ? "license-tab-active"
                    : "license-tab-idle hover:text-white"
                }`}
              >
                <item.icon size={14} />
                {item.label}
              </button>
            );
          })}
          <button
            onClick={openAddUserModal}
            className="license-primary-button inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition hover:scale-[1.01]"
          >
            <FaPlus size={12} />
            Tambah Pengguna
          </button>
        </div>
      </section>

      <section className="rounded-[1.75rem] border border-dark-800 bg-dark-900">
        <div className="border-b border-dark-800 px-5 py-5 lg:px-6">
          <h2 className="text-xl font-bold text-white">{titleMap[activeTab]}</h2>
        </div>
        <div className="p-5 lg:p-6">
          {loading ? <div className="text-dark-400">Memuat data lisensi...</div> : null}

          {!loading && activeTab === "dashboard" ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={FaUsers} label="Email Unik" value={String(new Set(data.users.map((u) => u.email)).size)} color="from-violet-500 to-primary-500" />
                <StatCard icon={FaCheckCircle} label="Registrasi Aktif" value={String(activeLicenseUsers.length)} color="from-emerald-500 to-green-500" />
                <StatCard icon={FaUserShield} label="Admin" value={String(data.users.filter((u) => u.role === "admin").length)} color="from-fuchsia-500 to-pink-500" />
                <StatCard icon={FaShoppingCart} label="Order Masuk" value={String(data.orderLeads.length)} color="from-amber-500 to-orange-500" />
                <StatCard icon={FaBox} label="Produk Lisensi" value={String(data.products.length)} color="from-sky-500 to-cyan-500" />
                <StatCard icon={FaWifi} label="Sesi Aktif" value={String(data.sessions.length)} color="from-indigo-500 to-violet-500" />
                <StatCard icon={FaBell} label="Notifikasi" value={String(data.notifications.length)} color="from-rose-500 to-red-500" />
                <StatCard icon={FaKey} label="Nilai Order" value={formatPrice(data.orderLeads.reduce((sum, item) => sum + Number(item.total || 0), 0))} color="from-lime-500 to-emerald-500" />
              </div>

              <SimpleTable
                headers={["Waktu", "Nama", "Email", "Produk", "Total", "Status"]}
                rows={data.orderLeads.slice(0, 8).map((order) => [
                  formatDate(order.created_at),
                  order.nama || "-",
                  order.email || "-",
                  order.produk || "-",
                  formatPrice(Number(order.total || 0)),
                  <StatusBadge key="status" status={order.status || "processing"} />,
                ])}
                emptyMessage="Belum ada order lead."
              />
            </div>
          ) : null}

          {!loading && activeTab === "users" ? (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p className="text-sm text-dark-400">
                  {groupedUsers.length} email · {data.users.length} registrasi
                </p>
                <input
                  value={userSearch}
                  onChange={(event) => setUserSearch(event.target.value)}
                  placeholder="Cari email, role, atau produk..."
                  className="w-full rounded-lg border border-dark-700 bg-dark-800 px-3 py-2 text-sm text-white outline-none placeholder:text-dark-500 md:w-80"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] text-sm">
                  <thead>
                    <tr className="border-b border-dark-800 bg-dark-950/70">
                      {["Email", "Role", "Produk", "Status", "Kadaluarsa", "Sesi", "Max", "Aksi"].map((header) => (
                        <th key={header} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-dark-500">
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {groupedUsers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-dark-500">
                          Tidak ada pengguna yang cocok.
                        </td>
                      </tr>
                    ) : (
                      groupedUsers.map(([email, users]) =>
                        users.map((user, index) => {
                          const sessionCount = activeSessionsByUserId.get(user.id) || 0;
                          const maxSessions = user.max_sessions || 1;
                          return (
                            <tr key={user.id} className="border-b border-dark-800/60 hover:bg-dark-950/40">
                              {index === 0 ? (
                                <>
                                  <td rowSpan={users.length} className="px-4 py-4 align-top">
                                    <div className="font-semibold text-white">{email}</div>
                                    <button
                                      onClick={() => openAddProductForEmail(email, user.role)}
                                      className="mt-2 inline-flex items-center gap-2 rounded-lg border border-primary-500/20 bg-primary-500/10 px-2.5 py-1 text-xs font-semibold text-primary-300"
                                    >
                                      <FaPlus size={10} />
                                      Tambah Produk
                                    </button>
                                  </td>
                                  <td rowSpan={users.length} className="px-4 py-4 align-top">
                                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${user.role === "admin" ? "bg-fuchsia-500/15 text-fuchsia-300" : "bg-cyan-500/15 text-cyan-300"}`}>
                                      {user.role}
                                    </span>
                                  </td>
                                </>
                              ) : null}
                              <td className="px-4 py-4 text-white">{user.product_name || "—"}</td>
                              <td className="px-4 py-4"><StatusBadge status={resolveLicenseStatus(user)} /></td>
                              <td className="px-4 py-4 text-dark-300">{formatMaybeDate(user.expiry_date)}</td>
                              <td className={`px-4 py-4 font-bold ${sessionCount >= maxSessions ? "text-red-400" : "text-emerald-400"}`}>{sessionCount}</td>
                              <td className="px-4 py-4 text-dark-300">{maxSessions}</td>
                              <td className="px-4 py-4">
                                <div className="flex flex-wrap gap-2">
                                  <button onClick={() => openEditUserModal(user)} className="rounded-lg bg-dark-800 px-2.5 py-2 text-dark-200 hover:bg-dark-700"><FaEdit size={12} /></button>
                                  <button onClick={() => void handleToggleUser(user, !user.is_active)} className={`rounded-lg px-2.5 py-2 text-xs font-semibold ${user.is_active ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>{user.is_active ? "Pause" : "Aktifkan"}</button>
                                  <button onClick={() => void handleDeleteUser(user)} className="rounded-lg bg-red-500/15 px-2.5 py-2 text-red-300 hover:bg-red-500/20"><FaTrash size={12} /></button>
                                  {sessionCount > 0 ? (
                                    <button onClick={() => void handleKickAllSessions(user.id, user.email)} className="rounded-lg bg-violet-500/15 px-2.5 py-2 text-violet-300 hover:bg-violet-500/20">Kick</button>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {!loading && activeTab === "orders" ? (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
                <StatMini label="Total Order" value={String(data.orderLeads.length)} />
                <StatMini label="Sudah User" value={String(data.orderLeads.filter((order) => hasAnyLicenseUser(data.users, order.email)).length)} />
                <StatMini label="Belum Ditambahkan" value={String(data.orderLeads.filter((order) => !hasAnyLicenseUser(data.users, order.email)).length)} />
                <StatMini label="Order Valid" value={String(paidOrProcessingOrders.length)} />
                <StatMini label="Nilai Total" value={formatPrice(data.orderLeads.reduce((sum, order) => sum + Number(order.total || 0), 0))} />
              </div>

              <div className="flex justify-end">
                <input
                  value={orderSearch}
                  onChange={(event) => setOrderSearch(event.target.value)}
                  placeholder="Cari nama, email, no HP, produk..."
                  className="w-full rounded-lg border border-dark-700 bg-dark-800 px-3 py-2 text-sm text-white outline-none placeholder:text-dark-500 md:w-80"
                />
              </div>

              <SimpleTable
                headers={["Waktu", "Nama", "Email", "No HP", "Produk", "Total", "Status", "Pengguna", "Aksi"]}
                rows={filteredOrderLeads.map((order) => [
                  formatDate(order.created_at),
                  order.nama || "-",
                  order.email || "-",
                  order.no_hp || "-",
                  order.produk || "-",
                  formatPrice(Number(order.total || 0)),
                  <StatusBadge key="status" status={order.status || "processing"} />,
                  hasMatchingLicenseUser(data.users, order.email, order.produk) ? (
                    <span key="user" className="text-emerald-400">Sudah pengguna</span>
                  ) : hasAnyLicenseUser(data.users, order.email) ? (
                    <span key="user" className="text-amber-400">User produk lain</span>
                  ) : (
                    <span key="user" className="text-dark-500">Belum</span>
                  ),
                  <div key="actions" className="flex flex-wrap gap-2">
                    {!hasMatchingLicenseUser(data.users, order.email, order.produk) ? (
                      <button
                        onClick={() => openCreateUsersFromOrder(order)}
                        className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300"
                      >
                        + Pengguna
                      </button>
                    ) : null}
                    <button
                      onClick={() => void handleDeleteOrderLead(order)}
                      className="rounded-lg bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-300"
                    >
                      Hapus
                    </button>
                  </div>,
                ])}
                emptyMessage="Belum ada order lead."
              />
            </div>
          ) : null}

          {!loading && activeTab === "products" ? (
            <div className="space-y-5">
              <div className="rounded-xl border border-primary-500/20 bg-primary-500/10 px-4 py-3 text-sm text-primary-100">
                Sinkronisasi produk lisensi sekarang otomatis membaca nama produk web dari
                menu Produk memakai slug, judul, dan keyword nama yang dinormalisasi.
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => openProductModal(null)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white"
                >
                  <FaPlus size={12} />
                  Tambah Produk
                </button>
              </div>

              {data.products.length === 0 ? (
                <EmptyState icon={FaBox} title="Belum ada produk lisensi" description="Tambahkan produk seperti di lisensi.html untuk mulai mengatur masa aktif dan fitur default." />
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {data.products.map((product) => (
                    <article key={product.id} className="rounded-2xl border border-dark-800 bg-dark-950/60 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-white">{product.name}</h3>
                          {product.description ? (
                            <p className="mt-2 text-sm leading-6 text-dark-300">
                              {product.description}
                            </p>
                          ) : null}
                        </div>
                        <StatusBadge status={product.is_active ? "active" : "inactive"} />
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-dark-400">
                        {product.default_expiry_days ? (
                          <span className="rounded-full border border-dark-700 px-3 py-1">
                            {product.default_expiry_days} hari
                          </span>
                        ) : null}
                        <span className="rounded-full border border-dark-700 px-3 py-1">
                          {(product.default_features || []).length} fitur
                        </span>
                        {product.sync_keyword ? (
                          <span className="rounded-full border border-primary-500/30 bg-primary-500/10 px-3 py-1 text-primary-300">
                            keyword: {product.sync_keyword}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-4 rounded-xl border border-dark-700 bg-dark-900/60 px-4 py-3 text-sm">
                        {product.matched_catalog_product_slug ? (
                          <>
                            <div className="text-dark-400">Produk web sinkron</div>
                            <div className="mt-1 font-semibold text-white">
                              {product.matched_catalog_product_title}
                            </div>
                            <div className="mt-1 text-xs font-mono text-primary-300">
                              /{product.matched_catalog_product_slug}
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="text-dark-400">Produk web sinkron</div>
                            <div className="mt-1 text-amber-300">
                              Belum ketemu pasangan di menu Produk.
                            </div>
                          </>
                        )}
                      </div>
                      {(product.default_features || []).length > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {(product.default_features || []).map((feature) => (
                            <span key={feature} className="rounded-full bg-primary-500/10 px-3 py-1 text-xs text-primary-300">
                              {feature}
                            </span>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-5 flex flex-wrap gap-2 border-t border-dark-800 pt-4">
                        <button onClick={() => openProductModal(product)} className="rounded-lg bg-dark-800 px-3 py-2 text-xs font-semibold text-dark-200 hover:bg-dark-700">Edit</button>
                        <button onClick={() => void handleDeleteProduct(product)} className="rounded-lg bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-300">Hapus</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {!loading && activeTab === "sessions" ? (
            <div className="space-y-5">
              {data.sessions.length === 0 ? (
                <EmptyState icon={FaWifi} title="Tidak ada sesi aktif" description="Belum ada user yang sedang menjalankan aplikasi saat ini." />
              ) : (
                groupSessionsByEmail(data.sessions).map(([email, sessions]) => (
                  <section key={email} className="rounded-2xl border border-dark-800 bg-dark-950/60">
                    <div className="flex flex-col gap-3 border-b border-dark-800 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-center gap-3">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                        <div className="font-semibold text-white">{email}</div>
                        <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300">
                          {sessions.length} sesi
                        </span>
                      </div>
                      <button
                        onClick={() => void handleKickAllSessions(sessions[0].user_id, email)}
                        className="rounded-lg bg-violet-500/15 px-3 py-2 text-xs font-semibold text-violet-300"
                      >
                        Kick Semua
                      </button>
                    </div>
                    <SimpleTable
                      headers={["Perangkat", "Token", "Mulai", "Heartbeat", "Aksi"]}
                      rows={sessions.map((session) => [
                        session.device_info || "Unknown Device",
                        <code key="token" className="text-xs text-primary-300">
                          {session.session_token.slice(0, 20)}...
                        </code>,
                        timeSince(session.created_at),
                        timeSince(session.last_heartbeat),
                        <button key="kick" onClick={() => void handleKickSession(session)} className="rounded-lg bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-300">Kick</button>,
                      ])}
                      emptyMessage="Tidak ada sesi."
                    />
                  </section>
                ))
              )}
            </div>
          ) : null}

          {!loading && activeTab === "notifications" ? (
            <div className="space-y-5">
              <div className="flex justify-end">
                <button
                  onClick={() => openNotificationModal(null)}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white"
                >
                  <FaPlus size={12} />
                  Tambah Notifikasi
                </button>
              </div>
              {data.notifications.length === 0 ? (
                <EmptyState icon={FaBell} title="Belum ada notifikasi" description="Tambahkan notifikasi popup per produk seperti versi lama." />
              ) : (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  {data.notifications.map((notification) => (
                    <article key={notification.id} className="rounded-2xl border border-dark-800 bg-dark-950/60 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-bold text-white">
                            {notification.title}
                          </h3>
                          <p className="mt-1 text-xs uppercase tracking-[0.18em] text-dark-500">
                            Produk: {notification.product_name}
                          </p>
                        </div>
                        <StatusBadge status={notification.is_active ? "active" : "inactive"} />
                      </div>
                      <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-dark-300">
                        {notification.message}
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-dark-400">
                        <span className="rounded-full border border-dark-700 px-3 py-1">
                          Tipe: {notification.type}
                        </span>
                        <span className="rounded-full border border-dark-700 px-3 py-1">
                          Dibuat: {formatDate(notification.created_at)}
                        </span>
                      </div>
                      <div className="mt-5 flex flex-wrap gap-2 border-t border-dark-800 pt-4">
                        <button onClick={() => openNotificationModal(notification)} className="rounded-lg bg-dark-800 px-3 py-2 text-xs font-semibold text-dark-200 hover:bg-dark-700">Edit</button>
                        <button onClick={() => void handleDeleteNotification(notification)} className="rounded-lg bg-red-500/15 px-3 py-2 text-xs font-semibold text-red-300">Hapus</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {!loading && activeTab === "validate" ? (
            <div className="max-w-3xl space-y-5">
              <div className="flex flex-col gap-3 md:flex-row">
                <input
                  value={validateEmail}
                  onChange={(event) => {
                    setValidateEmail(event.target.value);
                    if (validateResult.checked) resetValidate();
                  }}
                  placeholder="contoh@email.com"
                  className="flex-1 rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-sm text-white outline-none placeholder:text-dark-500"
                />
                <button
                  onClick={submitValidate}
                  className="rounded-xl bg-primary-600 px-5 py-3 text-sm font-semibold text-white"
                >
                  Cek Aktivasi
                </button>
              </div>

              {validateResult.checked ? (
                <div className={`rounded-2xl border p-5 ${validateResult.valid ? "border-emerald-500/20 bg-emerald-500/10" : "border-red-500/20 bg-red-500/10"}`}>
                  <div className="font-semibold text-white">{validateResult.message}</div>
                  {validateResult.users.length > 0 ? (
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      {validateResult.users.map((user) => (
                        <div key={user.id} className="rounded-xl border border-white/10 bg-black/10 px-4 py-3">
                          <div className="text-xs uppercase tracking-[0.18em] text-dark-400">
                            {user.product_name || "Semua Produk"}
                          </div>
                          <div className="mt-2 text-sm text-white">
                            Status: {getStatusLabel(resolveLicenseStatus(user))}
                          </div>
                          <div className="mt-1 text-sm text-dark-300">
                            Kadaluarsa: {formatMaybeDate(user.expiry_date)}
                          </div>
                          <div className="mt-1 text-sm text-dark-300">
                            Max sesi: {user.max_sessions || 1}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {modal.type === "add-user" ? (
        <AddUsersModal
          title="Tambah Pengguna Baru"
          products={data.products}
          submitting={submitting}
          onClose={() => setModal({ type: "none" })}
          onSubmit={async (payload) => {
            const result = await runAction("add-users", payload);
            toast.success(buildProductResultMessage(result));
            setModal({ type: "none" });
          }}
        />
      ) : null}

      {modal.type === "add-product-for-email" ? (
        <AddUsersModal
          title={`Tambah Produk: ${modal.email}`}
          emailDefault={modal.email}
          roleDefault={modal.role}
          products={data.products.filter(
            (product) =>
              !data.users.some(
                (user) => user.email === modal.email && user.product_name === product.name
              )
          )}
          submitting={submitting}
          hideEmailField
          hideRoleField
          onClose={() => setModal({ type: "none" })}
          onSubmit={async (payload) => {
            const result = await runAction("add-users", payload);
            toast.success(buildProductResultMessage(result));
            setModal({ type: "none" });
          }}
        />
      ) : null}

      {modal.type === "edit-user" ? (
        <EditUserModal
          user={modal.user}
          products={data.products}
          submitting={submitting}
          onClose={() => setModal({ type: "none" })}
          onSubmit={async (payload) => {
            await runAction("update-user", payload);
            toast.success("Pengguna diperbarui.");
            setModal({ type: "none" });
          }}
        />
      ) : null}

      {modal.type === "create-users-from-order" ? (
        <AddUsersModal
          title={`Jadikan Pengguna: ${modal.order.email || modal.order.nama || modal.order.id}`}
          emailDefault={modal.order.email || ""}
          roleDefault="user"
          hideEmailField
          products={data.products}
          preselectedProductName={modal.order.produk || ""}
          orderMode
          submitting={submitting}
          onClose={() => setModal({ type: "none" })}
          onSubmit={async (payload) => {
            const result = await runAction("create-users-from-order", {
              orderLeadId: modal.order.id,
              role: payload.role,
              allowedFeatures: payload.allowedFeatures,
              productEntries: payload.productEntries,
            });
            toast.success(buildProductResultMessage(result));
            setModal({ type: "none" });
          }}
        />
      ) : null}

      {modal.type === "product" ? (
        <ProductModal
          product={modal.product}
          submitting={submitting}
          onClose={() => setModal({ type: "none" })}
          onSubmit={async (payload) => {
            if (modal.product) {
              await runAction("update-product", { id: modal.product.id, ...payload });
              toast.success("Produk lisensi diperbarui.");
            } else {
              await runAction("create-product", payload);
              toast.success("Produk lisensi ditambahkan.");
            }
            setModal({ type: "none" });
          }}
        />
      ) : null}

      {modal.type === "notification" ? (
        <NotificationModal
          notification={modal.notification}
          products={data.products}
          submitting={submitting}
          onClose={() => setModal({ type: "none" })}
          onSubmit={async (payload) => {
            if (modal.notification) {
              await runAction("update-notification", {
                id: modal.notification.id,
                ...payload,
              });
              toast.success("Notifikasi diperbarui.");
            } else {
              await runAction("create-notification", payload);
              toast.success("Notifikasi ditambahkan.");
            }
            setModal({ type: "none" });
          }}
        />
      ) : null}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <article className="rounded-[1.5rem] border border-dark-800 bg-dark-950/60 p-5">
      <div className="flex items-start gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${color}`}>
          <Icon className="text-white" size={18} />
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-dark-500">{label}</div>
          <div className="mt-2 text-2xl font-black text-white">{value}</div>
        </div>
      </div>
    </article>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-dark-800 bg-dark-950/60 px-4 py-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-dark-500">{label}</div>
      <div className="mt-2 text-lg font-bold text-white">{value}</div>
    </div>
  );
}

function SimpleTable({
  headers,
  rows,
  emptyMessage,
}: {
  headers: string[];
  rows: Array<Array<React.ReactNode>>;
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <div className="rounded-2xl border border-dashed border-dark-700 bg-dark-950/50 p-10 text-center text-dark-500">{emptyMessage}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="border-b border-dark-800 bg-dark-950/70">
            {headers.map((header) => (
              <th key={header} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-[0.18em] text-dark-500">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-dark-800/60 hover:bg-dark-950/40">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-4 py-3 text-dark-300">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${getStatusColor(normalizeStatusForBadge(status))}`}>
      {getStatusLabel(normalizeStatusForBadge(status))}
    </span>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-dark-700 bg-dark-950/50 px-6 py-12 text-center">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-500/10 text-primary-300">
        <Icon size={22} />
      </div>
      <h3 className="mt-4 text-lg font-bold text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-dark-400">{description}</p>
    </div>
  );
}

function BaseModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[1.75rem] border border-dark-700 bg-dark-900 shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-dark-800 px-5 py-4">
          <h3 className="text-lg font-bold text-white">{title}</h3>
          <button onClick={onClose} className="rounded-lg bg-dark-800 p-2 text-dark-300 hover:text-white">
            <FaTimes size={14} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function AddUsersModal({
  title,
  emailDefault = "",
  roleDefault = "user",
  hideEmailField,
  hideRoleField,
  products,
  preselectedProductName = "",
  orderMode,
  submitting,
  onClose,
  onSubmit,
}: {
  title: string;
  emailDefault?: string;
  roleDefault?: "admin" | "user";
  hideEmailField?: boolean;
  hideRoleField?: boolean;
  products: LicenseProduct[];
  preselectedProductName?: string;
  orderMode?: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    email: string;
    role: "admin" | "user";
    allowedFeatures: string[];
    productEntries: Array<{ productName: string; expiryDate: string; maxSessions: string }>;
  }) => Promise<void>;
}) {
  const [email, setEmail] = useState(emailDefault);
  const [role, setRole] = useState<"admin" | "user">(roleDefault);
  const [features, setFeatures] = useState("");
  const [productEntries, setProductEntries] = useState<ProductEntryForm[]>(
    products.map((product) => ({
      productName: product.name,
      selected: preselectedProductName === product.name,
      expiryDate: buildDefaultExpiryDate(product.default_expiry_days),
      maxSessions: "1",
      badge: preselectedProductName === product.name ? "Produk Order" : null,
    }))
  );

  const availableCount = productEntries.filter((entry) => !entry.disabled).length;

  function toggleProduct(productName: string) {
    setProductEntries((current) =>
      current.map((entry) =>
        entry.productName === productName && !entry.disabled
          ? { ...entry, selected: !entry.selected }
          : entry
      )
    );
  }

  function updateEntry(productName: string, patch: Partial<ProductEntryForm>) {
    setProductEntries((current) =>
      current.map((entry) =>
        entry.productName === productName ? { ...entry, ...patch } : entry
      )
    );
  }

  async function handleSubmit() {
    const selectedEntries = productEntries.filter((entry) => entry.selected);
    if (!hideEmailField && !email.trim()) {
      toast.error("Email harus diisi.");
      return;
    }
    if (selectedEntries.length === 0) {
      toast.error("Pilih minimal 1 produk.");
      return;
    }

    await onSubmit({
      email: email.trim(),
      role,
      allowedFeatures: splitFeatures(features),
      productEntries: selectedEntries.map((entry) => ({
        productName: entry.productName,
        expiryDate: entry.expiryDate,
        maxSessions: entry.maxSessions,
      })),
    });
  }

  return (
    <BaseModal title={title} onClose={onClose}>
      <div className="space-y-5">
        <div className="rounded-xl border border-primary-500/20 bg-primary-500/10 px-4 py-3 text-sm text-primary-100">
          Pilih satu atau lebih produk. Setiap produk bisa diatur masa aktif dan max sesi secara terpisah.
        </div>
        {!hideEmailField ? (
          <Field label="Email">
            <input value={email} onChange={(event) => setEmail(event.target.value)} className={inputClassName} placeholder="user@contoh.com" />
          </Field>
        ) : (
          <Field label="Email">
            <div className={readOnlyBoxClassName}>{emailDefault || "Diambil dari order"}</div>
          </Field>
        )}
        {!hideRoleField ? (
          <Field label="Role">
            <select value={role} onChange={(event) => setRole(event.target.value as "admin" | "user")} className={inputClassName}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </Field>
        ) : null}
        <Field label={`Pilih Produk (${availableCount} tersedia)`}>
          <div className="space-y-3">
            {productEntries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-dark-700 bg-dark-950/50 px-4 py-6 text-sm text-dark-500">
                Tidak ada produk yang bisa dipilih.
              </div>
            ) : (
              productEntries.map((entry) => (
                <div key={entry.productName} className={`rounded-xl border px-4 py-4 ${entry.selected ? "border-primary-500/40 bg-primary-500/10" : "border-dark-700 bg-dark-950/60"} ${entry.disabled ? "opacity-50" : ""}`}>
                  <label className="flex cursor-pointer items-center gap-3">
                    <input type="checkbox" checked={entry.selected} disabled={entry.disabled} onChange={() => toggleProduct(entry.productName)} />
                    <div className="flex-1">
                      <div className="font-semibold text-white">{entry.productName}</div>
                      {entry.badge ? (
                        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                          {entry.badge}
                        </div>
                      ) : null}
                    </div>
                  </label>
                  {entry.selected ? (
                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                      <Field label="Kadaluarsa">
                        <input type="date" value={entry.expiryDate} onChange={(event) => updateEntry(entry.productName, { expiryDate: event.target.value })} className={inputClassName} />
                      </Field>
                      <Field label="Max Sesi">
                        <input type="number" min={1} value={entry.maxSessions} onChange={(event) => updateEntry(entry.productName, { maxSessions: event.target.value })} className={inputClassName} />
                      </Field>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Field>
        <Field label={orderMode ? "Fitur untuk semua produk yang dipilih" : "Fitur (pisahkan koma)"}>
          <input value={features} onChange={(event) => setFeatures(event.target.value)} className={inputClassName} placeholder="video, image, export" />
        </Field>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button onClick={onClose} className={secondaryButtonClassName}>Batal</button>
          <button onClick={() => void handleSubmit()} disabled={submitting} className={primaryButtonClassName}>
            {submitting ? "Menyimpan..." : "Simpan"}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}

function EditUserModal({
  user,
  products,
  submitting,
  onClose,
  onSubmit,
}: {
  user: LicenseUser;
  products: LicenseProduct[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [role, setRole] = useState<"admin" | "user">(user.role);
  const [productName, setProductName] = useState(user.product_name || "");
  const [isActive, setIsActive] = useState(user.is_active);
  const [expiryDate, setExpiryDate] = useState(user.expiry_date || "");
  const [maxSessions, setMaxSessions] = useState(String(user.max_sessions || 1));
  const [features, setFeatures] = useState((user.allowed_features || []).join(", "));

  async function handleSubmit() {
    await onSubmit({
      id: user.id,
      role,
      productName,
      isActive,
      expiryDate,
      maxSessions,
      allowedFeatures: splitFeatures(features),
    });
  }

  return (
    <BaseModal title={`Edit: ${user.email} — ${user.product_name || "Tanpa Produk"}`} onClose={onClose}>
      <div className="space-y-5">
        <Field label="Role">
          <select value={role} onChange={(event) => setRole(event.target.value as "admin" | "user")} className={inputClassName}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <Field label="Produk">
          <select value={productName} onChange={(event) => setProductName(event.target.value)} className={inputClassName}>
            <option value="">-- Tidak Ada --</option>
            {products.map((product) => (
              <option key={product.id} value={product.name}>
                {product.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select value={String(isActive)} onChange={(event) => setIsActive(event.target.value === "true")} className={inputClassName}>
            <option value="true">Aktif</option>
            <option value="false">Nonaktif</option>
          </select>
        </Field>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Kadaluarsa">
            <input type="date" value={expiryDate} onChange={(event) => setExpiryDate(event.target.value)} className={inputClassName} />
          </Field>
          <Field label="Max Sesi">
            <input type="number" min={1} value={maxSessions} onChange={(event) => setMaxSessions(event.target.value)} className={inputClassName} />
          </Field>
        </div>
        <Field label="Fitur (pisahkan koma)">
          <input value={features} onChange={(event) => setFeatures(event.target.value)} className={inputClassName} />
        </Field>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button onClick={onClose} className={secondaryButtonClassName}>Batal</button>
          <button onClick={() => void handleSubmit()} disabled={submitting} className={primaryButtonClassName}>
            {submitting ? "Menyimpan..." : "Perbarui"}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}

function ProductModal({
  product,
  submitting,
  onClose,
  onSubmit,
}: {
  product: LicenseProduct | null;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = useState(product?.name || "");
  const [description, setDescription] = useState(product?.description || "");
  const [expiryDays, setExpiryDays] = useState(
    product?.default_expiry_days ? String(product.default_expiry_days) : ""
  );
  const [features, setFeatures] = useState((product?.default_features || []).join(", "));

  async function handleSubmit() {
    if (!name.trim()) {
      toast.error("Nama produk harus diisi.");
      return;
    }

    await onSubmit({
      name: name.trim(),
      description,
      defaultExpiryDays: expiryDays,
      defaultFeatures: splitFeatures(features),
    });
  }

  return (
    <BaseModal title={product ? "Edit Produk" : "Tambah Produk Baru"} onClose={onClose}>
      <div className="space-y-5">
        <Field label="Nama Produk">
          <input value={name} onChange={(event) => setName(event.target.value)} className={inputClassName} />
        </Field>
        <Field label="Deskripsi">
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} className={`${inputClassName} min-h-24`} />
        </Field>
        <Field label="Default Masa Aktif (hari)">
          <input type="number" min={1} value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)} className={inputClassName} />
        </Field>
        <Field label="Fitur Default (pisahkan koma)">
          <input value={features} onChange={(event) => setFeatures(event.target.value)} className={inputClassName} />
        </Field>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button onClick={onClose} className={secondaryButtonClassName}>Batal</button>
          <button onClick={() => void handleSubmit()} disabled={submitting} className={primaryButtonClassName}>
            {submitting ? "Menyimpan..." : product ? "Perbarui" : "Buat Produk"}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}

function NotificationModal({
  notification,
  products,
  submitting,
  onClose,
  onSubmit,
}: {
  notification: LicenseNotification | null;
  products: LicenseProduct[];
  submitting: boolean;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [productName, setProductName] = useState(notification?.product_name || "");
  const [title, setTitle] = useState(notification?.title || "Pemberitahuan Penting");
  const [message, setMessage] = useState(notification?.message || "");
  const [type, setType] = useState<LicenseNotification["type"]>(notification?.type || "info");
  const [isActive, setIsActive] = useState(notification ? notification.is_active : true);

  async function handleSubmit() {
    if (!productName.trim()) {
      toast.error("Pilih produk dulu.");
      return;
    }
    if (!message.trim()) {
      toast.error("Isi pesan tidak boleh kosong.");
      return;
    }

    await onSubmit({
      productName,
      title: title.trim() || "Pemberitahuan",
      message: message.trim(),
      type,
      isActive,
    });
  }

  return (
    <BaseModal title={notification ? "Edit Notifikasi" : "Tambah Notifikasi"} onClose={onClose}>
      <div className="space-y-5">
        <Field label="Untuk Produk">
          <select value={productName} onChange={(event) => setProductName(event.target.value)} className={inputClassName}>
            <option value="">-- Pilih Produk --</option>
            {products.map((product) => (
              <option key={product.id} value={product.name}>
                {product.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Judul">
          <input value={title} onChange={(event) => setTitle(event.target.value)} className={inputClassName} />
        </Field>
        <Field label="Isi Pesan">
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} className={`${inputClassName} min-h-32`} />
        </Field>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Tipe">
            <select value={type} onChange={(event) => setType(event.target.value as LicenseNotification["type"])} className={inputClassName}>
              <option value="info">Info</option>
              <option value="success">Success</option>
              <option value="warning">Warning</option>
              <option value="danger">Danger</option>
              <option value="light">Light</option>
            </select>
          </Field>
          <Field label="Status">
            <select value={String(isActive)} onChange={(event) => setIsActive(event.target.value === "true")} className={inputClassName}>
              <option value="true">Aktif</option>
              <option value="false">Nonaktif</option>
            </select>
          </Field>
        </div>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button onClick={onClose} className={secondaryButtonClassName}>Batal</button>
          <button onClick={() => void handleSubmit()} disabled={submitting} className={primaryButtonClassName}>
            {submitting ? "Menyimpan..." : notification ? "Perbarui" : "Simpan"}
          </button>
        </div>
      </div>
    </BaseModal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 text-sm font-medium text-dark-300">{label}</div>
      {children}
    </label>
  );
}

function buildDefaultExpiryDate(days: number | null) {
  if (!days) return "";
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

function splitFeatures(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function groupSessionsByEmail(sessions: LicenseSession[]) {
  return Array.from(
    sessions.reduce((map, session) => {
      if (!map.has(session.user_email)) {
        map.set(session.user_email, []);
      }
      map.get(session.user_email)?.push(session);
      return map;
    }, new Map<string, LicenseSession[]>())
  );
}

function hasAnyLicenseUser(users: LicenseUser[], email: string | null) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  return users.some((user) => user.email.trim().toLowerCase() === normalized);
}

function hasMatchingLicenseUser(
  users: LicenseUser[],
  email: string | null,
  productName: string | null
) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedProduct = String(productName || "").trim();
  if (!normalizedEmail || !normalizedProduct) return false;

  return users.some(
    (user) =>
      user.email.trim().toLowerCase() === normalizedEmail &&
      String(user.product_name || "").trim() === normalizedProduct
  );
}

function isUserNotExpired(user: LicenseUser) {
  if (!user.expiry_date) return true;
  return new Date(user.expiry_date) >= new Date(new Date().toDateString());
}

function resolveLicenseStatus(user: LicenseUser) {
  if (!user.is_active) return "cancelled";
  if (!isUserNotExpired(user)) return "failed";
  return "paid";
}

function normalizeStatusForBadge(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (["paid", "processing", "active", "approved", "completed", "published"].includes(normalized)) {
    return "paid";
  }
  if (["pending", "draft"].includes(normalized)) {
    return "pending";
  }
  if (["failed", "expired", "inactive", "rejected"].includes(normalized)) {
    return "failed";
  }
  if (["cancelled", "suspended"].includes(normalized)) {
    return "cancelled";
  }
  return normalized || "pending";
}

function formatMaybeDate(value: string | null) {
  return value ? formatDate(value) : "Unlimited";
}

function timeSince(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Baru saja";
  if (minutes < 60) return `${minutes}m lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}j lalu`;
  return `${Math.floor(hours / 24)}h lalu`;
}

function buildProductResultMessage(result: {
  data?:
    | LicenseBootstrap
    | {
        data?: LicenseBootstrap;
        results?: Array<{ productName: string; status: string }>;
      };
}) {
  const rows =
    result.data && !("configured" in result.data)
      ? result.data.results || []
      : [];
  if (rows.length === 0) {
    return "Perubahan lisensi berhasil disimpan.";
  }

  const success = rows.filter((row) => row.status === "success").length;
  const duplicate = rows.filter((row) => row.status === "duplicate").length;
  const error = rows.filter((row) => row.status === "error").length;

  const parts = [];
  if (success) parts.push(`${success} produk berhasil`);
  if (duplicate) parts.push(`${duplicate} produk duplikat`);
  if (error) parts.push(`${error} produk gagal`);
  return parts.join(", ");
}

const inputClassName =
  "w-full rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-sm text-white outline-none placeholder:text-dark-500";
const readOnlyBoxClassName =
  "rounded-xl border border-dark-700 bg-dark-950/60 px-4 py-3 text-sm text-dark-300";
const secondaryButtonClassName =
  "rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-sm font-semibold text-dark-200";
const primaryButtonClassName =
  "rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60";
