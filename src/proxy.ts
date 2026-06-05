import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public routes — never require auth
  const isPublic =
    pathname === "/" ||
    pathname.startsWith("/apply") ||
    pathname.startsWith("/assessment") ||
    pathname.startsWith("/employer/login") ||
    pathname.startsWith("/employer/reset-password") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/apply") ||
    pathname.startsWith("/api/assessment") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");

  if (isPublic) return NextResponse.next();

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

  const { data: { session } } = await supabase.auth.getSession();

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
  ],
};
