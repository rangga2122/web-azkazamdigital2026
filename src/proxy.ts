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
  ],
};
