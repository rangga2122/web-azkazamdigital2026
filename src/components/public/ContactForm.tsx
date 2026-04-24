"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import toast from "react-hot-toast";

export function ContactForm({
  formTitle,
  buttonLabel,
  messagePlaceholder,
}: {
  formTitle: string;
  buttonLabel: string;
  messagePlaceholder: string;
}) {
  const pathname = usePathname();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });

  function updateField(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.name.trim() || !form.email.trim() || !form.subject.trim() || !form.message.trim()) {
      toast.error("Silakan lengkapi semua field terlebih dahulu.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          subject: form.subject.trim(),
          message: form.message.trim(),
          source_path: pathname || "/kontak",
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error || "Pesan gagal dikirim.");
      }

      toast.success(
        payload.message || "Pesan berhasil dikirim. Tim kami akan segera menghubungi Anda."
      );
      setForm({
        name: "",
        email: "",
        subject: "",
        message: "",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Pesan gagal dikirim.";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-2xl bg-dark-900 border border-dark-800 p-6 sm:p-10">
      <h2 className="text-xl font-bold text-white mb-6">{formTitle}</h2>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Nama
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(event) => updateField("name", event.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
              placeholder="Nama Anda"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Email
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(event) => updateField("email", event.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
              placeholder="nama@email.com"
              disabled={submitting}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-dark-300 mb-2">
            Subjek
          </label>
          <input
            type="text"
            value={form.subject}
            onChange={(event) => updateField("subject", event.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
            placeholder="Subjek pesan"
            disabled={submitting}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-dark-300 mb-2">
            Pesan
          </label>
          <textarea
            rows={5}
            value={form.message}
            onChange={(event) => updateField("message", event.target.value)}
            className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50 resize-none"
            placeholder={messagePlaceholder}
            disabled={submitting}
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 text-white font-bold shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 transition-all duration-300 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {submitting ? "Mengirim..." : buttonLabel}
        </button>
      </form>
    </div>
  );
}
