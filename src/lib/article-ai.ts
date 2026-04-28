import type { ArticleAutomationSettings } from "@/types";
import {
  DEFAULT_ARTICLE_AUTOMATION_SETTINGS,
  DEFAULT_ARTICLE_PROMPT_TEMPLATE,
} from "@/lib/article-config";
import {
  buildProductRecommendationShortcode,
  extractProductRecommendationTokens,
  injectProductRecommendationIntoHtml,
  injectProductRecommendationShortcodes,
  type ProductRecommendationLinkTarget,
  type ProductRecommendationSource,
  type ProductRecommendationStyle,
} from "@/lib/article-product-recommendations";
import { createSlug, sanitizeHtml } from "@/lib/utils";

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

type ArticleGenerationInput = {
  topic?: string | null;
  focusKeyword?: string | null;
  siteName: string;
  siteDescription?: string | null;
  settings?: Partial<ArticleAutomationSettings> | null;
  recommendedProducts?: ProductRecommendationSource[] | null;
  titleVariantSeed?: string | null;
};

type AutomationSuggestionInput = {
  topicQueue: string;
  targetKeywords?: string | null;
  siteContext?: string | null;
  avoidTopics?: string | null;
  siteName?: string | null;
  siteDescription?: string | null;
};

type PageSeoSuggestionInput = {
  title?: string | null;
  slug?: string | null;
  contentHtml?: string | null;
  productTitle?: string | null;
  siteName?: string | null;
  siteDescription?: string | null;
};

export type GeneratedArticleDraft = {
  title: string;
  slug: string;
  excerpt: string;
  focusKeyword: string;
  seoTitle: string;
  seoDescription: string;
  authorName: string;
  tags: string[];
  contentHtml: string;
};

export type GeneratedAutomationSuggestions = {
  targetKeywords: string;
  siteContext: string;
  avoidTopics: string;
  summary: string;
};

export type GeneratedPageSeoSuggestions = {
  seoTitle: string;
  seoDescription: string;
  summary: string;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
  error?: {
    message?: string;
  };
};

export async function generateArticleDraft(
  input: ArticleGenerationInput
): Promise<GeneratedArticleDraft> {
  const settings = {
    ...DEFAULT_ARTICLE_AUTOMATION_SETTINGS,
    ...(input.settings || {}),
  };

  const topic =
    input.topic?.trim() ||
    input.focusKeyword?.trim() ||
    "Strategi SEO untuk bisnis digital";
  const focusKeyword =
    input.focusKeyword?.trim() ||
    pickFirstKeyword(settings.target_keywords) ||
    topic;
  const authorName =
    settings.default_author_name?.trim() ||
    DEFAULT_ARTICLE_AUTOMATION_SETTINGS.default_author_name;
  const promptTemplate =
    settings.prompt_template?.trim() || DEFAULT_ARTICLE_PROMPT_TEMPLATE;
  const prompt = applyPromptTemplate(promptTemplate, {
    SITE_NAME: input.siteName || "AzkazamDigital",
    SITE_DESCRIPTION:
      input.siteDescription?.trim() ||
      "Platform produk digital premium untuk kebutuhan bisnis online.",
    SITE_CONTEXT:
      settings.site_context || DEFAULT_ARTICLE_AUTOMATION_SETTINGS.site_context,
    TARGET_KEYWORDS:
      settings.target_keywords ||
      DEFAULT_ARTICLE_AUTOMATION_SETTINGS.target_keywords,
    TOPIC: topic,
    FOCUS_KEYWORD: focusKeyword,
    INTERNAL_LINK_URL:
      settings.internal_link_url ||
      DEFAULT_ARTICLE_AUTOMATION_SETTINGS.internal_link_url,
    INTERNAL_LINK_ANCHOR:
      settings.internal_link_anchor ||
      DEFAULT_ARTICLE_AUTOMATION_SETTINGS.internal_link_anchor,
    AUTHOR_NAME: authorName,
  });
  const titleConstraintPrompt = buildTitleConstraintPrompt(
    input.topic?.trim() || "",
    focusKeyword
  );
  const recommendationGuidance = buildRecommendationPrompt(
    input.recommendedProducts
  );

  const responseText = await callNvidiaChatCompletion([
    {
      role: "system",
      content:
        "Anda adalah penulis artikel SEO senior untuk situs bisnis digital Indonesia. Selalu balas HANYA dengan JSON valid tanpa markdown.",
    },
    {
      role: "user",
      content: [prompt, titleConstraintPrompt, recommendationGuidance]
        .filter(Boolean)
        .join("\n\n"),
    },
  ]);

  const parsed = parseJsonResponse(responseText);
  const contentHtml = finalizeContentHtml(
    String(parsed.contentHtml || ""),
    input.recommendedProducts,
    topic,
    focusKeyword
  );

  if (!contentHtml) {
    throw new Error("AI tidak mengembalikan konten artikel yang valid.");
  }

  const title = limitText(
    resolveGeneratedTitle({
      requestedTopic: input.topic?.trim() || "",
      parsedTitle: String(parsed.title || ""),
      fallbackTopic: topic,
      focusKeyword,
      titleVariantSeed: input.titleVariantSeed || new Date().toISOString(),
    }),
    110
  );
  const slug = createSlug(String(parsed.slug || title || topic));
  const excerpt = limitText(
    sanitizePlainText(
      String(parsed.excerpt || stripHtml(contentHtml).slice(0, 220))
    ),
    220
  );
  const seoTitle = limitText(
    resolveSeoTitle({
      requestedTopic: input.topic?.trim() || "",
      parsedSeoTitle: String(parsed.seoTitle || ""),
      title,
      focusKeyword,
      titleVariantSeed: input.titleVariantSeed || new Date().toISOString(),
    }),
    70
  );
  const seoDescription = limitText(
    sanitizePlainText(
      String(parsed.seoDescription || excerpt || stripHtml(contentHtml))
    ),
    170
  );

  return {
    title: title || topic,
    slug: slug || createSlug(topic),
    excerpt,
    focusKeyword: limitText(
      sanitizePlainText(String(parsed.focusKeyword || focusKeyword)),
      120
    ),
    seoTitle,
    seoDescription,
    authorName: limitText(
      sanitizePlainText(String(parsed.authorName || authorName)),
      100
    ),
    tags: normalizeTags(parsed.tags),
    contentHtml,
  };
}

export async function generateAutomationSuggestions(
  input: AutomationSuggestionInput
): Promise<GeneratedAutomationSuggestions> {
  const topicQueue = input.topicQueue.trim();

  if (!topicQueue) {
    throw new Error("Topik Queue wajib diisi lebih dulu.");
  }

  const prompt = `Analisa daftar topik berikut sebagai acuan utama strategi konten SEO.

Nama situs: ${input.siteName?.trim() || "AzkazamDigital"}
Deskripsi situs: ${
    input.siteDescription?.trim() ||
    "Platform produk digital premium untuk kebutuhan bisnis online."
  }

Topik Queue utama:
${topicQueue}

Target Keywords saat ini:
${input.targetKeywords?.trim() || "-"}

Konteks Bisnis saat ini:
${input.siteContext?.trim() || "-"}

Avoid Topics saat ini:
${input.avoidTopics?.trim() || "-"}

Tugas:
- Gunakan Topik Queue sebagai patokan utama.
- Jika Target Keywords saat ini sudah relevan, pertahankan dan rapikan; jika kurang, lengkapi.
- Buat Konteks Bisnis yang lebih tajam, jelas, dan selaras dengan Topik Queue.
- Buat daftar Avoid Topics yang realistis untuk menjaga fokus SEO dan brand safety.
- Hindari topik sensitif yang tidak relevan dengan bisnis digital.

Format output:
- targetKeywords: string dipisahkan koma
- siteContext: 1 paragraf singkat, jelas, natural
- avoidTopics: string dipisahkan koma
- summary: 1 kalimat singkat menjelaskan arah strategi

Kembalikan HANYA JSON valid dengan struktur:
{
  "targetKeywords": "keyword 1, keyword 2",
  "siteContext": "string",
  "avoidTopics": "string",
  "summary": "string"
}`;

  const responseText = await callNvidiaChatCompletion([
    {
      role: "system",
      content:
        "Anda adalah strategist SEO konten untuk bisnis digital Indonesia. Selalu balas HANYA dengan JSON valid tanpa markdown.",
    },
    {
      role: "user",
      content: prompt,
    },
  ]);

  const parsed = parseJsonResponse(responseText);

  return {
    targetKeywords: limitText(
      sanitizePlainText(String(parsed.targetKeywords || input.targetKeywords || "")),
      500
    ),
    siteContext: limitText(
      sanitizePlainText(String(parsed.siteContext || input.siteContext || "")),
      500
    ),
    avoidTopics: limitText(
      sanitizePlainText(String(parsed.avoidTopics || input.avoidTopics || "")),
      300
    ),
    summary: limitText(sanitizePlainText(String(parsed.summary || "")), 220),
  };
}

export async function generatePageSeoSuggestions(
  input: PageSeoSuggestionInput
): Promise<GeneratedPageSeoSuggestions> {
  const title = sanitizePlainText(input.title || "");
  const slug = sanitizePlainText(input.slug || "");
  const productTitle = sanitizePlainText(input.productTitle || "");
  const htmlSource = input.contentHtml || "";
  const plainText = limitText(stripHtml(htmlSource), 6000);

  if (!htmlSource.trim() || !plainText) {
    throw new Error("Konten HTML wajib diisi lebih dulu agar AI punya acuan.");
  }

  const prompt = `Analisa konten landing page / halaman berikut lalu buat metadata SEO yang relevan.

Nama situs: ${input.siteName?.trim() || "AzkazamDigital"}
Deskripsi situs: ${
    input.siteDescription?.trim() ||
    "Platform produk digital premium untuk kebutuhan bisnis online."
  }
Judul halaman saat ini: ${title || "-"}
Slug halaman: ${slug || "-"}
Produk terkait: ${productTitle || "-"}

Cuplikan isi HTML yang sudah dibersihkan:
${plainText}

Tugas:
- Buat 1 Judul SEO yang natural, menarik untuk pencarian Google, dan sesuai isi halaman.
- Buat 1 Deskripsi SEO yang ringkas, jelas, dan mencerminkan isi landing page.
- Jangan membuat judul clickbait atau terlalu generik.
- Jika ada nama produk yang kuat, pertahankan secara natural.
- Judul SEO ideal maksimal sekitar 60-70 karakter.
- Deskripsi SEO ideal maksimal sekitar 150-170 karakter.
- Fokus pada intent pencarian dan manfaat utama halaman.

Kembalikan HANYA JSON valid dengan struktur:
{
  "seoTitle": "string",
  "seoDescription": "string",
  "summary": "1 kalimat singkat tentang angle SEO yang dipilih"
}`;

  const responseText = await callNvidiaChatCompletion([
    {
      role: "system",
      content:
        "Anda adalah spesialis SEO on-page untuk landing page bisnis digital Indonesia. Selalu balas HANYA dengan JSON valid tanpa markdown.",
    },
    {
      role: "user",
      content: prompt,
    },
  ]);

  const parsed = parseJsonResponse(responseText);
  const fallbackTitle = limitText(title || productTitle || slug, 70);
  const fallbackDescription = limitText(plainText, 170);

  return {
    seoTitle: limitText(
      sanitizePlainText(String(parsed.seoTitle || fallbackTitle)),
      70
    ),
    seoDescription: limitText(
      sanitizePlainText(String(parsed.seoDescription || fallbackDescription)),
      170
    ),
    summary: limitText(
      sanitizePlainText(String(parsed.summary || "")),
      220
    ),
  };
}

async function callNvidiaChatCompletion(messages: ChatMessage[]) {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  const invokeUrl =
    process.env.NVIDIA_INVOKE_URL?.trim() ||
    "https://integrate.api.nvidia.com/v1/chat/completions";
  const model =
    process.env.NVIDIA_ARTICLE_MODEL?.trim() || "openai/gpt-oss-120b";

  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY belum diset.");
  }

  const response = await fetch(invokeUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 1,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      max_tokens: 4096,
      stream: false,
      reasoning_effort: "medium",
    }),
    cache: "no-store",
  });

  const payload = (await response.json().catch(() => null)) as ChatCompletionResponse | null;

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ||
        `Permintaan ke NVIDIA gagal dengan status ${response.status}.`
    );
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => item.text || "")
      .join("")
      .trim();
  }

  throw new Error("Respons NVIDIA tidak berisi konten artikel.");
}

function applyPromptTemplate(
  template: string,
  replacements: Record<string, string>
) {
  return Object.entries(replacements).reduce((accumulator, [key, value]) => {
    return accumulator.replaceAll(`{{${key}}}`, value || "-");
  }, template);
}

function parseJsonResponse(rawResponse: string) {
  const trimmed = rawResponse.trim();

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const jsonMatch = trimmed.match(/\{[\s\S]*\}$/);
    if (!jsonMatch) {
      throw new Error("AI tidak mengembalikan JSON yang bisa diproses.");
    }

    try {
      return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      throw new Error("JSON artikel dari AI tidak valid.");
    }
  }
}

function sanitizeContentHtml(html: string) {
  return sanitizeHtml(removeLeadingHeading(html).trim());
}

function finalizeContentHtml(
  html: string,
  recommendedProducts: ProductRecommendationSource[] | null | undefined,
  topic: string,
  focusKeyword: string
) {
  const sanitizedHtml = sanitizeContentHtml(html);
  const products = recommendedProducts?.filter((product) => Boolean(product.slug)) || [];

  if (products.length === 0) {
    return sanitizedHtml;
  }

  const tokens = extractProductRecommendationTokens(sanitizedHtml);
  const validProductSlugs = new Set(products.map((product) => product.slug));
  const renderedSlugs = new Set(
    tokens.map((token) => token.slug).filter((slug) => validProductSlugs.has(slug))
  );
  const productsToInject = products
    .slice(0, 3)
    .filter((product) => !renderedSlugs.has(product.slug));

  if (productsToInject.length === 0) {
    return sanitizedHtml;
  }

  const shortcodes = productsToInject.map((product, index) =>
    buildProductRecommendationShortcode({
      slug: product.slug,
      caption:
        product.preferred_caption ||
        buildAutomaticRecommendationCaption(product, focusKeyword || topic),
      style:
        product.preferred_style ||
        pickAutomaticRecommendationStyle(productsToInject.length, index),
      linkTarget:
        product.preferred_link_target ||
        pickAutomaticRecommendationLinkTarget(product),
      contactLabel: product.contact_label,
      contactUrl: product.contact_url,
    })
  );

  return shortcodes.length === 1
    ? injectProductRecommendationIntoHtml(sanitizedHtml, shortcodes[0])
    : injectProductRecommendationShortcodes(sanitizedHtml, shortcodes);
}

function removeLeadingHeading(html: string) {
  return html.replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>\s*/i, "");
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizePlainText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function limitText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength).trim();
}

function normalizeTags(value: unknown) {
  const tags = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];

  return Array.from(
    new Set(
      tags
        .map((item) => sanitizePlainText(String(item || "")))
        .filter(Boolean)
        .slice(0, 8)
    )
  );
}

function pickFirstKeyword(rawKeywords: string | null | undefined) {
  return (rawKeywords || "")
    .split(",")
    .map((item) => item.trim())
    .find(Boolean);
}

function buildTitleConstraintPrompt(topic: string, focusKeyword: string) {
  if (!topic) {
    return "";
  }

  return `Aturan judul yang WAJIB:
- Judul artikel HARUS mengikuti topik input ini secara langsung: "${topic}"
- Kembangkan topik menjadi judul yang lebih menarik, jangan copy mentah topik apa adanya.
- Jangan mengganti topik utama menjadi topik generik lain.
- Jangan memakai pola judul generik seperti "Strategi SEO..." atau "Bisnis Digital..." jika topik input tidak memang membahas itu.
- Jika ada nama produk, platform, atau istilah spesifik pada topik input, pertahankan di judul.
- Focus keyword prioritas tetap: "${focusKeyword}"`;
}

function buildRecommendationPrompt(
  recommendedProducts: ProductRecommendationSource[] | null | undefined
) {
  const products = recommendedProducts?.filter((product) => Boolean(product.slug)) || [];

  if (products.length === 0) {
    return "";
  }

  const productLines = products
    .slice(0, 4)
    .map((product) => {
      const landingNote = product.click_target_page_slug
        ? `landing tersedia di /${product.click_target_page_slug}`
        : "landing khusus tidak tersedia";
      const contactNote =
        product.contact_url && product.contact_label
          ? `kontak tambahan: ${product.contact_label} -> ${product.contact_url}`
          : "kontak tambahan tidak tersedia";

      return `- slug: ${product.slug}; nama: ${product.title}; deskripsi: ${
        product.preferred_caption ||
        product.short_description ||
        "-"
      }; ${landingNote}; ${contactNote}`;
    })
    .join("\n");

  return `Jika relevan, sisipkan 1 atau 2 shortcode rekomendasi produk di bagian tengah artikel, bukan di paragraf pembuka atau penutup.

Gunakan HANYA slug produk berikut:
${productLines}

Aturan shortcode:
- Format: [product-recommendation slug="slug-produk" caption="caption singkat" style="spotlight|compact|banner" link="product|order|landing"]
- Gunakan style yang bervariasi jika memasukkan lebih dari satu rekomendasi.
- Jika tersedia beberapa produk, usahakan semua produk yang diberikan ikut tampil di artikel secara natural.
- Gunakan link="landing" hanya jika produk memang punya landing tersedia.
- Caption harus natural, relevan dengan pembahasan, dan tidak hard selling.
- Jangan menaruh shortcode di dalam tag anchor atau heading.`;
}

function buildAutomaticRecommendationCaption(
  product: ProductRecommendationSource,
  focusKeyword: string
) {
  const keyword = focusKeyword.trim().toLowerCase();

  if (product.short_description?.trim()) {
    return product.short_description.trim();
  }

  if (keyword) {
    return `${product.title} bisa jadi pilihan praktis untuk mendukung strategi ${keyword} Anda.`;
  }

  return `${product.title} layak dipertimbangkan jika Anda ingin eksekusi lebih cepat dan rapi.`;
}

function pickAutomaticRecommendationStyle(
  productCount: number,
  index: number
): ProductRecommendationStyle {
  if (productCount <= 1) return "spotlight";

  const styleRotation: ProductRecommendationStyle[] =
    productCount >= 3
      ? ["spotlight", "compact", "banner"]
      : ["spotlight", "compact"];

  return styleRotation[index % styleRotation.length];
}

function pickAutomaticRecommendationLinkTarget(
  product: ProductRecommendationSource
): ProductRecommendationLinkTarget {
  if (product.click_target_page_slug) {
    return "landing";
  }

  if (product.click_target_type === "checkout") {
    return "order";
  }

  return "product";
}

function resolveGeneratedTitle({
  requestedTopic,
  parsedTitle,
  fallbackTopic,
  focusKeyword,
  titleVariantSeed,
}: {
  requestedTopic: string;
  parsedTitle: string;
  fallbackTopic: string;
  focusKeyword: string;
  titleVariantSeed: string;
}) {
  const cleanRequestedTopic = sanitizePlainText(requestedTopic);
  const cleanParsedTitle = sanitizePlainText(parsedTitle);
  if (
    cleanRequestedTopic &&
    cleanParsedTitle &&
    titleMatchesRequestedTopic(cleanParsedTitle, cleanRequestedTopic) &&
    !titleLooksTooGenericForTopic(cleanParsedTitle, cleanRequestedTopic)
  ) {
    return cleanParsedTitle;
  }

  if (cleanRequestedTopic) {
    return expandTopicToTitle(
      cleanRequestedTopic,
      focusKeyword,
      titleVariantSeed
    );
  }

  if (cleanParsedTitle) {
    return cleanParsedTitle;
  }

  return sanitizePlainText(fallbackTopic);
}

function resolveSeoTitle({
  requestedTopic,
  parsedSeoTitle,
  title,
  focusKeyword,
  titleVariantSeed,
}: {
  requestedTopic: string;
  parsedSeoTitle: string;
  title: string;
  focusKeyword: string;
  titleVariantSeed: string;
}) {
  const cleanRequestedTopic = sanitizePlainText(requestedTopic);
  const cleanParsedSeoTitle = sanitizePlainText(parsedSeoTitle);

  if (!cleanRequestedTopic) {
    return cleanParsedSeoTitle || title;
  }

  if (!cleanParsedSeoTitle) {
    return limitText(
      expandTopicToTitle(cleanRequestedTopic, focusKeyword, titleVariantSeed),
      70
    );
  }

  return titleMatchesRequestedTopic(cleanParsedSeoTitle, cleanRequestedTopic) &&
    !titleLooksTooGenericForTopic(cleanParsedSeoTitle, cleanRequestedTopic)
    ? cleanParsedSeoTitle
    : title;
}

function tokenizeComparisonText(value: string) {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((token) => token.length >= 3)
    )
  );
}

function titleMatchesRequestedTopic(title: string, requestedTopic: string) {
  const topicTokens = tokenizeComparisonText(requestedTopic);
  const titleTokens = tokenizeComparisonText(title);
  const matchingTokenCount = topicTokens.filter((token) =>
    titleTokens.includes(token)
  ).length;

  return matchingTokenCount >= Math.max(2, Math.ceil(topicTokens.length / 2));
}

function titleLooksTooGenericForTopic(title: string, requestedTopic: string) {
  const lowerTitle = title.toLowerCase();
  const lowerTopic = requestedTopic.toLowerCase();
  const genericPrefixes = [
    "strategi seo",
    "strategi digital",
    "bisnis digital",
    "panduan seo untuk bisnis digital",
  ];

  return genericPrefixes.some(
    (prefix) => lowerTitle.startsWith(prefix) && !lowerTopic.includes(prefix)
  );
}

function expandTopicToTitle(
  topic: string,
  focusKeyword: string,
  titleVariantSeed: string
) {
  const topicBase = sanitizePlainText(topic);
  const keywordBase = sanitizePlainText(focusKeyword);
  const angles = [
    "Panduan Fitur, Cara Kerja, dan Tips Penggunaan",
    "Manfaat, Keunggulan, dan Cara Memakainya",
    "Review Fungsi, Strategi Pakai, dan Hasilnya",
    "Solusi Praktis untuk Kerja Lebih Cepat dan Rapi",
    "Cocok untuk Siapa, Cara Pakai, dan Nilai Gunanya",
    "Penjelasan Lengkap, Skema Pakai, dan Potensi Hasilnya",
  ];
  const hashInput = `${topicBase}|${keywordBase}|${titleVariantSeed}`;
  const angle = angles[Math.abs(hashString(hashInput)) % angles.length];

  return `${topicBase}: ${angle}`;
}

function hashString(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }

  return hash;
}
