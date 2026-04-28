import { createServiceRoleClient } from "@/lib/supabase/server";
import { ProductCard } from "@/components/public/ProductCard";
import type { Product, Category } from "@/types";
import type { Metadata } from "next";
import { ProductFilter } from "@/components/public/ProductFilter";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Semua Produk",
  description:
    "Jelajahi koleksi produk digital premium kami. Template, ebook, tools, dan kursus online berkualitas tinggi.",
};

async function getProducts(categorySlug?: string, search?: string) {
  try {
    const supabase = await createServiceRoleClient();
    let query = supabase
      .from("products")
      .select("*, click_target_page:pages!products_click_target_page_id_fkey(id,title,slug)")
      .eq("is_active", true)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false });

    if (search) {
      query = query.ilike("title", `%${search}%`);
    }

    const { data: products } = await query;
    const { data: categories } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order");

    let filteredProducts = products || [];

    if (categorySlug) {
      const category = (categories || []).find(
        (c: Category) => c.slug === categorySlug
      );
      if (category) {
        const { data: productCats } = await supabase
          .from("product_categories")
          .select("product_id")
          .eq("category_id", category.id);

        const productIds = (productCats || []).map(
          (pc: { product_id: string }) => pc.product_id
        );
        filteredProducts = filteredProducts.filter((p: Product) =>
          productIds.includes(p.id)
        );
      }
    }

    return {
      products: filteredProducts as Product[],
      categories: (categories || []) as Category[],
    };
  } catch {
    return { products: [], categories: [] };
  }
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ kategori?: string; search?: string }>;
}) {
  const params = await searchParams;
  const { products, categories } = await getProducts(
    params.kategori,
    params.search
  );

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="relative py-16 sm:py-20">
        <div className="absolute inset-0 bg-gradient-to-b from-primary-500/5 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-4">
            Semua <span className="gradient-text">Produk</span>
          </h1>
          <p className="text-dark-400 max-w-xl mx-auto">
            Temukan produk digital terbaik untuk kebutuhan bisnis Anda.
          </p>
        </div>
      </section>

      {/* Filter & Products */}
      <section className="pb-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <ProductFilter
            categories={categories}
            currentCategory={params.kategori}
            currentSearch={params.search}
          />

          {products.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">📦</div>
              <h3 className="text-xl font-semibold text-white mb-2">
                Belum ada produk
              </h3>
              <p className="text-dark-400">
                Produk akan segera tersedia. Stay tuned!
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
