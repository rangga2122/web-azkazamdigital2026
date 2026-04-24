"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FaPlus, FaEdit, FaTrash, FaSave, FaTimes } from "react-icons/fa";
import toast from "react-hot-toast";
import type { Category } from "@/types";

export default function AdminCategoriesPage() {
  const [items, setItems] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", slug: "", description: "", image_url: "", sort_order: 0 });

  useEffect(() => { load(); }, []);

  async function load() {
    const supabase = createClient();
    const { data } = await supabase.from("categories").select("*").order("sort_order");
    setItems((data || []) as Category[]); setLoading(false);
  }

  function startCreate() { setCreating(true); setEditing(null); setForm({ name: "", slug: "", description: "", image_url: "", sort_order: 0 }); }
  function startEdit(item: Category) { setEditing(item); setCreating(false); setForm({ name: item.name, slug: item.slug, description: item.description || "", image_url: item.image_url || "", sort_order: item.sort_order }); }

  async function handleSave() {
    if (!form.name || !form.slug) { toast.error("Nama dan slug wajib."); return; }
    const supabase = createClient();
    if (creating) { const { error } = await supabase.from("categories").insert(form); if (error) { toast.error(error.message); return; } toast.success("Kategori dibuat!"); }
    else if (editing) { const { error } = await supabase.from("categories").update(form).eq("id", editing.id); if (error) { toast.error(error.message); return; } toast.success("Kategori diperbarui!"); }
    setCreating(false); setEditing(null); load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Hapus kategori ini?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) { toast.error(error.message); return; } toast.success("Kategori dihapus!"); load();
  }

  if (editing || creating) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white">{creating ? "Tambah Kategori" : "Ubah Kategori"}</h1>
          <button onClick={() => { setEditing(null); setCreating(false); }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800"><FaTimes /> Batal</button>
        </div>
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><label className="block text-sm font-medium text-dark-300 mb-2">Nama *</label><input type="text" value={form.name} onChange={(e) => setForm({...form, name: e.target.value, slug: form.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g,'-')})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" /></div>
            <div><label className="block text-sm font-medium text-dark-300 mb-2">Slug *</label><input type="text" value={form.slug} onChange={(e) => setForm({...form, slug: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" /></div>
          </div>
          <div><label className="block text-sm font-medium text-dark-300 mb-2">Deskripsi</label><textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} rows={3} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50 resize-none" /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div><label className="block text-sm font-medium text-dark-300 mb-2">URL Gambar</label><input type="text" value={form.image_url} onChange={(e) => setForm({...form, image_url: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" placeholder="/uploads/categories/image.jpg" /></div>
            <div><label className="block text-sm font-medium text-dark-300 mb-1">Urutan</label><input type="number" value={form.sort_order} onChange={(e) => setForm({...form, sort_order: parseInt(e.target.value)||0})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white text-sm focus:outline-none focus:border-primary-500/50" /></div>
          </div>
          <button onClick={handleSave} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 text-white font-bold shadow-lg"><FaSave /> Simpan</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Kategori</h1>
        <button onClick={startCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-semibold"><FaPlus size={12} /> Tambah</button>
      </div>
      {loading ? <div className="text-dark-400">Memuat...</div> : items.length === 0 ? <div className="text-center py-16 text-dark-500">Belum ada kategori.</div> : (
        <div className="rounded-2xl bg-dark-900 border border-dark-800 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-dark-700 bg-dark-850"><th className="text-left text-dark-400 py-3 px-4">Nama</th><th className="text-left text-dark-400 py-3 px-4">Slug</th><th className="text-left text-dark-400 py-3 px-4">Urutan</th><th className="text-right text-dark-400 py-3 px-4">Aksi</th></tr></thead><tbody>
          {items.map((item) => (<tr key={item.id} className="border-b border-dark-800 hover:bg-dark-800/50"><td className="py-3 px-4 text-white font-medium">{item.name}</td><td className="py-3 px-4 text-dark-400 font-mono text-xs">/{item.slug}</td><td className="py-3 px-4 text-dark-400">{item.sort_order}</td><td className="py-3 px-4 text-right"><div className="flex items-center justify-end gap-2"><button onClick={() => startEdit(item)} className="p-2 rounded-lg text-dark-400 hover:text-primary-400 hover:bg-primary-500/10"><FaEdit size={14} /></button><button onClick={() => handleDelete(item.id)} className="p-2 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10"><FaTrash size={14} /></button></div></td></tr>))}
        </tbody></table></div></div>
      )}
    </div>
  );
}
