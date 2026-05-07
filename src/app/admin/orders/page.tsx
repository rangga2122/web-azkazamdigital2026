"use client";
import { useCallback, useEffect, useState } from "react";
import { AdminCollectionToolbar } from "@/components/admin/AdminCollectionToolbar";
import {
  compareAdminDates,
  compareAdminNumbers,
  matchesAdminSearch,
} from "@/lib/admin-collections";
import { createClient } from "@/lib/supabase/client";
import { formatPrice, formatDate, getStatusColor, getStatusLabel } from "@/lib/utils";
import { FaTimes, FaTrash } from "react-icons/fa";
import toast from "react-hot-toast";
import type { Order } from "@/types";
import type { LicenseProduct } from "@/types/license-manager";

type OrderStatus = Order["status"];

type LicenseRegistrationPayload = {
  enabled: boolean;
  role: "admin" | "user";
  allowedFeatures: string[];
  productEntries: Array<{
    productName: string;
    expiryDate: string;
    maxSessions: string;
  }>;
};

type ModalState =
  | { type: "none" }
  | { type: "mark-paid"; order: Order };

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [licenseProducts, setLicenseProducts] = useState<LicenseProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [licenseProductsLoading, setLicenseProductsLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [modal, setModal] = useState<ModalState>({ type: "none" });

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    setOrders((data || []) as Order[]);
    setLoading(false);
  }, []);

  const loadLicenseProducts = useCallback(async () => {
    if (licenseProductsLoading || licenseProducts.length > 0) return;

    setLicenseProductsLoading(true);
    try {
      const response = await fetch("/api/admin/licenses", {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        error?: string;
        data?: {
          products?: LicenseProduct[];
        };
      };

      if (!response.ok || !payload.data?.products) {
        throw new Error(payload.error || "Gagal memuat daftar produk lisensi.");
      }

      setLicenseProducts(payload.data.products);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal memuat daftar produk lisensi."
      );
    } finally {
      setLicenseProductsLoading(false);
    }
  }, [licenseProducts.length, licenseProductsLoading]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function updateStatus(
    id: string,
    status: OrderStatus,
    licenseRegistration?: LicenseRegistrationPayload
  ) {
    const response = await fetch(`/api/admin/orders/${id}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status, licenseRegistration }),
    });

    const payload = (await response.json()) as {
      error?: string;
      email?: { error?: string; skipped?: boolean };
      whatsapp?: { error?: string; skipped?: boolean };
      license?: {
        error?: string;
        skipped?: boolean;
        created?: number;
        extended?: number;
        reactivated?: number;
        failed?: number;
      };
    };

    if (!response.ok) {
      toast.error(payload.error || "Gagal memperbarui status.");
      return;
    }

    const notices = ["Status diperbarui!"];
    if (payload.license && !payload.license.skipped) {
      if (payload.license.error) {
        notices.push(`Registrasi lisensi gagal: ${payload.license.error}`);
      } else {
        const created = Number(payload.license.created || 0);
        const extended = Number(payload.license.extended || 0);
        const reactivated = Number(payload.license.reactivated || 0);
        const failed = Number(payload.license.failed || 0);
        if (created > 0) notices.push(`Lisensi dibuat ${created}`);
        if (extended > 0) notices.push(`Lisensi diperpanjang ${extended}`);
        if (reactivated > 0) notices.push(`Lisensi diaktifkan lagi ${reactivated}`);
        if (failed > 0) notices.push(`Lisensi gagal ${failed}`);
      }
    }
    if (payload.email?.error) {
      notices.push(`Email gagal: ${payload.email.error}`);
    }
    if (payload.whatsapp?.error) {
      notices.push(`WA gagal: ${payload.whatsapp.error}`);
    }

    if (payload.email?.error || payload.whatsapp?.error || payload.license?.error) {
      toast.error(notices.join(" | "));
    } else {
      toast.success(notices.join(" | "));
    }

    load();
  }

  async function handleStatusChange(order: Order, status: OrderStatus) {
    if (status === "paid" && order.status !== "paid") {
      setModal({ type: "mark-paid", order });
      if (licenseProducts.length === 0) {
        await loadLicenseProducts();
      }
      return;
    }

    await updateStatus(order.id, status);
  }

  async function handleDelete(order: Order) {
    if (!confirm(`Hapus pesanan ${order.order_code}?`)) return;

    const supabase = createClient();
    const { error } = await supabase.from("orders").delete().eq("id", order.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Pesanan dihapus!");
    load();
  }

  const filtered = orders
    .filter((order) => {
      if (filter !== "all" && order.status !== filter) return false;
      return matchesAdminSearch(
        searchQuery,
        order.order_code,
        order.product_name,
        order.buyer_name,
        order.buyer_email,
        order.buyer_whatsapp,
        order.coupon_code,
        order.referral_code
      );
    })
    .sort((left, right) => {
      switch (sortBy) {
        case "oldest":
          return compareAdminDates(left.created_at, right.created_at, "asc");
        case "total-high":
          return compareAdminNumbers(getOrderTotal(left), getOrderTotal(right), "desc");
        case "total-low":
          return compareAdminNumbers(getOrderTotal(left), getOrderTotal(right), "asc");
        case "newest":
        default:
          return compareAdminDates(left.created_at, right.created_at, "desc");
      }
    });

  function getOrderTotal(order: Order) {
    return Number(order.total_amount || order.price || 0);
  }

  function getOrderSubtotal(order: Order) {
    return Number(order.subtotal || order.price || 0);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Pesanan</h1>
        <div className="flex gap-2">
          {["all", "pending", "paid", "failed", "cancelled"].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${filter === s ? 'bg-primary-500/20 text-primary-400' : 'bg-dark-800 text-dark-400 hover:text-white'}`}>
              {s === "all" ? "Semua" : getStatusLabel(s)}
            </button>
          ))}
        </div>
      </div>
      <AdminCollectionToolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Cari kode, produk, nama pembeli, WhatsApp, atau kupon..."
        selects={[
          {
            label: "Urutkan",
            value: sortBy,
            onChange: setSortBy,
            options: [
              { label: "Pesanan terbaru", value: "newest" },
              { label: "Pesanan terlama", value: "oldest" },
              { label: "Total tertinggi", value: "total-high" },
              { label: "Total terendah", value: "total-low" },
            ],
          },
        ]}
        summary={`${filtered.length} dari ${orders.length} pesanan`}
      />

      {loading ? <div className="text-dark-400">Memuat...</div> : filtered.length === 0 ? <div className="text-center py-16 text-dark-500">Tidak ada pesanan.</div> : (
        <div className="rounded-2xl bg-dark-900 border border-dark-800 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-dark-700 bg-dark-850">
          <th className="text-left text-dark-400 py-3 px-4">Kode Pesanan</th>
          <th className="text-left text-dark-400 py-3 px-4">Produk</th>
          <th className="text-left text-dark-400 py-3 px-4">Pembeli</th>
          <th className="text-left text-dark-400 py-3 px-4">Total</th>
          <th className="text-left text-dark-400 py-3 px-4">Status</th>
          <th className="text-left text-dark-400 py-3 px-4">Tanggal</th>
          <th className="text-right text-dark-400 py-3 px-4">Aksi</th>
        </tr></thead><tbody>
          {filtered.map((order) => (
            <tr key={order.id} className="border-b border-dark-800 hover:bg-dark-800/50">
              <td className="py-3 px-4 text-primary-400 font-mono text-xs font-semibold">{order.order_code}</td>
              <td className="py-3 px-4 text-white">{order.product_name}</td>
              <td className="py-3 px-4">
                <div className="text-white text-xs">{order.buyer_name}</div>
                <div className="text-dark-400 text-xs">{order.buyer_email}</div>
                <div className="text-dark-500 text-xs">{order.buyer_whatsapp}</div>
              </td>
              <td className="py-3 px-4">
                <div className="text-white font-semibold">{formatPrice(getOrderTotal(order))}</div>
                <div className="text-dark-500 text-xs">
                  {formatPrice(getOrderSubtotal(order))}
                  {Number(order.discount_amount || 0) > 0 && ` - diskon ${formatPrice(Number(order.discount_amount))}`}
                  {Number(order.unique_code || 0) > 0 && ` + unik ${formatPrice(Number(order.unique_code))}`}
                </div>
              </td>
              <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${getStatusColor(order.status)}`}>{getStatusLabel(order.status)}</span></td>
              <td className="py-3 px-4 text-dark-400 text-xs">{formatDate(order.created_at)}</td>
              <td className="py-3 px-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <select value={order.status} onChange={(e) => void handleStatusChange(order, e.target.value as OrderStatus)} className="px-2 py-1 rounded-lg bg-dark-800 border border-dark-700 text-white text-xs focus:outline-none">
                    <option value="pending">Menunggu</option><option value="paid">Dibayar</option><option value="failed">Gagal</option><option value="cancelled">Dibatalkan</option>
                  </select>
                  <button
                    onClick={() => handleDelete(order)}
                    className="p-2 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10"
                    title="Hapus pesanan"
                  >
                    <FaTrash size={13} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody></table></div></div>
      )}

      {modal.type === "mark-paid" ? (
        <MarkPaidModal
          key={`${modal.order.id}-${licenseProducts.length}`}
          order={modal.order}
          products={licenseProducts}
          loadingProducts={licenseProductsLoading}
          onClose={() => setModal({ type: "none" })}
          onSubmit={async (licenseRegistration) => {
            await updateStatus(modal.order.id, "paid", licenseRegistration);
            setModal({ type: "none" });
          }}
          onSubmitWithoutRegistration={async () => {
            await updateStatus(modal.order.id, "paid");
            setModal({ type: "none" });
          }}
        />
      ) : null}
    </div>
  );
}

function MarkPaidModal({
  order,
  products,
  loadingProducts,
  onClose,
  onSubmit,
  onSubmitWithoutRegistration,
}: {
  order: Order;
  products: LicenseProduct[];
  loadingProducts: boolean;
  onClose: () => void;
  onSubmit: (payload: LicenseRegistrationPayload) => Promise<void>;
  onSubmitWithoutRegistration: () => Promise<void>;
}) {
  const [role, setRole] = useState<"admin" | "user">("user");
  const [features, setFeatures] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [productEntries, setProductEntries] = useState(() =>
    buildProductEntries(products, order)
  );

  const selectedCount = productEntries.filter((entry) => entry.selected).length;

  function toggleProduct(productName: string) {
    setProductEntries((current) =>
      current.map((entry) =>
        entry.productName === productName
          ? { ...entry, selected: !entry.selected }
          : entry
      )
    );
  }

  function updateEntry(
    productName: string,
    patch: Partial<{
      expiryDate: string;
      maxSessions: string;
    }>
  ) {
    setProductEntries((current) =>
      current.map((entry) =>
        entry.productName === productName ? { ...entry, ...patch } : entry
      )
    );
  }

  async function handleSubmit() {
    const selectedEntries = productEntries.filter((entry) => entry.selected);
    if (selectedEntries.length === 0) {
      toast.error("Pilih minimal 1 produk lisensi.");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        enabled: true,
        role,
        allowedFeatures: splitFeatures(features),
        productEntries: selectedEntries.map((entry) => ({
          productName: entry.productName,
          expiryDate: entry.expiryDate,
          maxSessions: entry.maxSessions,
        })),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitWithoutRegistration() {
    setSubmitting(true);
    try {
      await onSubmitWithoutRegistration();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[1.75rem] border border-dark-700 bg-dark-900 shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between border-b border-dark-800 px-5 py-4">
          <div>
            <h3 className="text-lg font-bold text-white">Jadikan Dibayar + Registrasi Lisensi</h3>
            <p className="mt-1 text-xs text-dark-400">
              {order.buyer_email} • {order.product_name}
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg bg-dark-800 p-2 text-dark-300 hover:text-white">
            <FaTimes size={14} />
          </button>
        </div>
        <div className="space-y-5 p-5">
          <div className="rounded-xl border border-primary-500/20 bg-primary-500/10 px-4 py-3 text-sm text-primary-100">
            Saat status diubah ke <strong>Dibayar</strong>, sistem bisa langsung membuat akses lisensi untuk produk yang dibeli dan mengirim akses lewat email/WhatsApp. Jika email yang sama sudah punya produk itu, masa aktif akan diperpanjang otomatis. Jika sudah kadaluarsa, lisensi akan aktif lagi mulai hari ini.
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-dark-300">Email Pembeli</label>
              <div className="rounded-xl border border-dark-700 bg-dark-950/60 px-4 py-3 text-sm text-dark-300">
                {order.buyer_email}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-dark-300">Role</label>
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as "admin" | "user")}
                className="w-full rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-sm text-white"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-dark-300">
              Pilih Produk Lisensi {loadingProducts ? "(memuat...)" : `(${products.length} tersedia)`}
            </label>
            <div className="space-y-3">
              {loadingProducts ? (
                <div className="rounded-xl border border-dashed border-dark-700 bg-dark-950/50 px-4 py-6 text-sm text-dark-400">
                  Memuat daftar produk lisensi...
                </div>
              ) : productEntries.length === 0 ? (
                <div className="rounded-xl border border-dashed border-dark-700 bg-dark-950/50 px-4 py-6 text-sm text-dark-400">
                  Produk lisensi belum tersedia.
                </div>
              ) : (
                productEntries.map((entry) => (
                  <div
                    key={entry.productName}
                    className={`rounded-xl border px-4 py-4 ${
                      entry.selected
                        ? "border-primary-500/40 bg-primary-500/10"
                        : "border-dark-700 bg-dark-950/60"
                    }`}
                  >
                    <label className="flex cursor-pointer items-center gap-3">
                      <input
                        type="checkbox"
                        checked={entry.selected}
                        onChange={() => toggleProduct(entry.productName)}
                      />
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
                        <div>
                          <label className="mb-2 block text-sm font-medium text-dark-300">Kadaluarsa</label>
                          <input
                            type="date"
                            value={entry.expiryDate}
                            onChange={(event) =>
                              updateEntry(entry.productName, {
                                expiryDate: event.target.value,
                              })
                            }
                            className="w-full rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-dark-300">Max Sesi</label>
                          <input
                            type="number"
                            min={1}
                            value={entry.maxSessions}
                            onChange={(event) =>
                              updateEntry(entry.productName, {
                                maxSessions: event.target.value,
                              })
                            }
                            className="w-full rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-sm text-white"
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
            <div className="mt-2 text-xs text-dark-500">
              Produk terpilih: {selectedCount}
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-dark-300">
              Fitur Tambahan Global (opsional, pisahkan koma)
            </label>
            <input
              value={features}
              onChange={(event) => setFeatures(event.target.value)}
              placeholder="video, export, bonus"
              className="w-full rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-sm text-white"
            />
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              onClick={onClose}
              disabled={submitting}
              className="rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-sm font-semibold text-dark-200"
            >
              Batal
            </button>
            <button
              onClick={() => void handleSubmitWithoutRegistration()}
              disabled={submitting}
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-semibold text-amber-200"
            >
              {submitting ? "Memproses..." : "Dibayar Saja"}
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={submitting || loadingProducts}
              className="rounded-xl bg-primary-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Menyimpan..." : "Dibayar + Registrasi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildProductEntries(products: LicenseProduct[], order: Order) {
  const matchedProductName =
    products.find(
      (product) => product.matched_catalog_product_id === order.product_id
    )?.name || "";

  return products.map((product) => ({
    productName: product.name,
    selected: product.name === matchedProductName,
    expiryDate: buildDefaultExpiryDate(product.default_expiry_days),
    maxSessions: "1",
    badge: product.name === matchedProductName ? "Produk Order" : null,
  }));
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
