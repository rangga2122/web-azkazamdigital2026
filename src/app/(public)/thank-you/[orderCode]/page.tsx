import { createServiceRoleClient } from "@/lib/supabase/server";
import { ThankYouClient } from "@/components/public/ThankYouClient";
import { ThankYouOrderPanel } from "@/components/public/ThankYouOrderPanel";
import type { Order, SiteSettings } from "@/types";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terima Kasih",
  description: "Terima kasih atas pesanan Anda.",
  robots: {
    index: false,
    follow: false,
  },
};

type ThankYouSettings = Pick<
  SiteSettings,
  | "site_name"
  | "hide_thank_you_chrome"
  | "pakasir_enabled"
  | "payment_bank_name"
  | "payment_account_number"
  | "payment_account_name"
  | "payment_qris_url"
  | "whatsapp_number"
>;

async function getData(orderCode: string) {
  const supabase = await createServiceRoleClient();
  const [orderRes, settingsRes] = await Promise.all([
    supabase.from("orders").select("*").eq("order_code", orderCode).single(),
    supabase
      .from("site_settings")
      .select("site_name, hide_thank_you_chrome, pakasir_enabled, payment_bank_name, payment_account_number, payment_account_name, payment_qris_url, whatsapp_number")
      .limit(1)
      .single(),
  ]);

  return {
    order: (orderRes.data || null) as Order | null,
    settings: {
      site_name: settingsRes.data?.site_name || "AzkazamDigital",
      hide_thank_you_chrome: settingsRes.data?.hide_thank_you_chrome ?? true,
      pakasir_enabled: settingsRes.data?.pakasir_enabled ?? false,
      payment_bank_name: settingsRes.data?.payment_bank_name || "BCA",
      payment_account_number:
        settingsRes.data?.payment_account_number || "7891502145",
      payment_account_name: settingsRes.data?.payment_account_name || "ASNIDAR NUR",
      payment_qris_url: settingsRes.data?.payment_qris_url || "/qris.webp",
      whatsapp_number: settingsRes.data?.whatsapp_number || "6281234567890",
    } as ThankYouSettings,
  };
}

export default async function ThankYouPage({
  params,
}: {
  params: Promise<{ orderCode: string }>;
}) {
  const { orderCode } = await params;
  const { order, settings } = await getData(orderCode);

  return (
    <div
      className="min-h-screen bg-slate-50 py-8"
      data-hide-public-chrome={settings.hide_thank_you_chrome ? "true" : undefined}
    >
      {settings.hide_thank_you_chrome && <HidePublicChromeStyle />}
      {order && <ThankYouClient order={order} />}
      <ThankYouOrderPanel
        initialOrder={order}
        orderCode={orderCode}
        settings={{
          site_name: settings.site_name || "AzkazamDigital",
          payment_bank_name: settings.payment_bank_name || "BCA",
          payment_account_number:
            settings.payment_account_number || "7891502145",
          payment_account_name:
            settings.payment_account_name || "ASNIDAR NUR",
          whatsapp_number: settings.whatsapp_number || "6281234567890",
        }}
      />
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
