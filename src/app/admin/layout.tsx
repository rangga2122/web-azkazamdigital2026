"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FaHome, FaFileAlt, FaBox, FaTags, FaStar, FaQuestionCircle,
  FaShoppingCart, FaUsers, FaMoneyBillWave, FaCog, FaImage,
  FaChartBar, FaSignOutAlt, FaBars, FaTimes, FaBullhorn, FaTicketAlt, FaInbox, FaWhatsapp, FaNewspaper, FaShieldAlt,
} from "react-icons/fa";
import toast from "react-hot-toast";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadInboxCount, setUnreadInboxCount] = useState(0);

  const loadUnreadInboxCount = useCallback(async () => {
    const supabase = createClient();
    const { count } = await supabase
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("is_read", false);

    setUnreadInboxCount(count || 0);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUnreadInboxCount();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadUnreadInboxCount, pathname]);

  useEffect(() => {
    const handleUnreadRefresh = () => {
      void loadUnreadInboxCount();
    };

    window.addEventListener("admin-contact-unread-changed", handleUnreadRefresh);
    return () => {
      window.removeEventListener("admin-contact-unread-changed", handleUnreadRefresh);
    };
  }, [loadUnreadInboxCount]);

  const menuItems = useMemo(
    () => [
      {
        href: "/admin",
        icon: FaHome,
        label: "Dasbor",
        iconColor: "text-sky-500",
      },
      {
        href: "/admin/inbox",
        icon: FaInbox,
        label: "Inbox",
        badge: unreadInboxCount,
        iconColor: "text-violet-500",
      },
      {
        href: "/admin/pages",
        icon: FaFileAlt,
        label: "Halaman",
        iconColor: "text-amber-500",
      },
      {
        href: "/admin/articles",
        icon: FaNewspaper,
        label: "Artikel",
        iconColor: "text-orange-500",
      },
      {
        href: "/admin/products",
        icon: FaBox,
        label: "Produk",
        iconColor: "text-emerald-500",
      },
      {
        href: "/admin/categories",
        icon: FaTags,
        label: "Kategori",
        iconColor: "text-pink-500",
      },
      {
        href: "/admin/testimonials",
        icon: FaStar,
        label: "Testimoni",
        iconColor: "text-yellow-500",
      },
      {
        href: "/admin/faqs",
        icon: FaQuestionCircle,
        label: "Pertanyaan Umum",
        iconColor: "text-cyan-500",
      },
      {
        href: "/admin/orders",
        icon: FaShoppingCart,
        label: "Pesanan",
        iconColor: "text-indigo-500",
      },
      {
        href: "/admin/coupons",
        icon: FaTicketAlt,
        label: "Kode Kupon",
        iconColor: "text-rose-500",
      },
      {
        href: "/admin/affiliates",
        icon: FaUsers,
        label: "Afiliasi",
        iconColor: "text-purple-500",
      },
      {
        href: "/admin/commissions",
        icon: FaMoneyBillWave,
        label: "Komisi",
        iconColor: "text-lime-500",
      },
      {
        href: "/admin/licenses",
        icon: FaShieldAlt,
        label: "Lisensi",
        iconColor: "text-violet-400",
      },
      {
        href: "/admin/settings",
        icon: FaCog,
        label: "Pengaturan Situs",
        iconColor: "text-slate-500",
      },
      {
        href: "/admin/whatsapp",
        icon: FaWhatsapp,
        label: "Notifikasi WA",
        iconColor: "text-green-500",
      },
      {
        href: "/admin/tracking",
        icon: FaChartBar,
        label: "Pixel/Pelacakan",
        iconColor: "text-blue-500",
      },
      {
        href: "/admin/media",
        icon: FaImage,
        label: "Media",
        iconColor: "text-fuchsia-500",
      },
    ],
    [unreadInboxCount]
  );

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Berhasil logout");
    router.push("/login");
  }

  return (
    <div data-admin-panel className="min-h-screen bg-dark-950 flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-dark-800 bg-dark-900/95 shadow-2xl shadow-slate-950/10 backdrop-blur-xl transform transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Brand */}
          <div className="flex h-[72px] items-center justify-between border-b border-dark-800/80 px-5 py-3">
            <Link href="/admin" className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 via-accent-500 to-fuchsia-500 text-white font-bold text-xs shadow-lg shadow-primary-500/20">
                AZ
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-dark-500">
                  AzkazamDigital
                </div>
                <span className="font-semibold text-white text-sm">Panel Admin</span>
              </div>
            </Link>
            <button
              className="lg:hidden text-dark-400 hover:text-white"
              onClick={() => setSidebarOpen(false)}
            >
              <FaTimes size={18} />
            </button>
          </div>

          {/* Menu */}
          <nav className="flex-1 overflow-y-auto px-3 py-5">
            <div className="mb-4 px-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-dark-500">
              Navigasi
            </div>
            <div className="space-y-1.5">
            {menuItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                    isActive
                      ? "bg-white/95 text-slate-900 shadow-lg shadow-slate-950/8"
                      : "text-dark-300 hover:bg-white/70 hover:text-slate-900"
                  }`}
                >
                  <item.icon
                    size={16}
                    className={`${isActive ? "text-primary-600" : item.iconColor} transition-colors duration-200`}
                  />
                  <span className="flex-1">{item.label}</span>
                  {item.badge ? (
                    <span className="min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
            </div>
          </nav>

          {/* Footer */}
          <div className="border-t border-dark-800/80 p-3">
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-dark-300 transition-all hover:bg-red-500/10 hover:text-red-500"
            >
              <FaSignOutAlt size={16} className="text-red-500" />
              Keluar
            </button>
            <Link
              href="/"
              className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-dark-300 transition-all hover:bg-white/70 hover:text-slate-900"
            >
              <FaBullhorn size={16} className="text-sky-500" />
              Lihat Situs
            </Link>
          </div>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-20 items-center border-b border-dark-700/50 px-4 backdrop-blur-xl lg:px-8">
          <button
            className="lg:hidden text-dark-400 hover:text-white mr-4"
            onClick={() => setSidebarOpen(true)}
          >
            <FaBars size={20} />
          </button>
          <div className="glass flex w-full items-center justify-between rounded-2xl px-5 py-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-dark-500">
                Admin Workspace
              </div>
              <div className="text-sm font-semibold text-white">
                {menuItems.find((item) => pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href)))?.label || "Panel Admin"}
              </div>
            </div>
            <div className="hidden rounded-full border border-dark-700/70 bg-dark-900/70 px-3 py-1.5 text-xs font-medium text-dark-300 md:block">
              Desain baru, logika tetap aman
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
