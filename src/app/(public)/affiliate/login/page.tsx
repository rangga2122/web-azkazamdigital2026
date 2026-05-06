"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_AFFILIATE_LOGIN_PASSWORD } from "@/lib/affiliate-password";
import Link from "next/link";
import toast from "react-hot-toast";

export default function AffiliateLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  function getLoginErrorMessage(err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal masuk";

    if (message.toLowerCase().includes("email not confirmed")) {
      return "Email belum dikonfirmasi. Cek inbox Anda lalu klik tautan konfirmasi sebelum masuk.";
    }

    return message;
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast.success("Berhasil masuk!");
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      toast.error(getLoginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-20">
      <div className="mx-auto max-w-md px-4 w-full">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-primary-500 text-white font-bold text-xl mb-4">
            AZ
          </div>
          <h1 className="text-2xl font-bold text-white">Masuk Afiliasi</h1>
          <p className="text-dark-400 mt-2">
            Masuk ke dasbor afiliasi Anda
          </p>
        </div>

        <form
          onSubmit={handleLogin}
          className="rounded-2xl bg-dark-900 border border-dark-800 p-6 space-y-5"
        >
          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
              placeholder="affiliate@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-dark-300 mb-2">
              Kata Sandi
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 text-white focus:outline-none focus:border-primary-500/50"
              placeholder="password"
            />
            <p className="mt-2 text-xs text-dark-400">
              Untuk akun member yang dibuat otomatis, gunakan password default{" "}
              <span className="font-semibold text-accent-300">
                {DEFAULT_AFFILIATE_LOGIN_PASSWORD}
              </span>
              . Setelah berhasil login, segera ubah password di menu Pengaturan Profil.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-accent-600 to-primary-600 text-white font-bold shadow-lg shadow-accent-500/25 hover:shadow-accent-500/40 transition-all disabled:opacity-50"
          >
            {loading ? "Memproses..." : "Masuk"}
          </button>
        </form>

        <p className="text-center text-dark-500 text-sm mt-6">
          Belum punya akun?{" "}
          <Link
            href="/affiliate/register"
            className="text-accent-400 hover:text-accent-300 font-medium"
          >
            Daftar sekarang
          </Link>
        </p>
      </div>
    </div>
  );
}
