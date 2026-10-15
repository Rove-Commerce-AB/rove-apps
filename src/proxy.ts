import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { AppKey } from "@/lib/peopleTypes";

function requiredAppForPath(pathname: string): AppKey | null {
  if (
    pathname.startsWith("/planner") ||
    pathname.startsWith("/projects") ||
    pathname.startsWith("/reports") ||
    pathname.startsWith("/customer-status")
  ) {
    return "planner";
  }
  if (pathname.startsWith("/time-report")) return "time_report";
  if (pathname.startsWith("/insights")) return "insights";
  if (pathname.startsWith("/work")) return "work";
  return null;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isLogin = pathname === "/login";
  const isChangePassword = pathname === "/change-password";
  const isAuthCallback = pathname.startsWith("/auth/");
  const isAccessDenied = pathname === "/access-denied";

  // Unauthenticated → /login
  if (!req.auth && !isLogin && !isAuthCallback) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Signed in but not in app_users → /access-denied
  if (req.auth && !req.auth.user.appUserId && !isAccessDenied && !isLogin) {
    return NextResponse.redirect(new URL("/access-denied", req.url));
  }

  const mustChangePassword = Boolean(req.auth?.user.mustChangePassword);

  if (req.auth && mustChangePassword && !isChangePassword && !isAccessDenied) {
    return NextResponse.redirect(new URL("/change-password", req.url));
  }

  if (req.auth && isChangePassword && !mustChangePassword) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Signed in user hitting /login → Home (or change-password if required)
  if (req.auth && isLogin) {
    return NextResponse.redirect(
      new URL(mustChangePassword ? "/change-password" : "/", req.url)
    );
  }

  const requiredApp = requiredAppForPath(pathname);
  if (
    req.auth &&
    requiredApp &&
    !req.auth.user.appKeys?.includes(requiredApp)
  ) {
    return NextResponse.redirect(new URL("/access-denied", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
