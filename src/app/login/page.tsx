"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
      router.replace(redirect);
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Gagal masuk";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
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
          placeholder="admin@azkazamdigital.com"
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
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full px-6 py-3.5 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 text-white font-bold shadow-lg shadow-primary-500/25 transition-all disabled:opacity-50"
      >
        {loading ? "Memproses..." : "Masuk"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950">
      <div className="mx-auto max-w-md px-4 w-full">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 text-white font-bold text-xl mb-4">
            AZ
          </div>
          <h1 className="text-2xl font-bold text-white">Masuk</h1>
          <p className="text-dark-400 mt-2">Masuk ke akun Anda</p>
        </div>
        <Suspense
          fallback={<div className="text-center text-dark-400">Memuat...</div>}
        >
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
