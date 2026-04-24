import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PublicChromeController } from "@/components/layout/PublicChromeController";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveSiteNavLinks } from "@/lib/site-navigation";

export const revalidate = 60;
export const dynamic = "force-dynamic";

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
