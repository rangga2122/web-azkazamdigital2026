import { createServiceRoleClient } from "@/lib/supabase/server";
import { isAbsoluteUrl, resolveProductTargetHref } from "@/lib/product-targets";
import { notFound, redirect } from "next/navigation";
import type { Product } from "@/types";

export const dynamic = "force-dynamic";

async function getProductRouteTarget(slug: string) {
  const supabase = await createServiceRoleClient();
  const { data } = await supabase
    .from("products")
    .select(`
      id,
      slug,
      is_active,
      click_target_type,
      checkout_url,
      click_target_page:pages!products_click_target_page_id_fkey (
        slug
      )
    `)
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  return data as (Pick<Product, "id" | "slug" | "click_target_type" | "checkout_url"> & {
    click_target_page?: { slug: string } | null;
  }) | null;
}

function buildRedirectPath(
  targetPath: string,
  searchParams: Record<string, string | string[] | undefined>
) {
  const nextUrl = isAbsoluteUrl(targetPath)
    ? new URL(targetPath)
    : new URL(targetPath, "http://internal.local");

  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item) nextUrl.searchParams.append(key, item);
      });
      continue;
    }

    if (value) {
      nextUrl.searchParams.set(key, value);
    }
  }

  if (isAbsoluteUrl(targetPath)) {
    return nextUrl.toString();
  }

  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`;
}

export default async function ProductGatewayPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const product = await getProductRouteTarget(slug);

  if (!product) {
    notFound();
  }

  const targetPath = resolveProductTargetHref(product);

  redirect(buildRedirectPath(targetPath, query));
}
