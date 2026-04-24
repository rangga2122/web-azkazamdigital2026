"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  const [mobileOpen, setMobileOpen] = useState(false);
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
                    ? "text-primary-400 bg-primary-500/10"
                    : "text-dark-300 hover:text-white hover:bg-dark-800"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* CTA */}
          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-dark-300 hover:text-white transition-colors"
            >
              Masuk
            </Link>
            <Link
              href="/produk"
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary-600 to-accent-600 text-white text-sm font-semibold shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 transition-all duration-300 hover:scale-105"
            >
              Lihat Produk
            </Link>
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden text-dark-300 hover:text-white p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Buka/tutup menu"
          >
            {mobileOpen ? <FaTimes size={20} /> : <FaBars size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-dark-700/50 glass">
          <div className="px-4 py-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`block px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  isLinkActive(link.href)
                    ? "text-primary-400 bg-primary-500/10"
                    : "text-dark-300 hover:text-white hover:bg-dark-800"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-3 border-t border-dark-700 flex flex-col gap-2">
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-3 text-center text-sm font-medium text-dark-300 hover:text-white rounded-lg hover:bg-dark-800"
              >
                Masuk
              </Link>
              <Link
                href="/produk"
                onClick={() => setMobileOpen(false)}
                className="block px-4 py-3 text-center rounded-lg bg-gradient-to-r from-primary-600 to-accent-600 text-white text-sm font-semibold"
              >
                Lihat Produk
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
