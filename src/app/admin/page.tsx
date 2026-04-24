"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatPrice } from "@/lib/utils";
import {
  FaBox, FaFileAlt, FaUsers, FaShoppingCart,
  FaMoneyBillWave, FaMousePointer, FaChartLine,
} from "react-icons/fa";
import type { DashboardStats } from "@/types";

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0,
    totalPages: 0,
    totalAffiliates: 0,
    totalOrders: 0,
    totalCommissions: 0,
    totalClicks: 0,
    totalSales: 0,
    totalRevenue: 0,
  });
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    const supabase = createClient();

    const [products, pages, affiliates, orders, commissions, clicks] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("pages").select("id", { count: "exact", head: true }),
      supabase.from("affiliates").select("id", { count: "exact", head: true }),
      supabase.from("orders").select("*"),
      supabase.from("commissions").select("*"),
      supabase.from("affiliate_clicks").select("id", { count: "exact", head: true }),
    ]);

    const orderData = orders.data || [];
    const commData = commissions.data || [];
    const paidOrders = orderData.filter((o) => o.status === "paid");
    const totalRevenue = paidOrders.reduce((sum, o) => sum + Number(o.price), 0);
    const totalCommissions = commData.reduce((sum, c) => sum + Number(c.amount), 0);

    setStats({
      totalProducts: products.count || 0,
      totalPages: pages.count || 0,
      totalAffiliates: affiliates.count || 0,
      totalOrders: orderData.length,
      totalCommissions,
      totalClicks: clicks.count || 0,
      totalSales: paidOrders.length,
      totalRevenue,
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadStats);
  }, [loadStats]);

  const statCards = [
    { icon: FaBox, label: "Total Produk", value: stats.totalProducts.toString(), color: "from-blue-500 to-primary-500" },
    { icon: FaFileAlt, label: "Total Halaman", value: stats.totalPages.toString(), color: "from-emerald-500 to-teal-500" },
    { icon: FaUsers, label: "Total Afiliasi", value: stats.totalAffiliates.toString(), color: "from-accent-500 to-pink-500" },
    { icon: FaShoppingCart, label: "Total Pesanan", value: stats.totalOrders.toString(), color: "from-amber-500 to-orange-500" },
    { icon: FaChartLine, label: "Total Penjualan", value: stats.totalSales.toString(), color: "from-green-500 to-emerald-500" },
    { icon: FaMousePointer, label: "Total Klik Referal", value: stats.totalClicks.toString(), color: "from-cyan-500 to-blue-500" },
    { icon: FaMoneyBillWave, label: "Total Pendapatan", value: formatPrice(stats.totalRevenue), color: "from-yellow-500 to-amber-500" },
    { icon: FaMoneyBillWave, label: "Total Komisi", value: formatPrice(stats.totalCommissions), color: "from-red-500 to-rose-500" },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Dasbor</h1>

      {loading ? (
        <div className="text-dark-400">Memuat data...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="rounded-2xl bg-dark-900 border border-dark-800 p-5 hover:border-dark-700 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-r ${card.color}`}>
                  <card.icon className="text-white" size={16} />
                </div>
                <span className="text-dark-400 text-sm">{card.label}</span>
              </div>
              <div className="text-xl font-bold text-white">{card.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
