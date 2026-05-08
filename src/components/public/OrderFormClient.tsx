"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { sanitizePublicMediaUrl } from "@/lib/legacy-media";
import { formatPrice } from "@/lib/utils";
import {
  trackPageView,
  trackConfiguredEvents,
} from "@/components/tracking/PixelEvents";
import toast from "react-hot-toast";
import type { Product } from "@/types";

export type OrderFormSettings = {
  checkout_coupon_enabled: boolean;
  pakasir_enabled: boolean;
};

export function OrderFormClient({
  product,
  settings,
  previewUniqueCode,
}: {
  product: Product;
  settings: OrderFormSettings;
  previewUniqueCode: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discount_amount: number;
    kind: "coupon" | "referral";
    message: string;
  } | null>(null);
  const [form, setForm] = useState({
    buyer_name: "",
    buyer_email: "",
    buyer_whatsapp: "",
    coupon_code: "",
  });
  const referralCodeFromQuery = searchParams.get("ref")?.trim().toUpperCase() || null;
  const thumbnailUrl = sanitizePublicMediaUrl(product.thumbnail_url);
  const previewDiscount = appliedCoupon?.discount_amount || 0;
  const previewBaseTotal = Math.max(product.price - previewDiscount, 0);
  const previewTotal = previewBaseTotal + previewUniqueCode;
  const paymentMethodLabel = "QRIS/Transfer";

  useEffect(() => {
    trackPageView({ type: "checkout", productId: product.id });
    trackConfiguredEvents(
      { type: "checkout", productId: product.id },
      {
        ViewContent: {
          content_name: product.title,
          content_type: "product",
          value: product.price,
          currency: "IDR",
        },
        InitiateCheckout: {
          content_name: product.title,
          value: product.price,
          currency: "IDR",
        },
      }
    );
  }, [product.id, product.price, product.title]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });

    if (name === "coupon_code") {
      setCouponError("");
      if (
        appliedCoupon &&
        value.trim().toUpperCase() !== appliedCoupon.code.toUpperCase()
      ) {
        setAppliedCoupon(null);
      }
    }
  }

  async function handleApplyCoupon() {
    const code = form.coupon_code.trim();

    if (!code) {
      setCouponError("Masukkan kode kupon terlebih dahulu.");
      return;
    }

    setCouponLoading(true);
    setCouponError("");

    try {
      const response = await fetch("/api/coupons/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_id: product.id,
          coupon_code: code,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        code?: string;
        discount_amount?: number;
        kind?: "coupon" | "referral";
        message?: string;
      };

      if (!response.ok || !payload.code) {
        throw new Error(payload.error || "Kode kupon tidak valid.");
      }

      setAppliedCoupon({
        code: payload.code,
        discount_amount: Number(payload.discount_amount || 0),
        kind: payload.kind || "coupon",
        message: payload.message || "Kode berhasil dipakai.",
      });
      setForm((current) => ({ ...current, coupon_code: payload.code || code }));
      toast.success(payload.message || "Kode berhasil dipakai.");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Kode kupon tidak valid.";
      setAppliedCoupon(null);
      setCouponError(message);
      toast.error(message);
    } finally {
      setCouponLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!form.buyer_name || !form.buyer_email || !form.buyer_whatsapp) {
      toast.error("Silakan lengkapi semua field wajib.");
      return;
    }

    if (
      settings.checkout_coupon_enabled &&
      form.coupon_code.trim() &&
      form.coupon_code.trim().toUpperCase() !== appliedCoupon?.code.toUpperCase()
    ) {
      toast.error("Klik Pakai Kupon terlebih dahulu agar totalnya valid.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product_id: product.id,
          buyer_name: form.buyer_name.trim(),
          buyer_email: form.buyer_email.trim(),
          buyer_whatsapp: form.buyer_whatsapp.trim(),
          notes: null,
          unique_code: previewUniqueCode,
          coupon_code: appliedCoupon?.code || referralCodeFromQuery || null,
        }),
      });

      const payload = (await response.json()) as {
        error?: string;
        order_code?: string;
      };

      if (!response.ok || !payload.order_code) {
        throw new Error(payload.error || "Pesanan gagal dibuat.");
      }
      toast.success("Pesanan berhasil dibuat!");
      router.push(`/thank-you/${payload.order_code}`);
    } catch (err: unknown) {
      console.error(err);
      const message =
        err instanceof Error
          ? err.message
          : "Gagal membuat pesanan. Silakan coba lagi.";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-[8px] border border-slate-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-200 bg-slate-50 px-6 py-6">
        <div className="flex items-center gap-4">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={product.title}
              className="h-16 w-16 rounded-[8px] object-cover"
              decoding="async"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-[8px] bg-blue-600 text-xl font-bold text-white">
              {product.title.charAt(0)}
            </div>
          )}
          <div>
            <h3 className="text-lg font-bold text-slate-950">{product.title}</h3>
            <div className="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-500">
              {formatPrice(product.price)}
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 px-6 py-7">
        <TextInput
          label="Nama Lengkap"
          name="buyer_name"
          value={form.buyer_name}
          onChange={handleChange}
          placeholder="Masukkan nama lengkap"
          required
        />
        <TextInput
          label="Email"
          name="buyer_email"
          type="email"
          value={form.buyer_email}
          onChange={handleChange}
          placeholder="nama@email.com"
          required
        />
        <TextInput
          label="Nomor WhatsApp"
          name="buyer_whatsapp"
          type="tel"
          value={form.buyer_whatsapp}
          onChange={handleChange}
          placeholder="6281234567890"
          required
        />

        {settings.checkout_coupon_enabled && (
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-900">
              Kode Kupon / Referal <span className="font-normal">(opsional)</span>
            </label>
            <div className="relative">
              <input
                name="coupon_code"
                value={form.coupon_code}
                onChange={handleChange}
                placeholder="Masukkan kode kupon"
                className="w-full rounded-[8px] border border-slate-300 bg-white py-3 pl-4 pr-36 text-slate-950 outline-none transition focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleApplyCoupon}
                disabled={couponLoading || !form.coupon_code.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[6px] bg-gradient-to-r from-amber-500 to-yellow-300 px-3 py-2 text-xs font-extrabold text-amber-950 shadow-[0_8px_20px_rgba(245,158,11,0.28)] transition hover:from-amber-400 hover:to-yellow-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {couponLoading ? "Cek..." : "Pakai Kupon"}
              </button>
            </div>
            {appliedCoupon ? (
              <div className="mt-2 text-xs font-semibold text-emerald-600">
                {appliedCoupon.message}
              </div>
            ) : couponError ? (
              <div className="mt-2 text-xs font-semibold text-red-500">
                {couponError}
              </div>
            ) : null}
          </div>
        )}

        <div>
          <div className="mb-2 text-base font-bold text-slate-950">
            Metode Pembayaran:
          </div>
          <label className="flex items-center gap-4 rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm">
            <input
              type="radio"
              name="payment_method"
              value="bank_transfer_qris"
              defaultChecked
              className="h-4 w-4 accent-blue-500"
            />
            <img
              src="/bank-transfer-qris.jpg"
              alt="Bank Transfer"
              className="h-8 w-14 rounded-[2px] object-contain"
              loading="lazy"
              decoding="async"
            />
            <span className="text-base font-semibold text-slate-950">
              {paymentMethodLabel}
            </span>
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          data-order-submit="true"
          className="w-full rounded-[8px] bg-[#13bd12] px-6 py-4 text-lg font-extrabold uppercase tracking-wide text-white shadow-sm transition hover:bg-[#0ead0e] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Memproses..." : "Pesan Sekarang"}
        </button>

        <div className="rounded-[8px] border border-blue-500 bg-white p-4">
          <div className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">
            Rincian Pesanan:
          </div>
          <div className={`flex items-start justify-between gap-4 ${product.compare_at_price && product.compare_at_price > product.price ? "pb-2" : "border-b border-slate-200 pb-3"}`}>
            <div className="max-w-[65%] text-base font-bold text-slate-950">
              {product.title} (1x)
            </div>
            <div className="text-right">
              <div className="text-base font-extrabold text-slate-950">
                {formatPrice(product.price)}
              </div>
            </div>
          </div>
          {product.compare_at_price && product.compare_at_price > product.price && (
            <div className="flex justify-end border-b border-slate-200 pb-3 text-sm font-semibold text-red-500 line-through">
              {formatPrice(product.compare_at_price)}
            </div>
          )}
          {previewDiscount > 0 && appliedCoupon && (
            <div className="flex justify-between gap-4 border-b border-slate-200 py-3 text-sm">
              <span className="text-slate-600">
                Diskon Kupon {appliedCoupon.code}
              </span>
              <span className="font-semibold text-emerald-600">
                -{formatPrice(previewDiscount)}
              </span>
            </div>
          )}
          <div className="flex justify-between gap-4 border-b border-slate-200 py-3 text-sm">
            <span className="text-slate-600">Kode Unik</span>
            <span className="font-semibold text-slate-900">{formatPrice(previewUniqueCode)}</span>
          </div>
          <div className="flex justify-between gap-4 pt-3">
            <span className="font-bold text-slate-950">Total</span>
            <span className="text-xl font-extrabold text-blue-950">
              {formatPrice(previewTotal)}
            </span>
          </div>
        </div>
      </form>
    </div>
  );
}

function TextInput({
  label,
  required,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-slate-900">
        {label}{" "}
        {required ? (
          <span className="text-red-500">*</span>
        ) : (
          <span className="font-normal">(opsional)</span>
        )}
      </label>
      <input
        {...props}
        required={required}
        className="w-full rounded-[8px] border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none transition focus:border-blue-500"
      />
    </div>
  );
}
