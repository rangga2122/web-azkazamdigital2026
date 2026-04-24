import type { Metadata } from "next";
import Link from "next/link";
import {
  FaChartLine,
  FaLink,
  FaMoneyBillWave,
  FaUserPlus,
} from "react-icons/fa";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const affiliateDefaults = {
  title: "Program Afiliasi",
  subtitle:
    "Promosikan produk digital kami dan dapatkan komisi dari setiap penjualan yang berhasil. Tanpa biaya pendaftaran!",
  primary_label: "Daftar Sekarang",
  primary_url: "/affiliate/register",
  secondary_label: "Masuk Afiliasi",
  secondary_url: "/affiliate/login",
  steps_title: "Cara Kerjanya",
  step1_title: "Daftar",
  step1_desc: "Isi formulir pendaftaran afiliasi secara gratis.",
  step2_title: "Dapatkan Tautan",
  step2_desc: "Setelah disetujui, dapatkan tautan referal unik.",
  step3_title: "Promosikan",
  step3_desc: "Bagikan tautan referal ke jaringan Anda.",
  step4_title: "Dapatkan Komisi",
  step4_desc: "Terima komisi dari setiap penjualan.",
  cta_title: "Siap Menghasilkan?",
  cta_subtitle:
    "Bergabunglah dengan afiliasi yang sudah menghasilkan dari program ini.",
  cta_button_label: "Daftar Afiliasi Gratis",
  cta_button_url: "/affiliate/register",
};

type AffiliateTextKey = keyof typeof affiliateDefaults;

async function getAffiliateSettings() {
  try {
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from("site_settings")
      .select("social_links")
      .limit(1)
      .single();
    const socialLinks = (data?.social_links || {}) as Record<string, unknown>;

    return Object.fromEntries(
      Object.entries(affiliateDefaults).map(([key, fallback]) => [
        key,
        getSocialText(socialLinks, `affiliate_${key}`, fallback),
      ])
    ) as Record<AffiliateTextKey, string>;
  } catch {
    return affiliateDefaults;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const affiliate = await getAffiliateSettings();

  return {
    title: affiliate.title,
    description: affiliate.subtitle,
    openGraph: {
      title: affiliate.title,
      description: affiliate.subtitle,
    },
  };
}

export default async function AffiliatePage() {
  const affiliate = await getAffiliateSettings();
  const steps = [
    {
      icon: FaUserPlus,
      step: "1",
      title: affiliate.step1_title,
      desc: affiliate.step1_desc,
    },
    {
      icon: FaLink,
      step: "2",
      title: affiliate.step2_title,
      desc: affiliate.step2_desc,
    },
    {
      icon: FaChartLine,
      step: "3",
      title: affiliate.step3_title,
      desc: affiliate.step3_desc,
    },
    {
      icon: FaMoneyBillWave,
      step: "4",
      title: affiliate.step4_title,
      desc: affiliate.step4_desc,
    },
  ];

  return (
    <div className="min-h-screen">
      <section className="relative py-20 sm:py-28">
        <div className="absolute inset-0 bg-gradient-to-b from-accent-500/5 to-transparent" />
        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-5xl font-bold text-white mb-6">
            {splitGradientTitle(affiliate.title)}
          </h1>
          <p className="text-lg text-dark-400 mb-10 max-w-2xl mx-auto">
            {affiliate.subtitle}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={affiliate.primary_url}
              className="px-8 py-4 rounded-xl bg-gradient-to-r from-accent-600 to-primary-600 text-white font-bold text-lg shadow-2xl shadow-accent-500/25 hover:shadow-accent-500/40 transition-all hover:scale-105"
            >
              {affiliate.primary_label}
            </Link>
            <Link
              href={affiliate.secondary_url}
              className="px-8 py-4 rounded-xl border border-dark-600 text-dark-300 font-semibold text-lg hover:border-accent-500/50 hover:text-accent-400 transition-all"
            >
              {affiliate.secondary_label}
            </Link>
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-white text-center mb-12">
            {splitGradientTitle(affiliate.steps_title)}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((item) => (
              <div
                key={item.step}
                className="rounded-2xl p-6 bg-dark-900 border border-dark-800 hover:border-dark-700 transition-all text-center group"
              >
                <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500/20 to-primary-500/20 mb-4 group-hover:scale-110 transition-transform">
                  <item.icon className="text-accent-400 text-xl" />
                  <span className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-accent-500 text-white text-xs font-bold flex items-center justify-center">
                    {item.step}
                  </span>
                </div>
                <h3 className="text-white font-semibold mb-2">{item.title}</h3>
                <p className="text-dark-400 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 bg-dark-900/50">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            {affiliate.cta_title}
          </h2>
          <p className="text-dark-400 mb-8">{affiliate.cta_subtitle}</p>
          <Link
            href={affiliate.cta_button_url}
            className="inline-block px-10 py-4 rounded-xl bg-gradient-to-r from-accent-600 to-primary-600 text-white font-bold text-lg shadow-2xl shadow-accent-500/25 hover:shadow-accent-500/40 transition-all hover:scale-105"
          >
            {affiliate.cta_button_label}
          </Link>
        </div>
      </section>
    </div>
  );
}

function getSocialText(
  socialLinks: Record<string, unknown>,
  key: string,
  fallback: string
) {
  const value = socialLinks[key];
  return typeof value === "string" && value.trim() ? value : fallback;
}

function splitGradientTitle(title: string) {
  const parts = title.trim().split(/\s+/);
  if (parts.length < 2) return title;
  const last = parts.pop();

  return (
    <>
      {parts.join(" ")} <span className="gradient-text">{last}</span>
    </>
  );
}
