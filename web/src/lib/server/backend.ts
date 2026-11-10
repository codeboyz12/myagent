import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const ACCESS_TOKEN_COOKIE = "myagent_access_token";

function backendUrl(path: string): string {
  const baseUrl = (process.env.MYAGENT_API_URL ?? "http://127.0.0.1:8000").replace(
    /\/+$/,
    "",
  );
  return `${baseUrl}${path}`;
}

export async function callBackend(
  path: string,
  init: RequestInit = {},
  options: { authenticated?: boolean } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  if (options.authenticated !== false) {
    const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
    if (!token) {
      return Response.json({ detail: "Sign in to continue." }, { status: 401 });
    }
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(backendUrl(path), {
    ...init,
    headers,
    cache: "no-store",
  });
}

export function relayBackendResponse(response: Response): NextResponse {
  const headers = new Headers({ "Cache-Control": "no-store" });
  const contentType = response.headers.get("content-type");
  const retryAfter = response.headers.get("retry-after");
  if (contentType) headers.set("Content-Type", contentType);
  if (retryAfter) headers.set("Retry-After", retryAfter);

  const proxied = new NextResponse(
    response.status === 204 ? null : response.body,
    { status: response.status, headers },
  );
  if (response.status === 401) proxied.cookies.delete(ACCESS_TOKEN_COOKIE);
  return proxied;
}

export function apiError(message: string, status: number): NextResponse {
  return NextResponse.json(
    { detail: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export function requireSameOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return apiError("Cross-origin request rejected.", 403);
  }
  return null;
}

export async function clearAccessTokenCookie(): Promise<void> {
  (await cookies()).delete(ACCESS_TOKEN_COOKIE);
}

export async function setAccessTokenCookie(
  token: string,
  expiresIn: number,
): Promise<void> {
  (await cookies()).set(ACCESS_TOKEN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: expiresIn,
  });
}

export function unavailableResponse(): NextResponse {
  return apiError("The myagent service is temporarily unavailable.", 503);
}
