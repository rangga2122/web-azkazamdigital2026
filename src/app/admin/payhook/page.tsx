"use client";

import { useCallback, useEffect, useState } from "react";
import { FaMobileAlt, FaSyncAlt, FaCheckCircle, FaTimesCircle, FaPaperPlane } from "react-icons/fa";
import toast from "react-hot-toast";

type PayhookOrder = {
  id: string;
  order_code: string;
  buyer_name: string;
  buyer_email: string;
  buyer_whatsapp: string;
  product_name: string;
  total_amount: number;
  unique_code: number;
  status: string;
  payment_provider: string | null;
  payment_method: string | null;
  gateway_completed_at: string | null;
  created_at: string;
};

export default function PayhookAdminPage() {
  const [orders, setOrders] = useState<PayhookOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testAmount, setTestAmount] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [authRequired, setAuthRequired] = useState(false);

  useEffect(() => {
    setWebhookUrl(`${window.location.origin}/api/payments/payhook/webhook`);
    void loadData();
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/payhook/orders", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders || []);
      }

      // Check webhook status
      const statusRes = await fetch("/api/payments/payhook/webhook", { cache: "no-store" });
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setAuthRequired(statusData.auth_required ?? false);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  const handleTestWebhook = useCallback(async () => {
    const amount = parseInt(testAmount.replace(/\D/g, ""), 10);
    if (!amount || amount <= 0) {
      toast.error("Masukkan nominal yang valid");
      return;
    }

    setTesting(true);
    try {
      const res = await fetch("/api/payments/payhook/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: amount,
          amount_raw: `Rp ${amount.toLocaleString("id-ID")}`,
          currency: "IDR",
          app: "TEST",
          package_name: "com.payhook.test",
          title: "Test Payment",
          text: `Pembayaran masuk Rp ${amount.toLocaleString("id-ID")}`,
          timestamp: new Date().toISOString(),
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (data.matched) {
          toast.success(`Order ${data.order_code} berhasil di-match & dibayar!`);
          void loadData();
        } else {
          toast(`Tidak ada order matching untuk Rp ${amount.toLocaleString("id-ID")}`, {
            icon: "ℹ️",
          });
        }
      } else {
        toast.error(data.error || "Test webhook gagal");
      }
    } catch {
      toast.error("Gagal mengirim test webhook");
    } finally {
      setTesting(false);
    }
  }, [testAmount]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <FaMobileAlt className="text-emerald-500" />
            PayHook Integration
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Webhook receiver untuk notifikasi pembayaran dari app PayHook
          </p>
        </div>
        <button
          onClick={() => void loadData()}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition"
        >
          <FaSyncAlt className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Info Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">Konfigurasi Webhook</h2>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-600">Webhook URL</label>
            <div className="mt-1 flex items-center gap-2">
              <code className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700 overflow-x-auto">
                {webhookUrl}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(webhookUrl);
                  toast.success("URL disalin!");
                }}
                className="px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition text-sm whitespace-nowrap"
              >
                Copy
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded ${
              authRequired ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
            }`}>
              {authRequired ? <FaCheckCircle /> : <FaTimesCircle />}
              {authRequired ? "Auth aktif" : "Auth belum diatur"}
            </span>
            {authRequired ? (
              <span className="text-gray-500">
                Set Bearer Token / API Key di app PayHook = nilai <code className="px-1 bg-gray-100 rounded">PAYHOOK_WEBHOOK_SECRET</code>
              </span>
            ) : (
              <span className="text-gray-500">
                Set env <code className="px-1 bg-gray-100 rounded">PAYHOOK_WEBHOOK_SECRET</code> di Coolify untuk mengaktifkan auth
              </span>
            )}
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <p className="font-medium mb-1">Cara setup di app PayHook:</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-700">
            <li>Buka app PayHook di HP</li>
            <li>Add Webhook Endpoint → paste URL di atas</li>
            <li>Auth Type: pilih <strong>Bearer Token</strong> atau <strong>API Key</strong></li>
            <li>Masukkan secret key (nilai PAYHOOK_WEBHOOK_SECRET)</li>
            <li>Add e-wallet/bank apps ke watchlist (DANA, GoPay, BCA, dll)</li>
            <li>Test webhook untuk memastikan koneksi</li>
          </ol>
        </div>
      </div>

      {/* Test Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-700">Test Webhook</h2>
        <p className="text-sm text-gray-500">
          Simulasi webhook PayHook dengan nominal tertentu. Jika ada order pending dengan total amount yang cocok, order akan otomatis berubah jadi paid.
        </p>

        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">Rp</span>
              <input
                type="text"
                value={testAmount}
                onChange={(e) => setTestAmount(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && void handleTestWebhook()}
                placeholder="50000"
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
              />
            </div>
          </div>
          <button
            onClick={() => void handleTestWebhook()}
            disabled={testing}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition text-sm whitespace-nowrap"
          >
            <FaPaperPlane />
            {testing ? "Mengirim..." : "Test Webhook"}
          </button>
        </div>
      </div>

      {/* Recent PayHook Orders */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-700 mb-4">Order via PayHook</h2>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-400">
            <FaSyncAlt className="animate-spin mr-2" />
            Memuat...
          </div>
        ) : orders.length === 0 ?(
          <p className="text-center py-8 text-gray-400 text-sm">
            Belum ada order yang dibayar via PayHook
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="pb-2 pr-4">Order Code</th>
                  <th className="pb-2 pr-4">Buyer</th>
                  <th className="pb-2 pr-4">Produk</th>
                  <th className="pb-2 pr-4">Total</th>
                  <th className="pb-2 pr-4">Source</th>
                  <th className="pb-2 pr-4">Paid At</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-gray-50">
                    <td className="py-2 pr-4 font-mono text-xs">{order.order_code}</td>
                    <td className="py-2 pr-4">
                      <div className="font-medium text-gray-700">{order.buyer_name}</div>
                      <div className="text-xs text-gray-400">{order.buyer_whatsapp}</div>
                    </td>
                    <td className="py-2 pr-4">{order.product_name}</td>
                    <td className="py-2 pr-4 font-medium">
                      Rp {Number(order.total_amount).toLocaleString("id-ID")}
                      {order.unique_code > 0 && (
                        <span className="text-xs text-gray-400 ml-1">(+{order.unique_code})</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">
                        {order.payment_method || "payhook"}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-xs text-gray-500">
                      {order.gateway_completed_at
                        ? new Date(order.gateway_completed_at).toLocaleString("id-ID")
                        : "-"}
                    </td>
                    <td className="py-2">
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
