"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  FaHome, FaFileAlt, FaBox, FaTags, FaStar, FaQuestionCircle,
  FaShoppingCart, FaUsers, FaMoneyBillWave, FaCog, FaImage,
  FaChartBar, FaSignOutAlt, FaBars, FaTimes, FaBullhorn, FaTicketAlt, FaInbox,
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
      { href: "/admin", icon: FaHome, label: "Dasbor" },
      { href: "/admin/inbox", icon: FaInbox, label: "Inbox", badge: unreadInboxCount },
      { href: "/admin/pages", icon: FaFileAlt, label: "Halaman" },
      { href: "/admin/products", icon: FaBox, label: "Produk" },
      { href: "/admin/categories", icon: FaTags, label: "Kategori" },
      { href: "/admin/testimonials", icon: FaStar, label: "Testimoni" },
      { href: "/admin/faqs", icon: FaQuestionCircle, label: "Pertanyaan Umum" },
      { href: "/admin/orders", icon: FaShoppingCart, label: "Pesanan" },
      { href: "/admin/coupons", icon: FaTicketAlt, label: "Kode Kupon" },
      { href: "/admin/affiliates", icon: FaUsers, label: "Afiliasi" },
      { href: "/admin/commissions", icon: FaMoneyBillWave, label: "Komisi" },
      { href: "/admin/settings", icon: FaCog, label: "Pengaturan Situs" },
      { href: "/admin/tracking", icon: FaChartBar, label: "Pixel/Pelacakan" },
      { href: "/admin/media", icon: FaImage, label: "Media" },
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
    <div className="min-h-screen bg-dark-950 flex">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-dark-900 border-r border-dark-800 transform transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Brand */}
          <div className="flex h-16 items-center justify-between px-5 border-b border-dark-800">
            <Link href="/admin" className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center text-white font-bold text-xs">
                AZ
              </div>
              <span className="font-semibold text-white text-sm">Panel Admin</span>
            </Link>
            <button
              className="lg:hidden text-dark-400 hover:text-white"
              onClick={() => setSidebarOpen(false)}
            >
              <FaTimes size={18} />
            </button>
          </div>

          {/* Menu */}
          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
            {menuItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-primary-500/10 text-primary-400"
                      : "text-dark-400 hover:text-white hover:bg-dark-800"
                  }`}
                >
                  <item.icon size={16} />
                  <span className="flex-1">{item.label}</span>
                  {item.badge ? (
                    <span className="min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="border-t border-dark-800 p-3">
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-dark-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
            >
              <FaSignOutAlt size={16} />
              Keluar
            </button>
            <Link
              href="/"
              className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-dark-400 hover:text-white hover:bg-dark-800 transition-all mt-1"
            >
              <FaBullhorn size={16} />
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
        <header className="sticky top-0 z-30 glass border-b border-dark-700/50 h-16 flex items-center px-4 lg:px-8">
          <button
            className="lg:hidden text-dark-400 hover:text-white mr-4"
            onClick={() => setSidebarOpen(true)}
          >
            <FaBars size={20} />
          </button>
          <div className="flex-1" />
        </header>

        {/* Page Content */}
        <main className="p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
