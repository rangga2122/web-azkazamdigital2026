"use client";
import { useEffect, useState } from "react";
import { AdminCollectionToolbar } from "@/components/admin/AdminCollectionToolbar";
import {
  compareAdminDates,
  compareAdminNumbers,
  compareAdminStrings,
  matchesAdminSearch,
} from "@/lib/admin-collections";
import { createClient } from "@/lib/supabase/client";
import { FaPlus, FaEdit, FaTrash, FaSave, FaTimes } from "react-icons/fa";
import toast from "react-hot-toast";
import type { Testimonial } from "@/types";

export default function AdminTestimonialsPage() {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("order-asc");
  const [form, setForm] = useState({ name: "", role: "", quote: "", avatar_url: "", rating: 5, is_active: true, sort_order: 0 });

  useEffect(() => { load(); }, []);
  async function load() { const supabase = createClient(); const { data } = await supabase.from("testimonials").select("*").order("sort_order"); setItems((data || []) as Testimonial[]); setLoading(false); }
  function startCreate() { setCreating(true); setEditing(null); setForm({ name: "", role: "", quote: "", avatar_url: "", rating: 5, is_active: true, sort_order: 0 }); }
  function startEdit(i: Testimonial) { setEditing(i); setCreating(false); setForm({ name: i.name, role: i.role || "", quote: i.quote, avatar_url: i.avatar_url || "", rating: i.rating, is_active: i.is_active, sort_order: i.sort_order }); }

  async function handleSave() {
    if (!form.name || !form.quote) { toast.error("Nama dan testimoni wajib diisi."); return; }
    const supabase = createClient();
    if (creating) { const { error } = await supabase.from("testimonials").insert(form); if (error) { toast.error(error.message); return; } toast.success("Testimoni dibuat!"); }
    else if (editing) { const { error } = await supabase.from("testimonials").update(form).eq("id", editing.id); if (error) { toast.error(error.message); return; } toast.success("Testimoni diperbarui!"); }
    setCreating(false); setEditing(null); load();
  }

  async function handleDelete(id: string) { if (!confirm("Hapus?")) return; const supabase = createClient(); await supabase.from("testimonials").delete().eq("id", id); toast.success("Dihapus!"); load(); }

  const filteredItems = items
    .filter((item) => {
      if (statusFilter === "active" && !item.is_active) return false;
      if (statusFilter === "inactive" && item.is_active) return false;
      return matchesAdminSearch(
        searchQuery,
        item.name,
        item.role,
        item.quote,
        item.rating
      );
    })
    .sort((left, right) => {
      switch (sortBy) {
        case "newest":
          return compareAdminDates(left.created_at, right.created_at, "desc");
        case "highest-rating":
          return compareAdminNumbers(left.rating, right.rating, "desc");
        case "name":
          return compareAdminStrings(left.name, right.name);
        case "order-desc":
          return compareAdminNumbers(left.sort_order, right.sort_order, "desc");
        case "order-asc":
        default:
          return compareAdminNumbers(left.sort_order, right.sort_order, "asc");
      }
    });

  if (editing || creating) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6"><h1 className="text-2xl font-bold text-white">{creating ? "Tambah Testimoni" : "Ubah Testimoni"}</h1><button onClick={() => { setEditing(null); setCreating(false); }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800"><FaTimes /> Batal</button></div>
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><label className="block text-sm font-medium text-dark-300 mb-2">Nama *</label><input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" /></div>
            <div><label className="block text-sm font-medium text-dark-300 mb-2">Jabatan</label><input type="text" value={form.role} onChange={(e) => setForm({...form, role: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" /></div>
          </div>
          <div><label className="block text-sm font-medium text-dark-300 mb-2">Testimoni *</label><textarea value={form.quote} onChange={(e) => setForm({...form, quote: e.target.value})} rows={4} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50 resize-none" /></div>
          <div><label className="block text-sm font-medium text-dark-300 mb-2">URL Avatar</label><input type="text" value={form.avatar_url} onChange={(e) => setForm({...form, avatar_url: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" placeholder="/uploads/testimonials/avatar.jpg" /></div>
          <div className="flex gap-4">
            <div><label className="block text-sm font-medium text-dark-300 mb-2">Penilaian (1-5)</label><input type="number" min={1} max={5} value={form.rating} onChange={(e) => setForm({...form, rating: parseInt(e.target.value)||5})} className="w-20 px-3 py-2 rounded-lg bg-dark-800 border border-dark-700 text-white text-sm focus:outline-none" /></div>
            <label className="flex items-end gap-2 cursor-pointer pb-1"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({...form, is_active: e.target.checked})} /><span className="text-sm text-dark-300">Aktif</span></label>
          </div>
          <button onClick={handleSave} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 text-white font-bold shadow-lg"><FaSave /> Simpan</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6"><h1 className="text-2xl font-bold text-white">Testimoni</h1><button onClick={startCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-semibold"><FaPlus size={12} /> Tambah</button></div>
      <AdminCollectionToolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Cari nama, jabatan, atau isi testimoni..."
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
              { label: "Urutan manual", value: "order-asc" },
              { label: "Urutan manual tertinggi", value: "order-desc" },
              { label: "Terbaru dibuat", value: "newest" },
              { label: "Rating tertinggi", value: "highest-rating" },
              { label: "Nama A-Z", value: "name" },
            ],
          },
        ]}
        summary={`${filteredItems.length} dari ${items.length} testimoni`}
      />
      {loading ? <div className="text-dark-400">Memuat...</div> : filteredItems.length === 0 ? <div className="text-center py-16 text-dark-500">Tidak ada testimoni yang cocok.</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredItems.map(i => (
            <div key={i.id} className="rounded-2xl bg-dark-900 border border-dark-800 p-5">
              <div className="flex items-start justify-between mb-3">
                <div><div className="text-white font-semibold">{i.name}</div>{i.role && <div className="text-dark-500 text-xs">{i.role}</div>}</div>
                <div className="flex gap-1"><button onClick={() => startEdit(i)} className="p-1.5 rounded-lg text-dark-400 hover:text-primary-400 hover:bg-primary-500/10"><FaEdit size={12} /></button><button onClick={() => handleDelete(i.id)} className="p-1.5 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10"><FaTrash size={12} /></button></div>
              </div>
              <p className="text-dark-300 text-sm mb-2">&ldquo;{i.quote}&rdquo;</p>
              <div className="flex items-center justify-between">
                <div className="text-amber-400 text-xs">{"⭐".repeat(i.rating)}</div>
                <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${i.is_active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-400'}`}>{i.is_active ? 'Aktif' : 'Nonaktif'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
