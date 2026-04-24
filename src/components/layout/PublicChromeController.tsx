"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function PublicChromeController() {
  const pathname = usePathname();

  useEffect(() => {
    const shouldHide =
      pathname?.startsWith("/order/") || pathname?.startsWith("/thank-you/");

    if (shouldHide) {
      document.body.setAttribute("data-hide-route-chrome", "true");
    } else {
      document.body.removeAttribute("data-hide-route-chrome");
    }

    return () => {
      document.body.removeAttribute("data-hide-route-chrome");
    };
  }, [pathname]);

  return (
    <style>
      {`
        body[data-hide-route-chrome="true"] [data-public-header],
        body[data-hide-route-chrome="true"] [data-public-footer],
        body[data-hide-route-chrome="true"] [data-whatsapp-float] {
          display: none !important;
        }
      `}
    </style>
  );
}
