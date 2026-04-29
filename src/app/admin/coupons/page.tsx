"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminCollectionToolbar } from "@/components/admin/AdminCollectionToolbar";
import {
  compareAdminDates,
  compareAdminNumbers,
  compareAdminStrings,
  matchesAdminSearch,
} from "@/lib/admin-collections";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatPrice } from "@/lib/utils";
import { FaEdit, FaPlus, FaSave, FaTimes, FaTrash } from "react-icons/fa";
import toast from "react-hot-toast";
import type { CouponCode } from "@/types";

const emptyForm = {
  code: "",
  name: "",
  discount_type: "fixed" as CouponCode["discount_type"],
  discount_value: 0,
  usage_limit: "",
  is_active: true,
};

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState<CouponCode[]>([]);
  const [editing, setEditing] = useState<CouponCode | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [form, setForm] = useState(emptyForm);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("coupon_codes")
      .select("*")
      .order("created_at", { ascending: false });
    setCoupons((data || []) as CouponCode[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  function startCreate() {
    setCreating(true);
    setEditing(null);
    setForm(emptyForm);
  }

  function startEdit(coupon: CouponCode) {
    setCreating(false);
    setEditing(coupon);
    setForm({
      code: coupon.code,
      name: coupon.name || "",
      discount_type: coupon.discount_type,
      discount_value: Number(coupon.discount_value || 0),
      usage_limit: coupon.usage_limit?.toString() || "",
      is_active: coupon.is_active,
    });
  }

  function cancel() {
    setCreating(false);
    setEditing(null);
  }

  async function handleSave() {
    const code = form.code.trim().toUpperCase();
    if (!code) {
      toast.error("Kode kupon wajib diisi.");
      return;
    }
    if (form.discount_value <= 0) {
      toast.error("Nilai diskon harus lebih dari 0.");
      return;
    }

    const payload = {
      code,
      name: form.name.trim() || null,
      discount_type: form.discount_type,
      discount_value: form.discount_value,
      usage_limit: form.usage_limit ? Number(form.usage_limit) : null,
      is_active: form.is_active,
    };

    const supabase = createClient();
    const query = creating
      ? supabase.from("coupon_codes").insert(payload)
      : supabase.from("coupon_codes").update(payload).eq("id", editing?.id);
    const { error } = await query;

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success(creating ? "Kupon dibuat!" : "Kupon diperbarui!");
    cancel();
    await load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus kode kupon ini?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("coupon_codes").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Kupon dihapus!");
    await load();
  }

  function discountLabel(coupon: CouponCode) {
    return coupon.discount_type === "percent"
      ? `${Number(coupon.discount_value)}%`
      : formatPrice(Number(coupon.discount_value));
  }

  const filteredCoupons = coupons
    .filter((coupon) => {
      if (statusFilter === "active" && !coupon.is_active) return false;
      if (statusFilter === "inactive" && coupon.is_active) return false;
      return matchesAdminSearch(
        searchQuery,
        coupon.code,
        coupon.name,
        coupon.discount_type,
        coupon.usage_count
      );
    })
    .sort((left, right) => {
      switch (sortBy) {
        case "oldest":
          return compareAdminDates(left.created_at, right.created_at, "asc");
        case "usage-most":
          return compareAdminNumbers(left.usage_count, right.usage_count, "desc");
        case "code":
          return compareAdminStrings(left.code, right.code);
        case "newest":
        default:
          return compareAdminDates(left.created_at, right.created_at, "desc");
      }
    });

  if (creating || editing) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">{creating ? "Tambah Kupon" : "Ubah Kupon"}</h1>
          <button onClick={cancel} className="flex items-center gap-2 px-4 py-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800">
            <FaTimes /> Batal
          </button>
        </div>
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Kode Kupon *</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" placeholder="PROMO50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Nama Promo</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" placeholder="Promo Launching" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Jenis Diskon</label>
              <select value={form.discount_type} onChange={(e) => setForm({ ...form, discount_type: e.target.value as CouponCode["discount_type"] })} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50">
                <option value="fixed">Nominal Rupiah</option>
                <option value="percent">Persen</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Nilai Diskon</label>
              <input type="number" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: Number(e.target.value) || 0 })} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-300 mb-2">Batas Pemakaian</label>
              <input type="number" value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" placeholder="Kosongkan tanpa batas" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
            <span className="text-sm text-dark-300">Kupon aktif</span>
          </label>
          <button onClick={handleSave} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 text-white font-bold">
            <FaSave /> Simpan
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Kode Kupon</h1>
        <button onClick={startCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700">
          <FaPlus size={12} /> Tambah Kupon
        </button>
      </div>
      <AdminCollectionToolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Cari kode kupon, nama promo, atau tipe diskon..."
        selects={[
          {
            label: "Status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
              { label: "Semua status", value: "all" },
              { label: "Aktif", value: "active" },
              { label: "Nonaktif", value: "inactive" },
            ],
          },
          {
            label: "Urutkan",
            value: sortBy,
            onChange: setSortBy,
            options: [
              { label: "Kupon terbaru", value: "newest" },
              { label: "Kupon terlama", value: "oldest" },
              { label: "Paling sering dipakai", value: "usage-most" },
              { label: "Kode A-Z", value: "code" },
            ],
          },
        ]}
        summary={`${filteredCoupons.length} dari ${coupons.length} kupon`}
      />
      {loading ? (
        <div className="text-dark-400">Memuat...</div>
      ) : filteredCoupons.length === 0 ? (
        <div className="text-center py-16 text-dark-500">Tidak ada kupon yang cocok.</div>
      ) : (
        <div className="rounded-2xl bg-dark-900 border border-dark-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-700 bg-dark-850">
                  <th className="text-left text-dark-400 py-3 px-4">Kode</th>
                  <th className="text-left text-dark-400 py-3 px-4">Diskon</th>
                  <th className="text-left text-dark-400 py-3 px-4">Pemakaian</th>
                  <th className="text-left text-dark-400 py-3 px-4">Status</th>
                  <th className="text-left text-dark-400 py-3 px-4">Tanggal</th>
                  <th className="text-right text-dark-400 py-3 px-4">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredCoupons.map((coupon) => (
                  <tr key={coupon.id} className="border-b border-dark-800 hover:bg-dark-800/50">
                    <td className="py-3 px-4">
                      <div className="text-primary-300 font-mono font-semibold">{coupon.code}</div>
                      {coupon.name && <div className="text-dark-500 text-xs">{coupon.name}</div>}
                    </td>
                    <td className="py-3 px-4 text-white font-semibold">{discountLabel(coupon)}</td>
                    <td className="py-3 px-4 text-dark-300">{coupon.usage_count}{coupon.usage_limit ? ` / ${coupon.usage_limit}` : ""}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${coupon.is_active ? "bg-emerald-500/20 text-emerald-400" : "bg-gray-500/20 text-gray-400"}`}>
                        {coupon.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-dark-400 text-xs">{formatDate(coupon.created_at)}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => startEdit(coupon)} className="p-2 rounded-lg text-dark-400 hover:text-primary-400 hover:bg-primary-500/10"><FaEdit size={14} /></button>
                        <button onClick={() => handleDelete(coupon.id)} className="p-2 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10"><FaTrash size={14} /></button>
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
