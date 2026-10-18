import { NextResponse, type NextRequest } from "next/server";

// OPTIMISTIC check only: it looks at whether a session cookie exists, not whether
// it is valid, so signed-out visitors are bounced to /login without waiting for
// a page render. It is not a security boundary (a forged cookie passes it).
// The real checks are server-side: pages call requireUser(), and every API route
// runs through route() in lib/api/handler.ts, which verifies the cookie with
// Firebase and checks the role.
export function proxy(request: NextRequest) {
  if (!request.cookies.has("__session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
