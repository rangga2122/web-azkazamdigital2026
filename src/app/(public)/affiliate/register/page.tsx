"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generateReferralCode } from "@/lib/utils";
import Link from "next/link";
import toast from "react-hot-toast";

export default function AffiliateRegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    whatsapp: "",
    payout_method: "",
    payout_account_number: "",
    payout_account: "",
    password: "",
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.full_name || !form.email || !form.password) {
      toast.error("Lengkapi semua field wajib.");
      return;
    }

    setLoading(true);

    try {
      const refCode = generateReferralCode(form.full_name);
      const registerRes = await fetch("/api/affiliate/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: form.full_name,
          email: form.email,
          password: form.password,
          whatsapp: form.whatsapp || null,
          payout_method: form.payout_method || null,
          payout_account_number: form.payout_account_number || null,
          payout_account: form.payout_account || null,
          referral_code: refCode,
        }),
      });

      const registerData = (await registerRes.json()) as {
        error?: string;
      };

      if (!registerRes.ok) {
        throw new Error(registerData.error || "Pendaftaran afiliasi gagal.");
      }

      toast.success(
        "Pendaftaran berhasil! Cek email untuk konfirmasi akun, lalu tunggu persetujuan admin."
      );
      router.push("/affiliate/login");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Pendaftaran gagal";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-20">
      <div className="mx-auto max-w-md px-4 w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white">Daftar Afiliasi</h1>
          <p className="text-dark-400 mt-2">
            Mulai menghasilkan dengan menjadi afiliasi kami
          </p>
          <p className="text-dark-500 text-sm mt-3">
            Pendaftaran hanya untuk pelanggan dengan pesanan yang sudah dibayar.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Nama Lengkap <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
              placeholder="Nama lengkap"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Email <span className="text-red-400">*</span>
            </label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
              className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
              placeholder="email@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Nomor WhatsApp
            </label>
            <input
              type="tel"
              name="whatsapp"
              value={form.whatsapp}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
              placeholder="6281234567890"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Nama Bank
            </label>
            <input
              type="text"
              name="payout_method"
              value={form.payout_method}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
              placeholder="BCA, BRI, Mandiri, DANA, dll."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Nama Pemilik Rekening
            </label>
            <input
              type="text"
              name="payout_account"
              value={form.payout_account}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
              placeholder="Nama sesuai rekening"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Nomor Rekening
            </label>
            <input
              type="text"
              inputMode="numeric"
              name="payout_account_number"
              value={form.payout_account_number}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
              placeholder="Nomor rekening / e-wallet"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Kata Sandi <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
              minLength={6}
              className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
              placeholder="Min. 6 karakter"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-accent-600 to-primary-600 text-white font-bold shadow-lg shadow-accent-500/25 transition-all disabled:opacity-50"
          >
            {loading ? "Memproses..." : "Daftar Afiliasi"}
          </button>
        </form>

        <p className="text-center text-dark-500 text-sm mt-6">
          Sudah punya akun?{" "}
          <Link
            href="/affiliate/login"
            className="text-accent-400 hover:text-accent-300 font-medium"
          >
            Masuk di sini
          </Link>
        </p>
      </div>
    </div>
  );
}
