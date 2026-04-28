"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import {
  FaBoxOpen,
  FaChartLine,
  FaCopy,
  FaExchangeAlt,
  FaExternalLinkAlt,
  FaLink,
  FaMoneyBillWave,
  FaRegUserCircle,
  FaSignOutAlt,
  FaTachometerAlt,
} from "react-icons/fa";
import { createClient } from "@/lib/supabase/client";
import {
  formatDate,
  formatPrice,
  getProductCommissionLabel,
  getStatusColor,
  getStatusLabel,
} from "@/lib/utils";
import { copyTextToClipboard } from "@/lib/client-clipboard";
import type {
  Affiliate,
  AffiliateLink,
  Commission,
  Order,
  Page,
  Product,
  PurchasedProductSummary,
  UserProfile,
} from "@/types";

type DashboardSection =
  | "overview"
  | "products"
  | "affiliate"
  | "commissions"
  | "transactions"
  | "profile";

const menuItems: Array<{
  id: DashboardSection;
  label: string;
  icon: typeof FaTachometerAlt;
}> = [
  { id: "overview", label: "Overview", icon: FaTachometerAlt },
  { id: "products", label: "Produk Saya", icon: FaBoxOpen },
  { id: "affiliate", label: "Afiliasi Saya", icon: FaLink },
  { id: "commissions", label: "Komisi", icon: FaMoneyBillWave },
  { id: "transactions", label: "Riwayat Transaksi", icon: FaExchangeAlt },
  { id: "profile", label: "Pengaturan Profil", icon: FaRegUserCircle },
];

export default function UserDashboardPage() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<DashboardSection>("overview");
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [affiliate, setAffiliate] = useState<Affiliate | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [productsById, setProductsById] = useState<Record<string, Product>>({});
  const [affiliateLinks, setAffiliateLinks] = useState<AffiliateLink[]>([]);
  const [landingPagesByProductId, setLandingPagesByProductId] = useState<
    Record<string, Page[]>
  >({});
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [clickCount, setClickCount] = useState(0);
  const [conversionCount, setConversionCount] = useState(0);
  const [profileForm, setProfileForm] = useState({
    full_name: "",
    referral_code: "",
    whatsapp: "",
    avatar_url: "",
    password: "",
    payout_method: "",
    payout_account_number: "",
    payout_account: "",
  });

  const loadDashboard = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/affiliate/login");
      return;
    }

    setUserEmail(user.email || "");

    const [{ data: profileRow }, { data: orderRows }, { data: affiliateRow }] =
      await Promise.all([
        supabase.from("users_profiles").select("*").eq("id", user.id).maybeSingle(),
        supabase.from("orders").select("*").order("created_at", { ascending: false }),
        supabase.from("affiliates").select("*").maybeSingle(),
      ]);

    const typedOrders = (orderRows || []) as Order[];
    const paidOrders = typedOrders.filter((order) => order.status === "paid");
    const productIds = Array.from(
      new Set(paidOrders.map((order) => order.product_id).filter(Boolean))
    ) as string[];

    const [{ data: productRows }, { data: linkedPageRows }, affiliatePayload] = await Promise.all([
      productIds.length > 0
        ? supabase.from("products").select("*").in("id", productIds)
        : Promise.resolve({ data: [] as Product[] }),
      productIds.length > 0
        ? supabase
            .from("pages")
            .select("id, title, slug, status, product_id, hide_header_footer, seo_title, seo_description, featured_image, sort_order, is_system, content_html, created_at, updated_at")
            .eq("status", "published")
            .in("product_id", productIds)
            .order("sort_order", { ascending: true })
            .order("title", { ascending: true })
        : Promise.resolve({ data: [] as Page[] }),
      affiliateRow?.id
        ? Promise.all([
            supabase
              .from("affiliate_links")
              .select(`
                *,
                product:products (
                  id,
                  title,
                  slug,
                  thumbnail_url,
                  price,
                  affiliate_commission_rate,
                  affiliate_commission_type,
                  affiliate_commission_amount,
                  click_target_type,
                  digital_file_url,
                  purchase_url,
                  demo_url,
                  is_active,
                  compare_at_price,
                  banner_url,
                  short_description,
                  description_html,
                  landing_page_mode,
                  landing_page_html,
                  click_target_page_id,
                  is_featured,
                  checkout_url,
                  badge,
                  seo_title,
                  seo_description,
                  created_at,
                  updated_at
                )
              `)
              .eq("affiliate_id", affiliateRow.id)
              .order("created_at", { ascending: true }),
            supabase
              .from("commissions")
              .select("*")
              .eq("affiliate_id", affiliateRow.id)
              .order("created_at", { ascending: false }),
            supabase
              .from("affiliate_clicks")
              .select("id", { count: "exact", head: true })
              .eq("affiliate_id", affiliateRow.id),
            supabase
              .from("affiliate_conversions")
              .select("id", { count: "exact", head: true })
              .eq("affiliate_id", affiliateRow.id),
          ])
        : Promise.resolve(null),
    ]);

    const mappedProducts = Object.fromEntries(
      ((productRows || []) as Product[]).map((item) => [item.id, item])
    );
    const clickTargetPageIds = Array.from(
      new Set(
        ((productRows || []) as Product[])
          .map((item) => item.click_target_page_id)
          .filter(Boolean)
      )
    ) as string[];
    const pagesFromProductLink = ((linkedPageRows || []) as Page[]).map((page) => ({
      ...page,
      product: page.product_id ? mappedProducts[page.product_id] || null : null,
    }));

    let pagesFromClickTarget: Page[] = [];
    if (clickTargetPageIds.length > 0) {
      const { data: clickTargetRows } = await supabase
        .from("pages")
        .select("id, title, slug, status, product_id, hide_header_footer, seo_title, seo_description, featured_image, sort_order, is_system, content_html, created_at, updated_at")
        .in("id", clickTargetPageIds)
        .eq("status", "published");

      pagesFromClickTarget = ((clickTargetRows || []) as Page[]).map((page) => {
        const ownerProduct =
          page.product_id && mappedProducts[page.product_id]
            ? mappedProducts[page.product_id]
            : ((productRows || []) as Product[]).find(
                (product) => product.click_target_page_id === page.id
              ) || null;

        return {
          ...page,
          product_id: ownerProduct?.id || page.product_id,
          product: ownerProduct,
        };
      });
    }

    const groupedLandingPages = [...pagesFromProductLink, ...pagesFromClickTarget].reduce<
      Record<string, Page[]>
    >((accumulator, page) => {
      const productId = page.product_id;
      if (!productId) return accumulator;

      const currentPages = accumulator[productId] || [];
      if (!currentPages.some((item) => item.id === page.id)) {
        currentPages.push(page);
      }

      accumulator[productId] = currentPages.sort((a, b) => {
        if (a.sort_order !== b.sort_order) {
          return a.sort_order - b.sort_order;
        }

        return a.title.localeCompare(b.title);
      });
      return accumulator;
    }, {});

    setProfile((profileRow || null) as UserProfile | null);
    setOrders(typedOrders);
    setProductsById(mappedProducts);
    setLandingPagesByProductId(groupedLandingPages);
    setAffiliate((affiliateRow || null) as Affiliate | null);

    if (affiliatePayload) {
      const [linksResult, commissionsResult, clicksResult, conversionsResult] =
        affiliatePayload;
      setAffiliateLinks((linksResult.data || []) as AffiliateLink[]);
      setCommissions((commissionsResult.data || []) as Commission[]);
      setClickCount(clicksResult.count || 0);
      setConversionCount(conversionsResult.count || 0);
    } else {
      setAffiliateLinks([]);
      setLandingPagesByProductId(groupedLandingPages);
      setCommissions([]);
      setClickCount(0);
      setConversionCount(0);
    }

    setProfileForm({
      full_name:
        profileRow?.full_name ||
        affiliateRow?.full_name ||
        user.user_metadata?.full_name ||
        "",
      referral_code: affiliateRow?.referral_code || "",
      whatsapp: profileRow?.phone || affiliateRow?.whatsapp || "",
      avatar_url: profileRow?.avatar_url || "",
      password: "",
      payout_method: affiliateRow?.payout_method || "",
      payout_account_number: affiliateRow?.payout_account_number || "",
      payout_account: affiliateRow?.payout_account || "",
    });
    setLoading(false);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadDashboard]);

  const paidOrders = useMemo(
    () => orders.filter((order) => order.status === "paid"),
    [orders]
  );

  const purchasedProducts = useMemo<PurchasedProductSummary[]>(
    () =>
      paidOrders.map((order) => ({
        order,
        product: order.product_id ? productsById[order.product_id] || null : null,
      })),
    [paidOrders, productsById]
  );

  const totalCommission = useMemo(
    () => commissions.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [commissions]
  );

  const affiliateProducts = useMemo(
    () =>
      affiliateLinks.map((link) => ({
        link,
        product: link.product || (link.product_id ? productsById[link.product_id] || null : null),
        landingPages: link.product_id ? landingPagesByProductId[link.product_id] || [] : [],
      })),
    [affiliateLinks, landingPagesByProductId, productsById]
  );

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/affiliate/login");
  }

  async function handleSaveProfile() {
    const supabase = createClient();
    setSavingProfile(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) throw new Error("Sesi login tidak ditemukan.");

      const nextFullName = profileForm.full_name.trim();
      const nextWhatsapp = profileForm.whatsapp.trim();
      const nextAvatar = profileForm.avatar_url.trim();
      const nextReferralCode = profileForm.referral_code.trim().toUpperCase();

      const profilePayload = {
        id: user.id,
        full_name: nextFullName || null,
        phone: nextWhatsapp || null,
        avatar_url: nextAvatar || null,
        role: profile?.role || "affiliate",
      };

      const profileResult = await supabase
        .from("users_profiles")
        .upsert(profilePayload, { onConflict: "id" });
      if (profileResult.error) {
        throw new Error(profileResult.error.message);
      }

      if (affiliate?.id) {
        if (!nextReferralCode) {
          throw new Error("Username afiliasi wajib diisi.");
        }

        const affiliateResult = await supabase
          .from("affiliates")
          .update({
            full_name: nextFullName || affiliate.full_name,
            whatsapp: nextWhatsapp || null,
            referral_code: nextReferralCode,
            payout_method: profileForm.payout_method.trim() || null,
            payout_account_number:
              profileForm.payout_account_number.trim() || null,
            payout_account: profileForm.payout_account.trim() || null,
          })
          .eq("id", affiliate.id);

        if (affiliateResult.error) {
          throw new Error(affiliateResult.error.message);
        }
      }

      const authResult = await supabase.auth.updateUser(
        profileForm.password.trim()
          ? {
              password: profileForm.password.trim(),
              data: {
                full_name: nextFullName || undefined,
              },
            }
          : {
              data: {
                full_name: nextFullName || undefined,
              },
            }
      );

      if (authResult.error) {
        throw new Error(authResult.error.message);
      }

      setProfileForm((current) => ({ ...current, password: "" }));
      toast.success("Profil berhasil diperbarui.");
      await loadDashboard();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Gagal menyimpan profil.";
      toast.error(message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function copyLink(path: string) {
    try {
      await copyTextToClipboard(`${window.location.origin}${path}`);
      toast.success("Link berhasil disalin.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Gagal menyalin link."
      );
    }
  }

  function buildLandingPageAffiliatePath(page: Page, referralCode: string) {
    const nextUrl = new URL(`/${page.slug}`, "http://internal.local");
    nextUrl.searchParams.set("ref", referralCode);
    return `${nextUrl.pathname}${nextUrl.search}`;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-dark-400">Memuat dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-950" data-user-dashboard>
      <header className="glass sticky top-0 z-40 border-b border-dark-700/50">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 text-sm font-bold text-white">
              AZ
            </div>
            <div>
              <div className="text-sm font-semibold text-white">Dashboard User</div>
              <div className="text-xs text-dark-400">{userEmail}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-sm text-dark-300 transition-colors hover:text-white"
          >
            <FaSignOutAlt size={12} />
            Keluar
          </button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[240px_minmax(0,1fr)] lg:px-8">
        <aside className="rounded-2xl border border-dark-800 bg-dark-900 p-3">
          <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition-colors ${
                  activeSection === item.id
                    ? "bg-primary-500/15 text-primary-300"
                    : "text-dark-300 hover:bg-dark-800 hover:text-white"
                }`}
              >
                <item.icon size={14} />
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="space-y-6">
          {activeSection === "overview" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: "Produk Paid",
                    value: paidOrders.length.toString(),
                    icon: FaBoxOpen,
                  },
                  {
                    label: "Link Afiliasi",
                    value: affiliateLinks.length.toString(),
                    icon: FaLink,
                  },
                  {
                    label: "Klik",
                    value: clickCount.toString(),
                    icon: FaChartLine,
                  },
                  {
                    label: "Total Komisi",
                    value: formatPrice(totalCommission),
                    icon: FaMoneyBillWave,
                  },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-dark-800 bg-dark-900 p-5"
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-dark-800 text-primary-300">
                        <item.icon size={16} />
                      </div>
                      <div className="text-sm text-dark-400">{item.label}</div>
                    </div>
                    <div className="text-2xl font-bold text-white">{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-dark-800 bg-dark-900 p-6">
                  <h2 className="text-lg font-semibold text-white">Ringkasan Afiliasi</h2>
                  <div className="mt-4 space-y-3 text-sm text-dark-300">
                    <div className="flex items-center justify-between rounded-xl bg-dark-800 px-4 py-3">
                      <span>Status akun</span>
                      <span
                        className={`rounded-md px-2 py-1 text-xs font-semibold ${getStatusColor(
                          affiliate?.status || "pending"
                        )}`}
                      >
                        {getStatusLabel(affiliate?.status || "pending")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-dark-800 px-4 py-3">
                      <span>Konversi</span>
                      <strong className="text-white">{conversionCount}</strong>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-dark-800 px-4 py-3">
                      <span>Username afiliasi</span>
                      <strong className="text-primary-300">
                        {affiliate?.referral_code || "-"}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-dark-800 bg-dark-900 p-6">
                  <h2 className="text-lg font-semibold text-white">Akses Cepat</h2>
                  <div className="mt-4 grid gap-3">
                    <button
                      onClick={() => setActiveSection("products")}
                      className="rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-left text-sm text-dark-200 transition-colors hover:text-white"
                    >
                      Lihat semua produk yang sudah dibeli
                    </button>
                    <button
                      onClick={() => setActiveSection("affiliate")}
                      className="rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-left text-sm text-dark-200 transition-colors hover:text-white"
                    >
                      Kelola link afiliasi per produk
                    </button>
                    <button
                      onClick={() => setActiveSection("profile")}
                      className="rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-left text-sm text-dark-200 transition-colors hover:text-white"
                    >
                      Lengkapi profil, WhatsApp, dan metode pencairan
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {activeSection === "products" && (
            <section className="rounded-2xl border border-dark-800 bg-dark-900 p-6">
              <h2 className="text-lg font-semibold text-white">Produk Saya</h2>
              <p className="mt-1 text-sm text-dark-400">
                Hanya produk yang sudah dibeli dengan status pembayaran `paid`.
              </p>
              <div className="mt-5 grid gap-4">
                {purchasedProducts.length === 0 ? (
                  <div className="rounded-xl border border-dark-800 bg-dark-800 px-4 py-10 text-center text-dark-400">
                    Belum ada produk dengan pembayaran berhasil.
                  </div>
                ) : (
                  purchasedProducts.map(({ order, product }) => (
                    <div
                      key={order.id}
                      className="grid gap-4 rounded-xl border border-dark-800 bg-dark-800 p-4 lg:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <div className="flex gap-4">
                        {product?.thumbnail_url ? (
                          <img
                            src={product.thumbnail_url}
                            alt={product.title}
                            className="h-16 w-16 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-dark-900 text-lg font-bold text-dark-400">
                            {(product?.title || order.product_name).charAt(0)}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="text-base font-semibold text-white">
                            {product?.title || order.product_name}
                          </div>
                          <div className="mt-1 text-sm text-dark-400">
                            Order {order.order_code} • {formatDate(order.created_at)}
                          </div>
                          <div className="mt-2 text-sm text-dark-300">
                            Total bayar {formatPrice(Number(order.total_amount || 0))}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        {product?.slug && (
                          <Link
                            href={`/produk/${product.slug}`}
                            className="rounded-lg border border-dark-700 px-3 py-2 text-sm text-dark-200 transition-colors hover:text-white"
                          >
                            Lihat Detail
                          </Link>
                        )}
                        {product?.purchase_url && (
                          <a
                            href={product.purchase_url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-primary-500/40 bg-primary-500/10 px-3 py-2 text-sm text-primary-300"
                          >
                            Akses
                          </a>
                        )}
                        {product?.digital_file_url && (
                          <a
                            href={product.digital_file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-accent-500/40 bg-accent-500/10 px-3 py-2 text-sm text-accent-300"
                          >
                            Download
                          </a>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {activeSection === "affiliate" && (
            <section className="rounded-2xl border border-dark-800 bg-dark-900 p-6">
              <h2 className="text-lg font-semibold text-white">Afiliasi Saya</h2>
              <p className="mt-1 text-sm text-dark-400">
                Link afiliasi hanya aktif untuk produk yang sudah Anda beli.
              </p>
              <div className="mt-5 space-y-4">
                {affiliateProducts.length === 0 ? (
                  <div className="rounded-xl border border-dark-800 bg-dark-800 px-4 py-10 text-center text-dark-400">
                    Link afiliasi belum tersedia.
                  </div>
                ) : (
                  affiliateProducts.map(({ link, product, landingPages }) => (
                    <div
                      key={link.id}
                      className="rounded-xl border border-dark-800 bg-dark-800 p-4"
                    >
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="text-base font-semibold text-white">
                            {product?.title || "Produk"}
                          </div>
                          <div className="mt-1 text-sm text-dark-400">
                            Komisi {getProductCommissionLabel(product || {})}
                          </div>
                        </div>
                        <div className="flex gap-3 text-xs text-dark-400">
                          <span>{link.clicks_count} klik</span>
                          <span>{link.conversions_count} konversi</span>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-col gap-2 lg:flex-row">
                        <code className="min-w-0 flex-1 truncate rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-xs text-primary-300">
                          {link.target_url}
                        </code>
                        <button
                          onClick={() => copyLink(link.target_url)}
                          className="flex items-center justify-center gap-2 rounded-lg border border-primary-500/30 bg-primary-500/10 px-3 py-2 text-sm text-primary-300"
                        >
                          <FaCopy size={12} />
                          Copy Link Produk
                        </button>
                        {product?.slug && (
                          <Link
                            href={link.target_url}
                            className="flex items-center justify-center gap-2 rounded-lg border border-dark-700 px-3 py-2 text-sm text-dark-200 transition-colors hover:text-white"
                          >
                            <FaExternalLinkAlt size={12} />
                            Buka
                          </Link>
                        )}
                      </div>

                      <div className="mt-5 rounded-xl border border-dark-700 bg-dark-900/70 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">
                              Landing Page Produk
                            </div>
                            <div className="mt-1 text-xs text-dark-400">
                              Muncul semua halaman published yang ditautkan ke produk ini.
                            </div>
                          </div>
                          <div className="text-xs text-dark-500">
                            {landingPages.length} halaman
                          </div>
                        </div>

                        {landingPages.length === 0 ? (
                          <div className="mt-4 rounded-lg border border-dashed border-dark-700 px-3 py-4 text-sm text-dark-400">
                            Belum ada landing page yang ditautkan ke produk ini.
                          </div>
                        ) : (
                          <div className="mt-4 space-y-3">
                            {landingPages.map((page) => {
                              const landingPath = buildLandingPageAffiliatePath(
                                page,
                                link.referral_code
                              );

                              return (
                                <div
                                  key={page.id}
                                  className="rounded-lg border border-dark-800 bg-dark-950/70 p-3"
                                >
                                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                    <div className="min-w-0">
                                      <div className="truncate text-sm font-semibold text-white">
                                        {page.title}
                                      </div>
                                      <div className="mt-1 truncate text-xs text-dark-400">
                                        /{page.slug}
                                      </div>
                                    </div>
                                    <div className="flex flex-col gap-2 lg:flex-row">
                                      <code className="min-w-0 rounded-lg border border-dark-700 bg-dark-900 px-3 py-2 text-xs text-accent-300 lg:min-w-[320px]">
                                        {landingPath}
                                      </code>
                                      <button
                                        onClick={() => copyLink(landingPath)}
                                        className="flex items-center justify-center gap-2 rounded-lg border border-accent-500/30 bg-accent-500/10 px-3 py-2 text-sm text-accent-300"
                                      >
                                        <FaCopy size={12} />
                                        Copy LP
                                      </button>
                                      <Link
                                        href={landingPath}
                                        className="flex items-center justify-center gap-2 rounded-lg border border-dark-700 px-3 py-2 text-sm text-dark-200 transition-colors hover:text-white"
                                      >
                                        <FaExternalLinkAlt size={12} />
                                        Buka LP
                                      </Link>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {activeSection === "commissions" && (
            <section className="rounded-2xl border border-dark-800 bg-dark-900 p-6">
              <h2 className="text-lg font-semibold text-white">Komisi</h2>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-800 text-left text-dark-400">
                      <th className="px-2 py-3">Tanggal</th>
                      <th className="px-2 py-3">Order</th>
                      <th className="px-2 py-3">Jumlah</th>
                      <th className="px-2 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-2 py-8 text-center text-dark-400">
                          Belum ada komisi.
                        </td>
                      </tr>
                    ) : (
                      commissions.map((item) => (
                        <tr key={item.id} className="border-b border-dark-800/80">
                          <td className="px-2 py-3 text-dark-300">
                            {formatDate(item.created_at)}
                          </td>
                          <td className="px-2 py-3 text-dark-300">
                            {item.order_id ? item.order_id.slice(0, 8) : "-"}
                          </td>
                          <td className="px-2 py-3 font-semibold text-white">
                            {formatPrice(Number(item.amount || 0))}
                          </td>
                          <td className="px-2 py-3">
                            <span
                              className={`rounded-md px-2 py-1 text-xs font-semibold ${getStatusColor(
                                item.status
                              )}`}
                            >
                              {getStatusLabel(item.status)}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeSection === "transactions" && (
            <section className="rounded-2xl border border-dark-800 bg-dark-900 p-6">
              <h2 className="text-lg font-semibold text-white">Riwayat Transaksi</h2>
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-dark-800 text-left text-dark-400">
                      <th className="px-2 py-3">Kode</th>
                      <th className="px-2 py-3">Produk</th>
                      <th className="px-2 py-3">Total</th>
                      <th className="px-2 py-3">Status</th>
                      <th className="px-2 py-3">Tanggal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-2 py-8 text-center text-dark-400">
                          Belum ada transaksi.
                        </td>
                      </tr>
                    ) : (
                      orders.map((order) => (
                        <tr key={order.id} className="border-b border-dark-800/80">
                          <td className="px-2 py-3 font-mono text-xs text-primary-300">
                            {order.order_code}
                          </td>
                          <td className="px-2 py-3 text-dark-300">
                            {order.product_name}
                          </td>
                          <td className="px-2 py-3 font-semibold text-white">
                            {formatPrice(Number(order.total_amount || 0))}
                          </td>
                          <td className="px-2 py-3">
                            <span
                              className={`rounded-md px-2 py-1 text-xs font-semibold ${getStatusColor(
                                order.status
                              )}`}
                            >
                              {getStatusLabel(order.status)}
                            </span>
                          </td>
                          <td className="px-2 py-3 text-dark-300">
                            {formatDate(order.created_at)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeSection === "profile" && (
            <section className="rounded-2xl border border-dark-800 bg-dark-900 p-6">
              <h2 className="text-lg font-semibold text-white">Pengaturan Profil</h2>
              <div className="mt-5 grid gap-5 md:grid-cols-2">
                <Field
                  label="Nama Lengkap"
                  value={profileForm.full_name}
                  onChange={(value) =>
                    setProfileForm((current) => ({ ...current, full_name: value }))
                  }
                />
                <Field
                  label="Username Afiliasi"
                  value={profileForm.referral_code}
                  onChange={(value) =>
                    setProfileForm((current) => ({
                      ...current,
                      referral_code: value.toUpperCase().replace(/\s+/g, ""),
                    }))
                  }
                />
                <Field label="Email" value={userEmail} disabled />
                <Field
                  label="Nomor WhatsApp"
                  value={profileForm.whatsapp}
                  onChange={(value) =>
                    setProfileForm((current) => ({ ...current, whatsapp: value }))
                  }
                />
                <Field
                  label="Foto Profil"
                  value={profileForm.avatar_url}
                  onChange={(value) =>
                    setProfileForm((current) => ({ ...current, avatar_url: value }))
                  }
                  placeholder="/uploads/general/avatar.jpg"
                />
                <Field
                  label="Password Baru"
                  type="password"
                  value={profileForm.password}
                  onChange={(value) =>
                    setProfileForm((current) => ({ ...current, password: value }))
                  }
                  placeholder="Kosongkan jika tidak diubah"
                />
                <Field
                  label="Metode Pencairan"
                  value={profileForm.payout_method}
                  onChange={(value) =>
                    setProfileForm((current) => ({
                      ...current,
                      payout_method: value,
                    }))
                  }
                  placeholder="Bank BCA / Dana / OVO"
                />
                <Field
                  label="Nomor Rekening / E-Wallet"
                  value={profileForm.payout_account_number}
                  onChange={(value) =>
                    setProfileForm((current) => ({
                      ...current,
                      payout_account_number: value,
                    }))
                  }
                />
                <div className="md:col-span-2">
                  <Field
                    label="Nama Pemilik Rekening"
                    value={profileForm.payout_account}
                    onChange={(value) =>
                      setProfileForm((current) => ({
                        ...current,
                        payout_account: value,
                      }))
                    }
                  />
                </div>
              </div>
              <div className="mt-6">
                <button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="rounded-lg border border-primary-500/30 bg-primary-500/10 px-4 py-3 text-sm font-semibold text-primary-300 disabled:opacity-60"
                >
                  {savingProfile ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-dark-300">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-xl border border-dark-700 bg-dark-800 px-4 py-3 text-white outline-none transition focus:border-primary-500/50 disabled:cursor-not-allowed disabled:opacity-70"
      />
    </label>
  );
}
