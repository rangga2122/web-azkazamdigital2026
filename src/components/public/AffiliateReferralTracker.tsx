"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function AffiliateReferralTracker({
  productSlug,
}: {
  productSlug: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const referralCode = searchParams.get("ref");
    if (!referralCode) return;

    const key = `az-ref-track:${productSlug}:${referralCode}`;
    if (window.sessionStorage.getItem(key)) return;

    window.sessionStorage.setItem(key, "1");

    void fetch("/api/track-click", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        referral_code: referralCode,
        product_slug: productSlug,
        landing_path: pathname,
      }),
    }).catch(() => {
      window.sessionStorage.removeItem(key);
    });
  }, [pathname, productSlug, searchParams]);

  return null;
}
