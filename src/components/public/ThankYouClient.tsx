"use client";

import { useEffect } from "react";
import { trackConfiguredEvents } from "@/components/tracking/PixelEvents";
import type { Order } from "@/types";

export function ThankYouClient({ order }: { order: Order }) {
  useEffect(() => {
    trackConfiguredEvents(
      { type: "thankyou", productId: order.product_id },
      {
        Purchase: {
          content_name: order.order_code,
          value: Number(order.total_amount || order.price),
          currency: "IDR",
        },
      }
    );
  }, [order.order_code, order.price, order.product_id, order.total_amount]);

  return null;
}
