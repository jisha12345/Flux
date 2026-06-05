export { proxy as middleware } from "./proxy";

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
