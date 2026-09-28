"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Email/password salah");

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
          placeholder="••••••••"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 rounded-xl bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white font-semibold transition-colors"
      >
        {loading ? "Memproses..." : "Masuk"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
