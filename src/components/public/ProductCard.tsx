import Link from "next/link";
import { sanitizePublicMediaUrl } from "@/lib/legacy-media";
import { formatPrice } from "@/lib/utils";
import type { Product } from "@/types";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const productTargetHref = resolveProductTargetHref(product);
  const thumbnailUrl = sanitizePublicMediaUrl(product.thumbnail_url);
  const discount = product.compare_at_price
    ? Math.round(
        ((product.compare_at_price - product.price) / product.compare_at_price) *
          100
      )
    : 0;

  return (
    <div className="group relative rounded-2xl bg-dark-900 border border-dark-800 overflow-hidden transition-all duration-300 hover:border-primary-500/30 hover:shadow-xl hover:shadow-primary-500/5 hover:-translate-y-1">
      {/* Badge */}
      {product.badge && (
        <div className="absolute top-4 left-4 z-10">
          <span className="px-3 py-1 rounded-full text-xs font-bold bg-gradient-to-r from-primary-500 to-accent-500 text-white shadow-lg">
            {product.badge}
          </span>
        </div>
      )}

      {/* Thumbnail */}
      <div className="relative aspect-video bg-dark-800 overflow-hidden">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={product.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-dark-800 to-dark-900">
            <div className="text-4xl font-bold gradient-text opacity-40">
              {product.title.charAt(0)}
            </div>
          </div>
        )}
        {/* Overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-dark-900/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </div>

      {/* Content */}
      <div className="p-5">
        <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2 group-hover:text-primary-400 transition-colors">
          {product.title}
        </h3>

        {product.short_description && (
          <p className="text-dark-400 text-sm mb-4 line-clamp-2">
            {product.short_description}
          </p>
        )}

        {/* Price */}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-xl font-bold text-white">
            {formatPrice(product.price)}
          </span>
          {product.compare_at_price && product.compare_at_price > product.price && (
            <>
              <span className="text-sm text-dark-500 line-through">
                {formatPrice(product.compare_at_price)}
              </span>
              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-red-500/20 text-red-400">
                -{discount}%
              </span>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Link
            href={productTargetHref}
            className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-primary-700 text-white text-sm font-semibold text-center shadow-lg shadow-primary-500/20 hover:shadow-primary-500/40 transition-all duration-300 hover:scale-[1.02]"
          >
            Lihat Produk
          </Link>
          <Link
            href={`/order/${product.slug}`}
            className="px-4 py-2.5 rounded-xl border border-primary-500/30 text-primary-400 text-sm font-semibold hover:bg-primary-500/10 transition-all duration-200"
          >
            Beli
          </Link>
        </div>
      </div>
    </div>
  );
}

function resolveProductTargetHref(product: Product) {
  if (
    product.click_target_type === "cms_page" &&
    product.click_target_page?.slug
  ) {
    return `/${product.click_target_page.slug}`;
  }

  if (product.click_target_type === "checkout") {
    return `/order/${product.slug}`;
  }

  return `/produk/${product.slug}`;
}
