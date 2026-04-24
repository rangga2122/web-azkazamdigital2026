"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getStatusColor, getStatusLabel } from "@/lib/utils";
import { FaTrash } from "react-icons/fa";
import toast from "react-hot-toast";
import type { Affiliate } from "@/types";

export default function AdminAffiliatesPage() {
  const [items, setItems] = useState<Affiliate[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase
      .from("affiliates")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data || []) as Affiliate[]);
    setLoading(false);
  }

  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);

  async function updateStatus(id: string, status: string) {
    const supabase = createClient();
    const { error } = await supabase
      .from("affiliates")
      .update({
        status,
        approved_at: status === "approved" ? new Date().toISOString() : null,
      })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Status afiliasi diperbarui!");
    load();
  }

  async function handleDelete(affiliate: Affiliate) {
    if (!confirm(`Hapus afiliasi ${affiliate.full_name}?`)) return;

    const supabase = createClient();
    const { error } = await supabase
      .from("affiliates")
      .delete()
      .eq("id", affiliate.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Afiliasi dihapus!");
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Afiliasi</h1>
      {loading ? (
        <div className="text-dark-400">Memuat...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-dark-500">
          Belum ada afiliasi.
        </div>
      ) : (
        <div className="rounded-2xl bg-dark-900 border border-dark-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700 bg-dark-850">
                  <th className="text-left text-dark-400 py-3 px-4">Nama</th>
                  <th className="text-left text-dark-400 py-3 px-4">Email</th>
                  <th className="text-left text-dark-400 py-3 px-4">Kode</th>
                  <th className="text-left text-dark-400 py-3 px-4">
                    Order Valid
                  </th>
                  <th className="text-left text-dark-400 py-3 px-4">
                    WhatsApp
                  </th>
                  <th className="text-left text-dark-400 py-3 px-4">Bank</th>
                  <th className="text-left text-dark-400 py-3 px-4">Status</th>
                  <th className="text-right text-dark-400 py-3 px-4">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((aff) => (
                  <tr
                    key={aff.id}
                    className="border-b border-dark-800 hover:bg-dark-800/50"
                  >
                    <td className="py-3 px-4 text-white font-medium">
                      {aff.full_name}
                    </td>
                    <td className="py-3 px-4 text-dark-400 text-xs">
                      {aff.email}
                    </td>
                    <td className="py-3 px-4 text-accent-400 font-mono text-xs font-semibold">
                      {aff.referral_code}
                    </td>
                    <td className="py-3 px-4 text-dark-300 text-xs font-mono">
                      {aff.qualifying_order_id
                        ? `${aff.qualifying_order_id.slice(0, 8)}...`
                        : "-"}
                    </td>
                    <td className="py-3 px-4 text-dark-300 text-xs">
                      {aff.whatsapp || "-"}
                    </td>
                    <td className="py-3 px-4 text-dark-300 text-xs">
                      {aff.payout_method ||
                      aff.payout_account_number ||
                      aff.payout_account ? (
                        <div>
                          <div className="font-medium text-white">
                            {aff.payout_method || "-"}
                          </div>
                          <div className="text-dark-500">
                            {aff.payout_account_number || "-"}
                          </div>
                          <div className="text-dark-500">
                            {aff.payout_account || "-"}
                          </div>
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-md text-xs font-semibold ${getStatusColor(
                          aff.status
                        )}`}
                      >
                        {getStatusLabel(aff.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <select
                          value={aff.status}
                          onChange={(e) => updateStatus(aff.id, e.target.value)}
                          className="px-2 py-1 rounded-lg bg-dark-800 border border-dark-700 text-white text-xs focus:outline-none"
                        >
                          <option value="pending">Menunggu</option>
                          <option value="approved">Disetujui</option>
                          <option value="rejected">Ditolak</option>
                          <option value="suspended">Ditangguhkan</option>
                        </select>
                        <button
                          onClick={() => handleDelete(aff)}
                          className="p-2 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10"
                          title="Hapus afiliasi"
                        >
                          <FaTrash size={13} />
                        </button>
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
