import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get('sb-access-token')?.value;
  const role = request.cookies.get('sb-user-role')?.value || 'user';

  // Define route types
  const isAuthRoute = pathname.startsWith('/login') || 
                      pathname.startsWith('/register') || 
                      pathname.startsWith('/forgot-password') || 
                      pathname.startsWith('/reset-password');
  
  const isAdminRoute = pathname.startsWith('/admin');
  const isBrokerRoute = pathname.startsWith('/broker');

  // 1. If no token and not on an auth route, redirect to login
  if (!token && !isAuthRoute) {
    // Exclude static assets and public icons
    if (pathname.includes('.') || pathname.startsWith('/api/') || pathname.startsWith('/_next/')) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 2. If has token and on an auth route, redirect to appropriate dashboard
  if (token && isAuthRoute) {
    if (role === 'admin' || role === 'super_admin') {
      return NextResponse.redirect(new URL('/admin', request.url));
    }
    if (role === 'broker') {
      return NextResponse.redirect(new URL('/broker', request.url));
    }
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 3. Role-based protection for Admin routes
  if (isAdminRoute && role !== 'admin' && role !== 'super_admin') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 4. Role-based protection for Broker routes
  if (isBrokerRoute && role !== 'broker' && role !== 'admin' && role !== 'super_admin') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

// See "Matching Paths" below to learn more
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|icons/).*)',
  ],
};
