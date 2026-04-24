"use client";

import { useEffect } from "react";
import { trackViewContent } from "@/components/tracking/PixelEvents";
import type { Product } from "@/types";

export function ProductDetailClient({ product }: { product: Product }) {
  useEffect(() => {
    trackViewContent(product.title, product.price, product.id);
  }, [product.id, product.title, product.price]);

  return null;
}
