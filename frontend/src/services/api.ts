/**
 * Backend API istemcisi.
 *
 * - Access token yalnızca bellekte tutulur (localStorage'a yazılmaz → XSS ile kalıcı çalınması zorlaşır).
 * - Refresh token HttpOnly cookie'dedir; JS erişemez. 401 alınınca bir kez sessizce yenilenir.
 * - Aktif organizasyon X-Organization-ID başlığıyla gönderilir.
 */
import type { TokenResponse } from "../types/api";

const BASE = "/api/v1";
export const ACTIVE_ORG_KEY = "fg.activeOrg";

let accessToken: string | null = null;
let refreshing: Promise<TokenResponse | null> | null = null;
let onUnauthorized: () => void = () => {};

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function doRefresh(): Promise<TokenResponse | null> {
  try {
    const res = await fetch(`${BASE}/auth/refresh`, { method: "POST", credentials: "same-origin" });
    if (!res.ok) return null;
    const data = (await res.json()) as TokenResponse;
    accessToken = data.access_token;
    return data;
  } catch {
    return null;
  }
}

/** Aynı anda birden fazla 401 gelirse tek bir refresh isteği yapılır. */
export function refreshSession(): Promise<TokenResponse | null> {
  if (!refreshing) refreshing = doRefresh().finally(() => (refreshing = null));
  return refreshing;
}

function formatDetail(detail: unknown, status: number): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: { loc?: (string | number)[]; msg?: string }) => {
        const field = d.loc?.slice(1).join(".");
        return field ? `${field}: ${d.msg}` : d.msg;
      })
      .join("; ");
  }
  return `İstek başarısız (HTTP ${status})`;
}

interface Options {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

export async function api<T>(path: string, opts: Options = {}, retry = true): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const org = localStorage.getItem(ACTIVE_ORG_KEY);
  if (org) headers["X-Organization-ID"] = org;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError(0, "Sunucuya ulaşılamıyor. Backend çalışıyor mu?");
  }

  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    if (await refreshSession()) return api<T>(path, opts, false);
    onUnauthorized();
  }
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = (await res.json()).detail;
    } catch {
      /* gövde JSON değil */
    }
    throw new ApiError(res.status, formatDetail(detail, res.status));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
