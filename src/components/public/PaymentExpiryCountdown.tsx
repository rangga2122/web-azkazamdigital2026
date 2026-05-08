"use client";

import { useEffect, useMemo, useState } from "react";
import { FaClock } from "react-icons/fa";

type PaymentExpiryCountdownProps = {
  createdAt: string;
  status: string;
  expiryMinutes?: number;
  expiresAt?: string | null;
};

export function PaymentExpiryCountdown({
  createdAt,
  status,
  expiryMinutes = 10,
  expiresAt = null,
}: PaymentExpiryCountdownProps) {
  const expiryTimestamp = useMemo(() => {
    if (expiresAt) {
      const explicitExpiryMs = new Date(expiresAt).getTime();
      if (Number.isFinite(explicitExpiryMs)) {
        return explicitExpiryMs;
      }
    }

    const createdAtMs = new Date(createdAt).getTime();
    return createdAtMs + expiryMinutes * 60 * 1000;
  }, [createdAt, expiryMinutes, expiresAt]);

  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(expiryTimestamp - Date.now(), 0)
  );

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemainingMs(Math.max(expiryTimestamp - Date.now(), 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [expiryTimestamp]);

  if (status !== "pending") {
    return null;
  }

  const isExpired = remainingMs <= 0;
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const countdownText = `${String(minutes).padStart(2, "0")}:${String(
    seconds
  ).padStart(2, "0")}`;

  return (
    <div className="mt-3 text-center">
      <div
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-bold tabular-nums ${
          isExpired
            ? "border-red-200 bg-red-50 text-red-600"
            : "border-orange-200 bg-orange-50 text-orange-600"
        }`}
      >
        <FaClock />
        <span>{isExpired ? "Expired" : countdownText}</span>
      </div>
      <div className="mt-1 text-[11px] text-slate-500">
        {isExpired ? "Waktu habis" : "Segera selesaikan pembayaran"}
      </div>
    </div>
  );
}
