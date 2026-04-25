"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FaBars, FaTimes } from "react-icons/fa";
import type { SiteNavLink } from "@/lib/site-navigation";

export function Navbar({
  siteName = "AzkazamDigital",
  logoUrl,
  navLinks,
}: {
  siteName?: string | null;
  logoUrl?: string | null;
  navLinks: SiteNavLink[];
}) {
  const pathname = usePathname();
  const displayName = siteName?.trim() || "AzkazamDigital";

  function isLinkActive(href: string) {
    if (href === "/") {
      return pathname === "/";
    }

    return pathname === href || pathname?.startsWith(`${href}/`);
  }

  return (
    <nav className="sticky top-0 z-40 glass border-b border-dark-700/50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={displayName}
                className="h-9 w-9 rounded-lg object-contain transition-transform group-hover:scale-105"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 font-bold text-white text-sm transition-transform group-hover:scale-110">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
            <span className="text-lg font-bold text-white hidden sm:block">
              {displayName}
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isLinkActive(link.href)
                    ? "bg-blue-100/80 text-blue-700 ring-1 ring-blue-200"
                    : "text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/produk"
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary-600 to-accent-600 text-white text-sm font-semibold shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 transition-all duration-300 hover:scale-105"
            >
              Lihat Produk
            </Link>
          </div>

          {/* Mobile toggle */}
          <details className="group relative md:hidden">
            <summary className="list-none cursor-pointer rounded-xl p-2 text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
              <span className="sr-only">Buka/tutup menu</span>
              <FaBars size={20} className="group-open:hidden" />
              <FaTimes size={20} className="hidden group-open:block" />
            </summary>

            <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-slate-200 bg-white/95 shadow-[0_24px_60px_rgba(15,23,42,0.22)] backdrop-blur-xl">
              <div className="px-3 py-3 space-y-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`block rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                      isLinkActive(link.href)
                        ? "bg-blue-100/90 text-blue-700 ring-1 ring-blue-200"
                        : "text-slate-800 hover:bg-blue-50 hover:text-blue-700"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="pt-3 border-t border-slate-200">
                  <Link
                    href="/produk"
                    className="block rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 px-4 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-primary-600/20"
                  >
                    Lihat Produk
                  </Link>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </nav>
  );
}
