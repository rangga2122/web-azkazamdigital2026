"use client";

import { useEffect, useRef, useState } from "react";
import { FaWhatsapp } from "react-icons/fa";
import { PaymentExpiryCountdown } from "@/components/public/PaymentExpiryCountdown";
import { CopyAccountButton } from "@/components/public/CopyAccountButton";
import { formatPrice } from "@/lib/utils";
import type { Order } from "@/types";

type ThankYouSettings = {
  site_name: string;
  payment_bank_name: string;
  payment_account_number: string;
  payment_account_name: string;
  whatsapp_number: string;
};

export function ThankYouOrderPanel({
  initialOrder,
  orderCode,
  settings,
}: {
  initialOrder: Order | null;
  orderCode: string;
  settings: ThankYouSettings;
}) {
  const [order, setOrder] = useState<Order | null>(initialOrder);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const hasTrackedRefreshRef = useRef(false);

  useEffect(() => {
    if (!order || order.status !== "pending") {
      return;
    }

    let cancelled = false;
    const interval = window.setInterval(async () => {
      try {
        setIsRefreshing(true);
        const response = await fetch(`/api/public/orders/${orderCode}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as { order?: Order };

        if (!response.ok || !payload.order || cancelled) {
          return;
        }

        setOrder((current) => {
          if (!current) {
            return payload.order || null;
          }

          if (current.status !== payload.order!.status) {
            hasTrackedRefreshRef.current = true;
          }

          return payload.order!;
        });
      } catch (error) {
        console.error("Thank-you order refresh error:", error);
      } finally {
        if (!cancelled) {
          setIsRefreshing(false);
        }
      }
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [order, orderCode]);

  const total = Number(
    order?.gateway_total_payment || order?.total_amount || order?.price || 0
  );
  const subtotal = Number(order?.subtotal || (order ? order.price : 0));
  const discount = Number(order?.discount_amount || 0);
  const uniqueCode = Number(order?.unique_code || 0);
  const gatewayFee = Number(order?.gateway_fee || 0);
  const baseAfterDiscount = Math.max(subtotal - discount, 0);
  const isPakasirQris = order?.payment_provider === "pakasir";
  const isPaid = order?.status === "paid";
  const feeChargedToCustomer =
    gatewayFee > 0 &&
    Number(order?.gateway_total_payment || 0) > Number(order?.total_amount || 0);
  const whatsappUrl = buildWhatsappUrl(settings.whatsapp_number, orderCode);
  const qrisImageUrl = order
    ? `/api/qris/order/${order.order_code}`
    : "/qris.webp";

  return (
    <>
      <PaidStatusAnimationStyle />
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

              <div className="mb-6 rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="mb-3 text-center text-sm font-extrabold uppercase tracking-wide text-slate-700">
                  {settings.site_name}
                </div>
                {isPaid ? (
                  <div className="rounded-[18px] border border-emerald-200 bg-gradient-to-b from-emerald-50 to-white px-5 py-6 text-center shadow-[0_16px_36px_rgba(16,185,129,0.14)]">
                    <div className="mx-auto flex h-20 w-20 paid-status-pop items-center justify-center rounded-full bg-emerald-500 shadow-[0_12px_28px_rgba(16,185,129,0.35)]">
                      <svg
                        viewBox="0 0 24 24"
                        className="h-10 w-10 text-white"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M5 12.5l4.2 4.2L19 7.5" />
                      </svg>
                    </div>
                    <div className="mt-4 inline-flex items-center rounded-full border border-emerald-200 bg-white px-4 py-1.5 text-xs font-extrabold uppercase tracking-[0.28em] text-emerald-600">
                      Pembayaran Berhasil
                    </div>
                    <div className="mt-4 text-2xl font-black text-emerald-600">
                      Sudah Terbayar
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">
                      Pembayaran untuk order ini sudah kami terima dan tervalidasi.
                      Anda bisa tenang, pesanan sedang atau sudah diproses.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex items-center justify-center gap-2 text-center text-xl font-extrabold text-slate-950">
                      <span>
                        {isPakasirQris
                          ? "Bayar dengan QRIS Otomatis"
                          : "Bayar dengan QRIS"}
                      </span>
                      {isRefreshing ? (
                        <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600">
                          Mengecek
                        </span>
                      ) : null}
                    </div>
                    <div className="mx-auto mb-4 max-w-[210px] rounded-[8px] bg-white p-2 shadow-sm">
                      <img
                        src={qrisImageUrl}
                        alt="QRIS pembayaran"
                        className="h-auto w-full rounded-[6px]"
                        loading="eager"
                        decoding="sync"
                        fetchPriority="high"
                      />
                    </div>
                    <PaymentExpiryCountdown
                      createdAt={order.created_at}
                      status={order.status}
                      expiryMinutes={10}
                      expiresAt={order.gateway_expired_at}
                    />
                    <div className="mt-4 rounded-[8px] border border-amber-300 bg-amber-50 p-3 text-left text-xs leading-relaxed text-amber-800">
                      <strong>Perhatian:</strong>
                      <br />
                      {isPakasirQris
                        ? "QRIS ini dibuat otomatis untuk order Anda. Status pembayaran dicek otomatis, jadi tunggu beberapa detik setelah bayar."
                        : "Pastikan anda hanya melakukan scan qris hanya lewat web resmi azkazamdigital."}
                    </div>
                  </>
                )}
              </div>

              {!isPakasirQris && (
                <div className="mb-6 rounded-[8px] border border-slate-200 bg-white px-4 py-4 text-left shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                  <div className="mb-1 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                    Alternatif Transfer
                  </div>
                  <div className="mb-4 text-base font-extrabold text-slate-950">
                    Rekening Bank
                  </div>
                  <div className="rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Bank
                        </div>
                        <div className="text-base font-extrabold text-blue-700">
                          {settings.payment_bank_name}
                        </div>
                      </div>
                      <div className="rounded-full bg-blue-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">
                        Manual
                      </div>
                    </div>
                    <div className="border-t border-slate-200 pt-3">
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Nomor Rekening
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-[8px] bg-white px-3 py-3 shadow-sm">
                        <div className="text-lg font-extrabold tracking-wide text-slate-950">
                          {settings.payment_account_number}
                        </div>
                        <CopyAccountButton
                          accountNumber={settings.payment_account_number}
                        />
                      </div>
                    </div>
                    <div className="mt-3 border-t border-slate-200 pt-3">
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Atas Nama
                      </div>
                      <div className="text-sm font-semibold text-slate-700">
                        {settings.payment_account_name}
                      </div>
                    </div>
                  </div>
                </div>
              )}

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
                      <span className="font-semibold text-emerald-600">
                        -{formatPrice(discount)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 border-b border-slate-200 py-3">
                    <span className="text-slate-600">Kode Unik</span>
                    <span className="font-semibold text-slate-900">
                      {uniqueCode > 0 ? `+${formatPrice(uniqueCode)}` : "-"}
                    </span>
                  </div>
                  {feeChargedToCustomer && (
                    <div className="flex justify-between gap-3 border-b border-slate-200 py-3">
                      <span className="text-slate-600">Biaya QRIS</span>
                      <span className="font-semibold text-slate-900">
                        +{formatPrice(gatewayFee)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 pt-3">
                    <span className="font-bold text-slate-950">Total</span>
                    <span className="font-extrabold text-slate-950">
                      {formatPrice(
                        feeChargedToCustomer || uniqueCode > 0 ? total : baseAfterDiscount
                      )}
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
    </>
  );
}

function PaidStatusAnimationStyle() {
  return (
    <style>
      {`
        @keyframes paid-status-pop {
          0% { transform: scale(0.88); box-shadow: 0 0 0 0 rgba(16,185,129,0.30); }
          50% { transform: scale(1); box-shadow: 0 0 0 16px rgba(16,185,129,0); }
          100% { transform: scale(0.94); box-shadow: 0 0 0 0 rgba(16,185,129,0); }
        }

        .paid-status-pop {
          animation: paid-status-pop 1.8s ease-in-out infinite;
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
