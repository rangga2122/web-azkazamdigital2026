import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  // Handle referral tracking cookie
  const ref = request.nextUrl.searchParams.get('ref');
  if (ref) {
    supabaseResponse.cookies.set('az_ref', ref, {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });
  }

  if (pathname.startsWith('/produk/')) {
    const slug = pathname.split('/').filter(Boolean)[1];
    if (slug) {
      const { data: product } = await supabase
        .from('products')
        .select(`
          slug,
          click_target_type,
          click_target_page:pages!products_click_target_page_id_fkey (
            slug
          )
        `)
        .eq('slug', slug)
        .eq('is_active', true)
        .maybeSingle();

      if (product) {
        const targetPage = Array.isArray(product.click_target_page)
          ? product.click_target_page[0]
          : product.click_target_page;
        const targetPath =
          product.click_target_type === 'cms_page' && targetPage?.slug
            ? `/${targetPage.slug}`
            : `/order/${product.slug}`;
        const targetUrl = new URL(targetPath, request.url);
        request.nextUrl.searchParams.forEach((value, key) => {
          targetUrl.searchParams.set(key, value);
        });
        const redirectResponse = NextResponse.redirect(targetUrl);
        if (ref) {
          redirectResponse.cookies.set('az_ref', ref, {
            maxAge: 30 * 24 * 60 * 60,
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
          });
        }
        return redirectResponse;
      }
    }
  }

  // Admin route protection
  if (pathname.startsWith('/admin')) {
    if (!user) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Check admin role via admins table (has proper RLS policy)
    const { data: admin } = await supabase
      .from('admins')
      .select('id, is_active, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!admin || !['super_admin', 'admin'].includes(admin.role)) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // User dashboard protection
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/affiliate/dashboard')) {
    if (!user) {
      return NextResponse.redirect(new URL('/affiliate/login', request.url));
    }
  }

  // Redirect logged-in admins away from login page
  if (pathname === '/login' && user) {
    const { data: admin } = await supabase
      .from('admins')
      .select('id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (admin) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/dashboard/:path*',
    '/affiliate/dashboard/:path*',
    '/login',
    '/((?!_next/static|_next/image|favicon.ico|uploads|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
