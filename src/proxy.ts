import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Strictly public — no session check
  const isStrict =
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/employer/login") ||
    pathname.startsWith("/employer/reset-password") ||
    pathname.startsWith("/assessment") ||
    pathname.startsWith("/api/apply") ||
    pathname.startsWith("/api/assessment") ||
    pathname.startsWith("/api/check-access") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icon");

  if (isStrict) return NextResponse.next();

  // Candidate-facing routes where recruiters should be blocked
  const isCandidateRoute =
    pathname === "/" ||
    pathname.startsWith("/apply");

  // Skip session fetch for candidate pages when no session cookie exists
  // — avoids network round-trip for anonymous candidates
  const hasSessionCookie = request.cookies.getAll().some(c => c.name.startsWith("sb-"));
  if (isCandidateRoute && !hasSessionCookie) {
    return NextResponse.next();
  }

  // Build response and create Supabase client
  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let session = null;
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch { /* treat as unauthenticated */ }

  // Authenticated user on candidate route → send to dashboard
  if (isCandidateRoute) {
    if (session) {
      return NextResponse.redirect(new URL("/employer/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // Protected employer routes — require auth
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/employer/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/",
    "/apply/:path*",
    "/employer/dashboard/:path*",
    "/employer/jd-builder/:path*",
    "/api/employer/:path*",
    "/api/candidates/:path*",
    "/api/generate-jd/:path*",
    "/api/generate-assessment/:path*",
    "/api/jd/:path*",
    "/api/scrape/:path*",
    "/api/search-candidates/:path*",
    "/api/parse-profile/:path*",
    "/api/admin/:path*",
    "/api/send-magic-link/:path*",
  ],
};
