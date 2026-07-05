"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FaUsers, FaEye, FaMousePointer, FaGlobe, FaDesktop, FaMobileAlt, FaTabletAlt } from "react-icons/fa";

type VisitorSession = {
  id: string;
  session_id: string;
  ip_address: string | null;
  country_name: string | null;
  city: string | null;
  region: string | null;
  device_type: string | null;
  os: string | null;
  browser: string | null;
  referrer: string | null;
  landing_page: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  page_views_count: number;
  first_seen_at: string;
  last_seen_at: string;
};

type PageView = {
  id: string;
  session_id: string;
  path: string;
  title: string | null;
  query_params: string | null;
  created_at: string;
};

type AnalyticsSummary = {
  totalSessions: number;
  totalPageViews: number;
  uniqueCountries: number;
  todaySessions: number;
  topPages: { path: string; views: number }[];
  topCountries: { name: string; count: number }[];
  deviceBreakdown: { device: string; count: number }[];
  recentSessions: VisitorSession[];
  recentPageViews: PageView[];
};

const PERIOD_OPTIONS = [
  { value: "1", label: "24 jam terakhir" },
  { value: "7", label: "7 hari terakhir" },
  { value: "30", label: "30 hari terakhir" },
];

export default function AnalyticsPage() {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState("30");
  const [error, setError] = useState<string | null>(null);

  const supabase = createClient();

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const since = new Date();
      since.setDate(since.getDate() - Number(days));
      const sinceIso = since.toISOString();

      const { data: sessions, error: sessionsError } = await supabase
        .from("visitor_sessions")
        .select("*")
        .gte("last_seen_at", sinceIso)
        .order("last_seen_at", { ascending: false })
        .limit(500);

      if (sessionsError) throw sessionsError;

      const { data: pageViews, error: viewsError } = await supabase
        .from("page_views")
        .select("*")
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (viewsError) throw viewsError;

      const sessionList = (sessions || []) as VisitorSession[];
      const viewList = (pageViews || []) as PageView[];

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todaySessions = sessionList.filter((s) => new Date(s.last_seen_at) >= todayStart).length;

      const pageCounts: Record<string, number> = {};
      for (const v of viewList) {
        pageCounts[v.path] = (pageCounts[v.path] || 0) + 1;
      }
      const topPages = Object.entries(pageCounts)
        .map(([path, views]) => ({ path, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);

      const countryCounts: Record<string, number> = {};
      for (const s of sessionList) {
        const name = s.country_name || "Tidak diketahui";
        countryCounts[name] = (countryCounts[name] || 0) + 1;
      }
      const topCountries = Object.entries(countryCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const deviceCounts: Record<string, number> = {};
      for (const s of sessionList) {
        const device = s.device_type || "unknown";
        deviceCounts[device] = (deviceCounts[device] || 0) + 1;
      }
      const deviceBreakdown = Object.entries(deviceCounts)
        .map(([device, count]) => ({ device, count }))
        .sort((a, b) => b.count - a.count);

      setSummary({
        totalSessions: sessionList.length,
        totalPageViews: viewList.length,
        uniqueCountries: Object.keys(countryCounts).length,
        todaySessions,
        topPages,
        topCountries,
        deviceBreakdown,
        recentSessions: sessionList.slice(0, 50),
        recentPageViews: viewList.slice(0, 50),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat data analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [days]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDeviceIcon = (device: string | null) => {
    switch (device) {
      case "mobile":
        return <FaMobileAlt className="text-blue-500" />;
      case "tablet":
        return <FaTabletAlt className="text-purple-500" />;
      default:
        return <FaDesktop className="text-emerald-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Analitik Pengunjung</h1>
          <p className="text-sm text-dark-400">Lacak pengunjung website berdasarkan IP, lokasi, dan halaman.</p>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="rounded-xl border border-dark-700 bg-dark-900 px-4 py-2 text-sm text-white focus:border-primary-500 focus:outline-none"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">{error}</div>
      ) : null}

      {loading || !summary ? (
        <div className="text-sm text-dark-400">Memuat data...</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard icon={<FaUsers />} label="Total Sesi" value={summary.totalSessions} color="text-sky-500" />
            <StatCard icon={<FaEye />} label="Total Page Views" value={summary.totalPageViews} color="text-emerald-500" />
            <StatCard icon={<FaGlobe />} label="Negara Unik" value={summary.uniqueCountries} color="text-violet-500" />
            <StatCard icon={<FaMousePointer />} label="Sesi Hari Ini" value={summary.todaySessions} color="text-amber-500" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-dark-800 bg-dark-900/50 p-5">
              <h2 className="mb-4 text-sm font-semibold text-white">Halaman Terpopuler</h2>
              {summary.topPages.length === 0 ? (
                <p className="text-sm text-dark-400">Belum ada data.</p>
              ) : (
                <div className="space-y-2">
                  {summary.topPages.map((page) => (
                    <div key={page.path} className="flex items-center justify-between rounded-lg bg-dark-800/50 px-3 py-2 text-sm">
                      <span className="truncate text-dark-200" title={page.path}>{page.path}</span>
                      <span className="ml-3 rounded-full bg-primary-500/20 px-2 py-0.5 text-xs font-bold text-primary-400">{page.views}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-dark-800 bg-dark-900/50 p-5">
              <h2 className="mb-4 text-sm font-semibold text-white">Negara Teratas</h2>
              {summary.topCountries.length === 0 ? (
                <p className="text-sm text-dark-400">Belum ada data.</p>
              ) : (
                <div className="space-y-2">
                  {summary.topCountries.map((country) => (
                    <div key={country.name} className="flex items-center justify-between rounded-lg bg-dark-800/50 px-3 py-2 text-sm">
                      <span className="text-dark-200">{country.name}</span>
                      <span className="ml-3 rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-bold text-emerald-400">{country.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-dark-800 bg-dark-900/50 p-5">
              <h2 className="mb-4 text-sm font-semibold text-white">Perangkat</h2>
              {summary.deviceBreakdown.length === 0 ? (
                <p className="text-sm text-dark-400">Belum ada data.</p>
              ) : (
                <div className="space-y-2">
                  {summary.deviceBreakdown.map((item) => (
                    <div key={item.device} className="flex items-center justify-between rounded-lg bg-dark-800/50 px-3 py-2 text-sm">
                      <span className="flex items-center gap-2 capitalize text-dark-200">
                        {getDeviceIcon(item.device)} {item.device}
                      </span>
                      <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-bold text-blue-400">{item.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-dark-800 bg-dark-900/50 p-5">
              <h2 className="mb-4 text-sm font-semibold text-white">Sesi Terbaru</h2>
              {summary.recentSessions.length === 0 ? (
                <p className="text-sm text-dark-400">Belum ada data.</p>
              ) : (
                <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                  {summary.recentSessions.map((session) => (
                    <div key={session.id} className="rounded-lg bg-dark-800/50 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-white">{session.ip_address || "Unknown IP"}</span>
                        <span className="text-dark-500">{formatDate(session.last_seen_at)}</span>
                      </div>
                      <div className="mt-1 text-dark-400">
                        {[session.country_name, session.city, session.region].filter(Boolean).join(", ") || "Lokasi tidak diketahui"}
                      </div>
                      <div className="mt-0.5 text-dark-500">
                        {session.browser || "Browser unknown"} · {session.os || "OS unknown"} · {session.page_views_count} views
                      </div>
                      {session.referrer ? (
                        <div className="mt-0.5 truncate text-dark-600">Referrer: {session.referrer}</div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-dark-800 bg-dark-900/50 p-5">
            <h2 className="mb-4 text-sm font-semibold text-white">Page View Terbaru</h2>
            {summary.recentPageViews.length === 0 ? (
              <p className="text-sm text-dark-400">Belum ada data.</p>
            ) : (
              <div className="max-h-96 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-dark-900 text-dark-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Waktu</th>
                      <th className="px-3 py-2 font-medium">Halaman</th>
                      <th className="px-3 py-2 font-medium">Judul</th>
                      <th className="px-3 py-2 font-medium">Session</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-800">
                    {summary.recentPageViews.map((view) => (
                      <tr key={view.id} className="text-dark-300">
                        <td className="px-3 py-2 whitespace-nowrap">{formatDate(view.created_at)}</td>
                        <td className="px-3 py-2">{view.path}</td>
                        <td className="px-3 py-2">{view.title || "-"}</td>
                        <td className="px-3 py-2 font-mono text-dark-500">{view.session_id.slice(0, 8)}...</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-dark-800 bg-dark-900/50 p-5">
      <div className={`mb-3 text-2xl ${color}`}>{icon}</div>
      <div className="text-2xl font-bold text-white">{value.toLocaleString("id-ID")}</div>
      <div className="text-xs text-dark-400">{label}</div>
    </div>
  );
}
