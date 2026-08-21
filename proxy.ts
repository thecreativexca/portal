import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow auth-related routes and static files
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname === "/"
  ) {
    return NextResponse.next();
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Redirect to login if not authenticated
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const role = token.role as string;

  // Coarse page-level gating. Fine-grained enforcement happens in the API
  // layer via permission checks (lib/guards.ts).
  const isPeopleManagement =
    pathname.startsWith("/users") ||
    pathname.startsWith("/departments") ||
    pathname.startsWith("/roles");

  if (isPeopleManagement && role !== "ceo" && role !== "hr") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // CEO-only pages
  if (
    pathname.startsWith("/settings") ||
    pathname.startsWith("/logs") ||
    pathname.startsWith("/admin")
  ) {
    if (role !== "ceo") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  // Reports — any role holding reports.read
  if (pathname.startsWith("/reports")) {
    if (!["ceo", "hr", "project_manager"].includes(role)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
