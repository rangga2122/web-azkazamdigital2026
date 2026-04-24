"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPrice, formatDate, getStatusColor, getStatusLabel } from "@/lib/utils";
import { FaTrash } from "react-icons/fa";
import toast from "react-hot-toast";
import type { Order } from "@/types";

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("orders").select("*").order("created_at", { ascending: false });
    setOrders((data || []) as Order[]);
    setLoading(false);
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function updateStatus(id: string, status: string) {
    const response = await fetch(`/api/admin/orders/${id}/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status }),
    });

    const payload = (await response.json()) as {
      error?: string;
      email?: { error?: string; skipped?: boolean };
    };

    if (!response.ok) {
      toast.error(payload.error || "Gagal memperbarui status.");
      return;
    }

    if (payload.email?.error) {
      toast.error(`Status tersimpan, tetapi email gagal: ${payload.email.error}`);
    } else {
      toast.success("Status diperbarui!");
    }

    load();
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

  const filtered = filter === "all" ? orders : orders.filter(o => o.status === filter);

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
              <td className="py-3 px-4"><div className="text-white text-xs">{order.buyer_name}</div><div className="text-dark-500 text-xs">{order.buyer_whatsapp}</div></td>
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
                  <select value={order.status} onChange={(e) => updateStatus(order.id, e.target.value)} className="px-2 py-1 rounded-lg bg-dark-800 border border-dark-700 text-white text-xs focus:outline-none">
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
    </div>
  );
}
