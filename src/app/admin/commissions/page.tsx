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
import toast from "react-hot-toast";
import type { Commission } from "@/types";

export default function AdminCommissionsPage() {
  const [items, setItems] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("commissions").select("*").order("created_at", { ascending: false });
    setItems((data || []) as Commission[]); setLoading(false);
  }, []);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function updateStatus(id: string, status: string) {
    const supabase = createClient();
    const { error } = await supabase.from("commissions").update({ status }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Status komisi diperbarui!"); load();
  }

  const filteredItems = items
    .filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      return matchesAdminSearch(
        searchQuery,
        item.id,
        item.referral_code,
        item.order_id,
        item.product_id,
        item.affiliate_id
      );
    })
    .sort((left, right) => {
      switch (sortBy) {
        case "oldest":
          return compareAdminDates(left.created_at, right.created_at, "asc");
        case "amount-high":
          return compareAdminNumbers(left.amount, right.amount, "desc");
        case "amount-low":
          return compareAdminNumbers(left.amount, right.amount, "asc");
        case "newest":
        default:
          return compareAdminDates(left.created_at, right.created_at, "desc");
      }
    });

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Komisi</h1>
      <AdminCollectionToolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Cari ID komisi, referral code, order ID, atau affiliate ID..."
        selects={[
          {
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { label: "Semua status", value: "all" },
              { label: "Menunggu", value: "pending" },
              { label: "Disetujui", value: "approved" },
              { label: "Dibayar", value: "paid" },
              { label: "Ditolak", value: "rejected" },
            ],
          },
          {
            label: "Urutkan",
            value: sortBy,
            onChange: setSortBy,
            options: [
              { label: "Komisi terbaru", value: "newest" },
              { label: "Komisi terlama", value: "oldest" },
              { label: "Nilai tertinggi", value: "amount-high" },
              { label: "Nilai terendah", value: "amount-low" },
            ],
          },
        ]}
        summary={`${filteredItems.length} dari ${items.length} komisi`}
      />
      {loading ? <div className="text-dark-400">Memuat...</div> : filteredItems.length === 0 ? <div className="text-center py-16 text-dark-500">Tidak ada komisi yang cocok.</div> : (
        <div className="rounded-2xl bg-dark-900 border border-dark-800 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-dark-700 bg-dark-850">
          <th className="text-left text-dark-400 py-3 px-4">ID</th>
          <th className="text-left text-dark-400 py-3 px-4">Jumlah</th>
          <th className="text-left text-dark-400 py-3 px-4">Status</th>
          <th className="text-left text-dark-400 py-3 px-4">Tanggal</th>
          <th className="text-right text-dark-400 py-3 px-4">Aksi</th>
        </tr></thead><tbody>
          {filteredItems.map((c) => (
            <tr key={c.id} className="border-b border-dark-800 hover:bg-dark-800/50">
              <td className="py-3 px-4 text-dark-400 font-mono text-xs">{c.id.slice(0,8)}...</td>
              <td className="py-3 px-4 text-white font-semibold">{formatPrice(c.amount)}</td>
              <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${getStatusColor(c.status)}`}>{getStatusLabel(c.status)}</span></td>
              <td className="py-3 px-4 text-dark-400 text-xs">{formatDate(c.created_at)}</td>
              <td className="py-3 px-4 text-right">
                <select value={c.status} onChange={(e) => updateStatus(c.id, e.target.value)} className="px-2 py-1 rounded-lg bg-dark-800 border border-dark-700 text-white text-xs focus:outline-none">
                  <option value="pending">Menunggu</option><option value="approved">Disetujui</option><option value="paid">Dibayar</option><option value="rejected">Ditolak</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody></table></div></div>
      )}
    </div>
  );
}
