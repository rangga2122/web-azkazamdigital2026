"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FaPlus, FaEdit, FaTrash, FaSave, FaTimes } from "react-icons/fa";
import toast from "react-hot-toast";
import type { FAQ } from "@/types";

export default function AdminFAQsPage() {
  const [items, setItems] = useState<FAQ[]>([]);
  const [editing, setEditing] = useState<FAQ | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ question: "", answer: "", is_active: true, sort_order: 0 });

  useEffect(() => { load(); }, []);
  async function load() { const supabase = createClient(); const { data } = await supabase.from("faqs").select("*").order("sort_order"); setItems((data || []) as FAQ[]); setLoading(false); }
  function startCreate() { setCreating(true); setEditing(null); setForm({ question: "", answer: "", is_active: true, sort_order: 0 }); }
  function startEdit(i: FAQ) { setEditing(i); setCreating(false); setForm({ question: i.question, answer: i.answer, is_active: i.is_active, sort_order: i.sort_order }); }

  async function handleSave() {
    if (!form.question || !form.answer) { toast.error("Pertanyaan dan jawaban wajib diisi."); return; }
    const supabase = createClient();
    if (creating) { await supabase.from("faqs").insert(form); toast.success("Pertanyaan umum dibuat!"); }
    else if (editing) { await supabase.from("faqs").update(form).eq("id", editing.id); toast.success("Pertanyaan umum diperbarui!"); }
    setCreating(false); setEditing(null); load();
  }

  async function handleDelete(id: string) { if (!confirm("Hapus pertanyaan umum?")) return; const supabase = createClient(); await supabase.from("faqs").delete().eq("id", id); toast.success("Dihapus!"); load(); }

  if (editing || creating) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6"><h1 className="text-2xl font-bold text-white">{creating ? "Tambah Pertanyaan Umum" : "Ubah Pertanyaan Umum"}</h1><button onClick={() => { setEditing(null); setCreating(false); }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-dark-400 hover:text-white hover:bg-dark-800"><FaTimes /> Batal</button></div>
        <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-5">
          <div><label className="block text-sm font-medium text-dark-300 mb-2">Pertanyaan *</label><input type="text" value={form.question} onChange={(e) => setForm({...form, question: e.target.value})} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50" /></div>
          <div><label className="block text-sm font-medium text-dark-300 mb-2">Jawaban *</label><textarea value={form.answer} onChange={(e) => setForm({...form, answer: e.target.value})} rows={4} className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50 resize-none" /></div>
          <div className="flex gap-4"><label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({...form, is_active: e.target.checked})} /><span className="text-sm text-dark-300">Aktif</span></label><div><label className="text-sm text-dark-300">Urutan</label><input type="number" value={form.sort_order} onChange={(e) => setForm({...form, sort_order: parseInt(e.target.value)||0})} className="ml-2 w-20 px-3 py-1 rounded-lg bg-dark-800 border border-dark-700 text-white text-sm" /></div></div>
          <button onClick={handleSave} className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 text-white font-bold shadow-lg"><FaSave /> Simpan</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6"><h1 className="text-2xl font-bold text-white">Pertanyaan Umum</h1><button onClick={startCreate} className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-600 text-white text-sm font-semibold"><FaPlus size={12} /> Tambah</button></div>
      {loading ? <div className="text-dark-400">Memuat...</div> : items.length === 0 ? <div className="text-center py-16 text-dark-500">Belum ada pertanyaan umum.</div> : (
        <div className="space-y-3">
          {items.map(i => (
            <div key={i.id} className="rounded-xl bg-dark-900 border border-dark-800 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1"><div className="text-white font-medium mb-1">{i.question}</div><div className="text-dark-400 text-sm">{i.answer}</div></div>
                <div className="flex gap-1 ml-4"><button onClick={() => startEdit(i)} className="p-1.5 rounded-lg text-dark-400 hover:text-primary-400 hover:bg-primary-500/10"><FaEdit size={12} /></button><button onClick={() => handleDelete(i.id)} className="p-1.5 rounded-lg text-dark-400 hover:text-red-400 hover:bg-red-500/10"><FaTrash size={12} /></button></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
