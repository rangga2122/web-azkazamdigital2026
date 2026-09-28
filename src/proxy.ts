import { verifyLmAdmin } from "@/lib/lm-admin";
import { NextResponse, type NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Admin route protection via License Manager backend session
  if (pathname.startsWith('/admin')) {
    const admin = await verifyLmAdmin();
    if (!admin.ok) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

    // User dashboard protection (still Supabase Auth — member area untouched)
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/affiliate/dashboard')) {
    if (!request.cookies.get('sb-auth-token') && !request.cookies.getAll().some(c => c.name.startsWith('sb-'))) {
      return NextResponse.redirect(new URL('/affiliate/login', request.url));
    }
  }

  // Redirect logged-in admins away from login page
  if (pathname === '/login') {
    const admin = await verifyLmAdmin();
    if (admin.ok) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/dashboard/:path*',
    '/affiliate/dashboard/:path*',
    '/login',
  ],
};
