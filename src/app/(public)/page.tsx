import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sanitizePublicMediaUrl } from "@/lib/legacy-media";
import { isAbsoluteUrl, resolveProductTargetHref } from "@/lib/product-targets";
import { unstable_cache } from "next/cache";
import {
  FaArrowRight,
  FaCheckCircle,
  FaChevronDown,
  FaRobot,
  FaStar,
} from "react-icons/fa";
import type { Product, Testimonial, FAQ } from "@/types";
import { formatPrice } from "@/lib/utils";
import { resolveHomeTexts } from "@/lib/home-texts";

const getCachedHomeData = unstable_cache(
  async function getHomeData() {
    try {
      const supabase = await createServiceRoleClient();

      const [productsRes, testimonialsRes, faqsRes, settingsRes] = await Promise.all([
        supabase
          .from("products")
          .select("*, click_target_page:pages!products_click_target_page_id_fkey(id,title,slug)")
          .eq("is_active", true)
          .eq("is_featured", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("testimonials")
          .select("*")
          .eq("is_active", true)
          .order("sort_order")
          .limit(5),
        supabase
          .from("faqs")
          .select("*")
          .eq("is_active", true)
          .order("sort_order")
          .limit(6),
        supabase
          .from("site_settings")
          .select("hero_title, hero_subtitle, primary_cta_label, primary_cta_url, social_links")
          .limit(1)
          .single(),
      ]);

      return {
        products: (productsRes.data || []) as Product[],
        testimonials: (testimonialsRes.data || []) as Testimonial[],
        faqs: (faqsRes.data || []) as FAQ[],
        texts: resolveHomeTexts(
          settingsRes.data?.social_links as Record<string, unknown> | null,
          settingsRes.data
        ),
      };
    } catch {
      return { products: [], testimonials: [], faqs: [], texts: resolveHomeTexts() };
    }
  },
  ["public-homepage"],
  { revalidate: 60, tags: ["public-pages"] }
);

async function getHomeData() {
  try {
    return await getCachedHomeData();
  } catch {
    return { products: [], testimonials: [], faqs: [], texts: resolveHomeTexts() };
  }
}

export default async function HomePage() {
  const { products, testimonials, faqs, texts } = await getHomeData();
  const stats = [
    { value: texts.stat_1_value, label: texts.stat_1_label },
    { value: texts.stat_2_value, label: texts.stat_2_label },
    { value: texts.stat_3_value, label: texts.stat_3_label },
  ];

  return (
    <main className="overflow-hidden bg-[#f8f9fa] text-[#1a1a2e]">
      {/* Hero Section */}
      <section className="home-contrast relative overflow-hidden bg-[linear-gradient(120deg,#4c5fd7,#0077ff,#00a8ff)] text-white">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
        <div className="absolute -bottom-28 -left-28 h-80 w-80 rounded-full bg-white/10" />
        <div className="absolute left-1/2 top-28 h-64 w-64 -translate-x-1/2 rounded-full bg-cyan-300/20 blur-3xl" />

        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-22">
          <div className="animate-fade-in-up">
            <div className="home-contrast mb-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-950/10 ring-1 ring-white/20 backdrop-blur">
              <FaRobot className="text-cyan-100" />
              {texts.hero_badge}
            </div>

            <h1 className="home-contrast max-w-5xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-[4.2rem]">
              {texts.hero_title}
            </h1>

            <p className="mt-5 max-w-3xl text-base leading-8 text-blue-50 sm:text-lg lg:text-[1.2rem]">
              {texts.hero_subtitle}
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <Link
                href={texts.hero_primary_url}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-3.5 font-bold text-[#0066cc] shadow-xl shadow-blue-950/15 transition hover:scale-105 hover:bg-red-500 hover:text-white"
              >
                {texts.hero_primary_label}
                <FaArrowRight size={14} />
              </Link>
              <Link
                href={texts.hero_secondary_url}
                className="inline-flex items-center justify-center rounded-full border border-white/35 px-7 py-3.5 font-semibold text-white transition hover:bg-white/15"
              >
                {texts.hero_secondary_label}
              </Link>
            </div>

            <div className="mt-10 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-5">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="group relative overflow-hidden rounded-[1.35rem] bg-white px-4 py-5 text-center shadow-2xl shadow-blue-950/20 ring-1 ring-white/70 transition duration-300 hover:-translate-y-1 hover:shadow-blue-950/30"
                >
                  <div className="absolute inset-x-6 top-0 h-1.5 rounded-b-full bg-[linear-gradient(90deg,#00d2d3,#0077ff)]" />
                  <div className="pointer-events-none absolute -right-8 -top-8 h-20 w-20 rounded-full bg-blue-100 transition group-hover:scale-125" />
                  <div className="relative text-3xl font-extrabold tracking-tight text-[#0057b8] sm:text-4xl">
                    {stat.value}
                  </div>
                  <div className="relative mt-2 text-xs font-bold text-[#1a1a2e] sm:text-sm">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 w-full overflow-hidden leading-none">
          <svg
            className="block h-12 w-[calc(100%+1.3px)] sm:h-16"
            viewBox="0 0 1200 120"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              d="M321.39 56.44C181.8 86.35 96.64 91.45 0 68.64V120h1200V0c-132.36 54.36-278.54 77.35-428.18 61.93-176.46-18.18-283.14-41.65-450.43-5.49z"
              fill="#f8f9fa"
            />
          </svg>
        </div>
      </section>

      {/* Products */}
      {products.length > 0 && (
        <section id="produk" className="bg-[#f8f9fa] py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="relative inline-block pb-4 text-3xl font-bold text-[#1a1a2e] after:absolute after:bottom-0 after:left-1/2 after:h-1 after:w-20 after:-translate-x-1/2 after:rounded-full after:bg-[linear-gradient(90deg,#0066cc,#00d2d3)] sm:text-4xl">
                {texts.products_title}
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-[#6c757d]">
                {texts.products_subtitle}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3 xl:gap-8">
              {products.map((product) => (
                <HomeProductCard
                  key={product.id}
                  product={product}
                  buttonLabel={texts.product_card_button}
                  badgeFallback={texts.product_default_badge}
                  ratingLabel={texts.product_rating_label}
                />
              ))}
            </div>

          </div>
        </section>
      )}

      {/* Testimonials */}
      {testimonials.length > 0 && (
        <section className="bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold text-[#1a1a2e] sm:text-4xl">
                {texts.testimonials_title}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[#6c757d]">
                {texts.testimonials_subtitle}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl bg-[#f8f9fa] p-6 shadow-[0_10px_24px_rgba(0,0,0,0.06)] transition hover:-translate-y-1"
                >
                  <div className="mb-4 flex gap-1">
                    {Array.from({ length: item.rating }).map((_, i) => (
                      <FaStar key={i} className="text-amber-400" size={14} />
                    ))}
                  </div>
                  <p className="mb-4 text-sm leading-relaxed text-[#4b5563]">
                    &ldquo;{item.quote}&rdquo;
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[linear-gradient(120deg,#0066cc,#00a8ff)] text-sm font-bold text-white">
                      {item.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-[#1a1a2e]">
                        {item.name}
                      </div>
                      {item.role && (
                        <div className="text-xs text-[#6c757d]">
                          {item.role}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* FAQ */}
      {faqs.length > 0 && (
        <section className="bg-[#f8f9fa] py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mb-12 text-center">
              <h2 className="text-3xl font-bold text-[#1a1a2e] sm:text-4xl">
                {texts.faq_title}
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[#6c757d]">
                {texts.faq_subtitle}
              </p>
            </div>

            <div className="mx-auto max-w-3xl space-y-3">
              {faqs.map((faq) => (
                <details
                  key={faq.id}
                  className="group overflow-hidden rounded-xl bg-white shadow-[0_8px_20px_rgba(0,0,0,0.05)]"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between px-6 py-4 text-sm font-bold text-[#1a1a2e] transition-colors hover:bg-blue-50">
                    {faq.question}
                    <FaChevronDown
                      className="text-[#0066cc] transition-transform group-open:rotate-180"
                      size={12}
                    />
                  </summary>
                  <div className="px-6 pb-4 text-sm leading-relaxed text-[#6c757d]">
                    {faq.answer}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA Section */}
      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-[linear-gradient(120deg,#4c5fd7,#0077ff,#00a8ff)] p-8 text-white shadow-2xl shadow-blue-900/20 sm:p-14">
            <div className="absolute -right-16 -top-16 h-52 w-52 rounded-full bg-white/10" />
            <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-white/10" />
            <div className="relative grid items-center gap-8 lg:grid-cols-[1fr_auto]">
              <div>
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-blue-50">
                  <FaCheckCircle />
                  {texts.cta_badge}
                </div>
                <h2 className="text-3xl font-bold sm:text-4xl">
                  {texts.cta_title}
                </h2>
                <p className="mt-4 max-w-2xl text-blue-50">
                  {texts.cta_subtitle}
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Link
                  href={texts.cta_primary_url}
                  className="rounded-full bg-white px-7 py-3 text-center font-bold text-[#0066cc] transition hover:scale-105 hover:bg-red-500 hover:text-white"
                >
                  {texts.cta_primary_label}
                </Link>
                <Link
                  href={texts.cta_secondary_url}
                  className="rounded-full border border-white/35 px-7 py-3 text-center font-bold text-white transition hover:bg-white/15"
                >
                  {texts.cta_secondary_label}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function HomeProductCard({
  product,
  buttonLabel,
  badgeFallback,
  ratingLabel,
}: {
  product: Product;
  buttonLabel: string;
  badgeFallback: string;
  ratingLabel: string;
}) {
  const productHref = resolveProductTargetHref(product);
  const isExternalTarget = isAbsoluteUrl(productHref);
  const thumbnailUrl = sanitizePublicMediaUrl(product.thumbnail_url);

  return (
    <article className="group relative overflow-hidden rounded-xl bg-white shadow-[0_10px_22px_rgba(0,0,0,0.07)] transition duration-300 hover:-translate-y-2 hover:shadow-[0_18px_45px_rgba(0,0,0,0.12)]">
      {(product.badge || product.is_featured) && (
        <span className="absolute left-3 top-3 z-10 rounded bg-[#ff6b6b] px-3 py-1 text-xs font-bold text-white shadow-lg">
          {product.badge || badgeFallback}
        </span>
      )}

      {isExternalTarget ? (
        <a href={productHref} className="block">
          <div className="h-36 overflow-hidden bg-[#eef7ff] sm:h-52">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={product.title}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#e9f8ff,#ffffff)]">
                <span className="text-4xl font-bold text-[#0066cc]/35">
                  {product.title.charAt(0)}
                </span>
              </div>
            )}
          </div>
        </a>
      ) : (
        <Link href={productHref} className="block">
          <div className="h-36 overflow-hidden bg-[#eef7ff] sm:h-52">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={product.title}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-110"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,#e9f8ff,#ffffff)]">
                <span className="text-4xl font-bold text-[#0066cc]/35">
                  {product.title.charAt(0)}
                </span>
              </div>
            )}
          </div>
        </Link>
      )}

      <div className="p-4 sm:p-6">
        <h3 className="line-clamp-2 min-h-[2.7rem] text-sm font-bold leading-snug text-[#1a1a2e] transition group-hover:text-[#0066cc] sm:text-lg">
          {product.title}
        </h3>

        <div className="mt-3 flex items-center gap-1 text-[#ffc107]">
          {Array.from({ length: 5 }).map((_, index) => (
            <FaStar key={index} size={13} />
          ))}
          <span className="ml-1 hidden text-xs text-[#6c757d] sm:inline">
            {ratingLabel}
          </span>
        </div>

        <div className="mt-4 flex flex-col items-start">
          {product.compare_at_price &&
            product.compare_at_price > product.price && (
              <span className="text-xs text-[#6c757d] line-through sm:text-sm">
                {formatPrice(product.compare_at_price)}
              </span>
            )}
          <span className="text-lg font-bold text-[#0066cc] sm:text-2xl">
            {formatPrice(product.price)}
          </span>
        </div>

        {isExternalTarget ? (
          <a
            href={productHref}
            className="mt-5 block rounded-full bg-[#0066cc] px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-white shadow-lg shadow-blue-900/10 transition hover:scale-[1.03] hover:bg-red-500 sm:text-sm"
          >
            {buttonLabel}
          </a>
        ) : (
          <Link
            href={productHref}
            className="mt-5 block rounded-full bg-[#0066cc] px-4 py-2.5 text-center text-xs font-bold uppercase tracking-wide text-white shadow-lg shadow-blue-900/10 transition hover:scale-[1.03] hover:bg-red-500 sm:text-sm"
          >
            {buttonLabel}
          </Link>
        )}
      </div>
    </article>
  );
}
