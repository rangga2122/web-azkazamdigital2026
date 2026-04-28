import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PublicChromeController } from "@/components/layout/PublicChromeController";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveSiteNavLinks } from "@/lib/site-navigation";
import { unstable_cache } from "next/cache";

export const revalidate = 60;

const getCachedPublicSiteSettings = unstable_cache(
  async function getPublicSiteSettings() {
    try {
      const supabase = await createServiceRoleClient();
      const { data } = await supabase
        .from("site_settings")
        .select("site_name, logo_url, social_links")
        .limit(1)
        .single();

      return {
        siteName: data?.site_name || "AzkazamDigital",
        logoUrl: data?.logo_url || null,
        navLinks: resolveSiteNavLinks(
          data?.social_links as Record<string, unknown> | null
        ),
      };
    } catch {
      return {
        siteName: "AzkazamDigital",
        logoUrl: null,
        navLinks: resolveSiteNavLinks(),
      };
    }
  },
  ["public-layout-settings"],
  { revalidate: 60, tags: ["public-pages"] }
);

async function getPublicSiteSettings() {
  try {
    return await getCachedPublicSiteSettings();
  } catch {
    return {
      siteName: "AzkazamDigital",
      logoUrl: null,
      navLinks: resolveSiteNavLinks(),
    };
  }
}

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getPublicSiteSettings();

  return (
    <>
      <PublicChromeController />
      <style>
        {`
          body:has([data-hide-public-chrome="true"]) [data-public-header],
          body:has([data-hide-public-chrome="true"]) [data-public-footer],
          body:has([data-hide-public-chrome="true"]) [data-whatsapp-float],
          body[data-hide-route-chrome="true"] [data-public-header],
          body[data-hide-route-chrome="true"] [data-public-footer],
          body[data-hide-route-chrome="true"] [data-whatsapp-float] {
            display: none !important;
          }
        `}
      </style>
      <div data-public-header>
        <Navbar
          siteName={settings.siteName}
          logoUrl={settings.logoUrl}
          navLinks={settings.navLinks}
        />
      </div>
      <main className="flex-1">{children}</main>
      <div data-public-footer>
        <Footer />
      </div>
    </>
  );
}
