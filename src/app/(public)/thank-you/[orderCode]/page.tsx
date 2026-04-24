import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/utils";
import { FaWhatsapp } from "react-icons/fa";
import { ThankYouClient } from "@/components/public/ThankYouClient";
import type { Order, SiteSettings } from "@/types";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terima Kasih",
  description: "Terima kasih atas pesanan Anda.",
};

type ThankYouSettings = Pick<
  SiteSettings,
  | "hide_thank_you_chrome"
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
      .select("hide_thank_you_chrome, payment_bank_name, payment_account_number, payment_account_name, payment_qris_url, whatsapp_number")
      .limit(1)
      .single(),
  ]);

  return {
    order: (orderRes.data || null) as Order | null,
    settings: {
      hide_thank_you_chrome: settingsRes.data?.hide_thank_you_chrome ?? true,
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
  const total = Number(order?.total_amount || order?.price || 0);
  const subtotal = Number(order?.subtotal || (order ? order.price : 0));
  const discount = Number(order?.discount_amount || 0);
  const uniqueCode = Number(order?.unique_code || 0);
  const baseAfterDiscount = Math.max(subtotal - discount, 0);
  const whatsappUrl = buildWhatsappUrl(settings.whatsapp_number, orderCode);

  return (
    <div
      className="min-h-screen bg-slate-50 py-8"
      data-hide-public-chrome={settings.hide_thank_you_chrome ? "true" : undefined}
    >
      {settings.hide_thank_you_chrome && <HidePublicChromeStyle />}
      {order && <ThankYouClient order={order} />}

      <div className="mx-auto w-full max-w-md px-4">
        <div className="rounded-[8px] border border-slate-200 bg-white p-5 text-center shadow-[0_18px_55px_rgba(15,23,42,0.08)]">
          <h1 className="mb-6 text-2xl font-extrabold text-slate-950">
            Produk yang Dipesan
          </h1>

          {order ? (
            <>
              <p className="mb-5 text-sm font-medium text-slate-950">
                {order.product_name}
              </p>

              <div className="mb-5 rounded-[8px] border border-blue-500 bg-slate-50 px-4 py-5">
                <div className="text-xs text-slate-500">Total Pembayaran:</div>
                <div className="mt-2 text-2xl font-extrabold text-red-500">
                  {formatPrice(total)}
                </div>
              </div>

              {subtotal > 0 && (
                <div className="mb-6 rounded-[8px] border border-blue-500 bg-white px-4 py-4 text-sm">
                  <div className="mb-4 text-left text-sm font-bold uppercase tracking-wide text-slate-500">
                    Rincian Pesanan:
                  </div>
                  <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3">
                    <span className="max-w-[65%] text-left font-bold text-slate-950">
                      {order.product_name} (1x)
                    </span>
                    <span className="font-extrabold text-slate-950">
                      {formatPrice(subtotal)}
                    </span>
                  </div>
                  {discount > 0 && (
                    <div className="flex justify-between gap-3 border-b border-slate-200 py-3">
                      <span className="text-slate-600">Diskon</span>
                      <span className="font-semibold text-emerald-600">-{formatPrice(discount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 border-b border-slate-200 py-3">
                    <span className="text-slate-600">Kode Unik</span>
                    <span className="font-semibold text-slate-900">
                      {uniqueCode > 0 ? `+${formatPrice(uniqueCode)}` : "-"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 pt-3">
                    <span className="font-bold text-slate-950">Total</span>
                    <span className="font-extrabold text-slate-950">
                      {formatPrice(uniqueCode > 0 ? total : baseAfterDiscount)}
                    </span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="mb-6 rounded-[8px] border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Kode pesanan: <span className="font-mono font-semibold">{orderCode}</span>
            </div>
          )}

          <h2 className="mb-5 text-2xl font-extrabold text-slate-950">
            Transfer ke Rekening:
          </h2>

          <div className="mb-6 rounded-[8px] border border-slate-200 bg-white px-4 py-5">
            <div className="mb-2 text-sm font-extrabold text-blue-700">
              {settings.payment_bank_name}
            </div>
            <div className="text-xl font-extrabold tracking-wide text-red-500">
              {settings.payment_account_number}
            </div>
            <div className="mt-2 text-xs font-medium text-slate-500">
              {settings.payment_account_name}
            </div>
          </div>

          <h2 className="mb-5 text-2xl font-extrabold text-slate-950">
            Atau Bayar dengan QRIS:
          </h2>

          <div className="mb-6 rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="mx-auto mb-4 max-w-[210px] rounded-[8px] bg-white p-2 shadow-sm">
              <img
                src={settings.payment_qris_url || "/qris.webp"}
                alt="QRIS pembayaran"
                className="h-auto w-full rounded-[6px]"
              />
            </div>
            <div className="rounded-[8px] border border-amber-300 bg-amber-50 p-3 text-left text-xs leading-relaxed text-amber-800">
              <strong>Perhatian:</strong>
              <br />
              Pastikan Anda melakukan pembayaran hanya melalui QRIS atau rekening yang tertera di atas. Simpan bukti pembayaran untuk konfirmasi.
            </div>
          </div>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-[8px] bg-green-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-green-600"
          >
            <FaWhatsapp />
            Konfirmasi via WhatsApp
          </a>
        </div>
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

function buildWhatsappUrl(phone: string | null, orderCode: string) {
  const cleanPhone = (phone || "6281234567890").replace(/\D/g, "");
  const message = encodeURIComponent(
    `Halo, saya ingin konfirmasi pembayaran untuk pesanan ${orderCode}.`
  );
  return `https://wa.me/${cleanPhone}?text=${message}`;
}
