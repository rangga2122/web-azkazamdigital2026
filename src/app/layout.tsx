import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "react-hot-toast";
import { FacebookPixelScript } from "@/components/tracking/FacebookPixel";
import { WhatsAppFloatingButton } from "@/components/ui/WhatsAppFloat";
import { CustomScripts } from "@/components/tracking/CustomScripts";
import { ThemeModeSync } from "@/components/ui/ThemeModeSync";
import { createServiceRoleClient } from "@/lib/supabase/server";

const fallbackMetadata: Metadata = {
  title: {
    default: "AzkazamDigital - Produk Digital Premium",
    template: "%s | AzkazamDigital",
  },
  description:
    "Platform penjualan produk digital premium dengan sistem afiliasi lengkap. Template, ebook, tools, dan kursus online berkualitas tinggi.",
  keywords: [
    "produk digital",
    "template website",
    "ebook",
    "tools marketing",
    "affiliate",
  ],
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: "AzkazamDigital",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const revalidate = 60;

type RootSiteSettings = {
  siteName: string;
  description: string;
  faviconUrl: string | null;
  logoUrl: string | null;
  themeMode: "dark" | "light";
};

const DEFAULT_FAVICON = "/uploads/general/4a802df8-7864-46ed-9145-8bc60913709c.png";

async function getRootSiteSettings(): Promise<RootSiteSettings> {
  try {
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from("site_settings")
      .select("site_name, description, favicon_url, logo_url, social_links")
      .limit(1)
      .single();
    const themeMode = (data?.social_links as Record<string, string> | null)?.theme_mode;

    return {
      siteName: data?.site_name || "AzkazamDigital",
      description:
        data?.description ||
        "Platform penjualan produk digital premium dengan sistem afiliasi lengkap. Template, ebook, tools, dan kursus online berkualitas tinggi.",
      faviconUrl: data?.favicon_url || null,
      logoUrl: data?.logo_url || null,
      themeMode: themeMode === "light" ? "light" : "dark",
    };
  } catch {
    return {
      siteName: "AzkazamDigital",
      description:
        "Platform penjualan produk digital premium dengan sistem afiliasi lengkap. Template, ebook, tools, dan kursus online berkualitas tinggi.",
      faviconUrl: null,
      logoUrl: null,
      themeMode: "dark",
    };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getRootSiteSettings();
  const iconUrl = settings.faviconUrl || settings.logoUrl || DEFAULT_FAVICON;

  return {
    title: {
      default: `${settings.siteName} - Produk Digital Premium`,
      template: `%s | ${settings.siteName}`,
    },
    description: settings.description,
    keywords: fallbackMetadata.keywords,
    openGraph: {
      type: "website",
      locale: "id_ID",
      siteName: settings.siteName,
    },
    robots: fallbackMetadata.robots,
    icons: {
      icon: iconUrl,
      shortcut: iconUrl,
      apple: iconUrl,
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { themeMode } = await getRootSiteSettings();

  return (
    <html
      lang="id"
      className="antialiased"
      data-site-theme={themeMode}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <CustomScripts position="head" />
      </head>
      <body
        className="min-h-screen flex flex-col bg-dark-950 text-dark-100"
        data-site-theme={themeMode}
        suppressHydrationWarning
      >
        <FacebookPixelScript />
        <ThemeModeSync initialThemeMode={themeMode} />
        {children}
        <WhatsAppFloatingButton />
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: themeMode === "light" ? "#ffffff" : "#1e293b",
              color: themeMode === "light" ? "#0f172a" : "#f1f5f9",
              border:
                themeMode === "light"
                  ? "1px solid rgba(148,163,184,0.35)"
                  : "1px solid rgba(148,163,184,0.1)",
              boxShadow:
                themeMode === "light"
                  ? "0 18px 45px rgba(15,23,42,0.12)"
                  : undefined,
            },
          }}
        />
        <CustomScripts position="body" />
      </body>
    </html>
  );
}
