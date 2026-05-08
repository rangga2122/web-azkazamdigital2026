import { createServiceRoleClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import { OrderFormClient } from "@/components/public/OrderFormClient";
import { AffiliateReferralTracker } from "@/components/public/AffiliateReferralTracker";
import { generateUniquePaymentCode } from "@/lib/utils";
import type { Product } from "@/types";
import type { Metadata } from "next";

async function getProduct(slug: string) {
  const supabase = await createServiceRoleClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  return data as Product | null;
}

async function getCheckoutSettings() {
  const supabase = await createServiceRoleClient();
  const { data } = await supabase
    .from("site_settings")
    .select("hide_checkout_chrome, checkout_coupon_enabled, pakasir_enabled")
    .limit(1)
    .single();

  return {
    hide_checkout_chrome: data?.hide_checkout_chrome ?? true,
    checkout_coupon_enabled: data?.checkout_coupon_enabled ?? true,
    pakasir_enabled: data?.pakasir_enabled ?? false,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Produk Tidak Ditemukan" };
  return {
    title: `Pesan ${product.title}`,
    description: `Form pemesanan ${product.title}`,
    robots: {
      index: false,
      follow: false,
    },
  };
}

export default async function OrderPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const previewUniqueCode = generateUniquePaymentCode();
  const [product, settings] = await Promise.all([
    getProduct(slug),
    getCheckoutSettings(),
  ]);
  if (!product) notFound();

  return (
    <div className="min-h-screen bg-slate-50 py-10 sm:py-14" data-hide-public-chrome={settings.hide_checkout_chrome ? "true" : undefined}>
      {settings.hide_checkout_chrome && <HidePublicChromeStyle />}
      <AffiliateReferralTracker productSlug={product.slug} />
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        <OrderFormClient
          product={product}
          settings={settings}
          previewUniqueCode={previewUniqueCode}
        />
      </div>
    </div>
  );
}

function HidePublicChromeStyle() {
  return (
    <style>
      {`
        body:has([data-hide-public-chrome="true"]) [data-public-header],
        body:has([data-hide-public-chrome="true"]) [data-public-footer] {
          display: none !important;
        }
      `}
    </style>
  );
}
