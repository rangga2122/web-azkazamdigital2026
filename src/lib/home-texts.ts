export const HOME_TEXT_DEFAULTS = {
  hero_badge: "Robot Otomasi Bisnis & Produk Digital",
  hero_title:
    "Tingkatkan Produktivitas Bisnis dengan Produk Digital Siap Pakai",
  hero_subtitle:
    "Temukan tools, template, dan sistem pemasaran modern yang membantu bisnis online tumbuh lebih cepat, lebih rapi, dan lebih mudah dijalankan setiap hari.",
  hero_primary_label: "Lihat Produk Kami",
  hero_primary_url: "/produk",
  hero_secondary_label: "Program Afiliasi",
  hero_secondary_url: "/affiliate",
  stat_1_value: "24/7",
  stat_1_label: "Siap dipakai",
  stat_2_value: "1K+",
  stat_2_label: "Pengguna",
  stat_3_value: "30%",
  stat_3_label: "Komisi aff",
  hero_product_eyebrow: "Produk unggulan",
  hero_product_fallback_title: "Robot Otomasi Bisnis",
  hero_product_badge: "New",
  products_title: "Produk Unggulan Kami",
  products_subtitle:
    "Katalog ini tetap sinkron dengan data produk di admin, tetapi tampil dengan gaya visual seperti referensi yang Anda berikan.",
  product_default_badge: "Best Seller",
  product_rating_label: "(5.0)",
  product_card_button: "Lihat Produk",
  products_all_button: "Lihat Semua Produk",
  testimonials_title: "Apa Kata Pelanggan",
  testimonials_subtitle:
    "Testimoni langsung dari pelanggan yang sudah menggunakan produk kami.",
  faq_title: "Pertanyaan Umum",
  faq_subtitle: "Jawaban untuk pertanyaan yang sering ditanyakan.",
  cta_badge: "Siap digunakan untuk bisnis online",
  cta_title: "Mulai optimasi bisnis digital Anda hari ini",
  cta_subtitle:
    "Pilih produk yang paling sesuai, gunakan sistemnya, lalu manfaatkan program afiliasi untuk membuka penghasilan baru.",
  cta_primary_label: "Mulai Sekarang",
  cta_primary_url: "/produk",
  cta_secondary_label: "Jadi Afiliasi",
  cta_secondary_url: "/affiliate",
} as const;

export type HomeTextKey = keyof typeof HOME_TEXT_DEFAULTS;
export type HomeTexts = Record<HomeTextKey, string>;

export function resolveHomeTexts(
  socialLinks?: Record<string, unknown> | null,
  base?: {
    hero_title?: string | null;
    hero_subtitle?: string | null;
    primary_cta_label?: string | null;
    primary_cta_url?: string | null;
  } | null
): HomeTexts {
  const texts = { ...HOME_TEXT_DEFAULTS } as HomeTexts;

  for (const key of Object.keys(HOME_TEXT_DEFAULTS) as HomeTextKey[]) {
    const value = socialLinks?.[`home_${key}`];
    if (typeof value === "string" && value.trim()) {
      texts[key] = value;
    }
  }

  if (base?.hero_title?.trim()) texts.hero_title = base.hero_title;
  if (base?.hero_subtitle?.trim()) texts.hero_subtitle = base.hero_subtitle;
  if (base?.primary_cta_label?.trim()) {
    texts.hero_primary_label = base.primary_cta_label;
  }
  if (base?.primary_cta_url?.trim()) {
    texts.hero_primary_url = base.primary_cta_url;
  }

  return texts;
}
