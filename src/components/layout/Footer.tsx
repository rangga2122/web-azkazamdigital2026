import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";

async function getFooterSettings() {
  try {
    const supabase = await createServiceRoleClient();
    const { data } = await supabase
      .from("site_settings")
      .select("site_name, logo_url, description, footer_text, social_links")
      .limit(1)
      .single();

    return {
      siteName: data?.site_name || "AzkazamDigital",
      logoUrl: data?.logo_url || null,
      description:
        data?.description ||
        "Platform produk digital premium untuk membantu Anda sukses di dunia digital.",
      footerText: data?.footer_text || null,
    };
  } catch {
    return {
      siteName: "AzkazamDigital",
      logoUrl: null,
      description:
        "Platform produk digital premium untuk membantu Anda sukses di dunia digital.",
      footerText: null,
    };
  }
}

export async function Footer() {
  const settings = await getFooterSettings();

  return (
    <footer className="border-t border-dark-800 bg-dark-950">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 gap-8">
          <div>
            <Link href="/" className="flex items-center gap-2 mb-4">
              {settings.logoUrl ? (
                <img
                  src={settings.logoUrl}
                  alt={settings.siteName}
                  className="h-9 w-9 rounded-lg object-contain"
                />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 font-bold text-white text-sm">
                  {settings.siteName.slice(0, 2).toUpperCase()}
                </div>
              )}
              <span className="text-lg font-bold text-white">
                {settings.siteName}
              </span>
            </Link>
            <p className="text-dark-400 text-sm leading-relaxed">
              {settings.description}
            </p>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-dark-800 text-center">
          <p className="text-dark-500 text-sm">
            {settings.footerText ||
              `\u00A9 ${new Date().getFullYear()} ${settings.siteName}. All rights reserved.`}
          </p>
        </div>
      </div>
    </footer>
  );
}
