// =============================================================================
// api-client.ts — 前端 fetch 封装，自动附加 JWT token
// =============================================================================

const TOKEN_KEY = "auth_access_token";
const REFRESH_TOKEN_KEY = "auth_refresh_token";

// ---------------------------------------------------------------------------
// Token storage helpers
// ---------------------------------------------------------------------------

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function persistTokens(accessToken: string, refreshToken?: string): void {
  localStorage.setItem(TOKEN_KEY, accessToken);
  if (refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

// ---------------------------------------------------------------------------
// Error class — thrown on non-2xx responses
// ---------------------------------------------------------------------------

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// API response envelope — matches server { data } / { error } shape
// ---------------------------------------------------------------------------

interface ApiEnvelope<T> {
  data?: T;
  error?: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Core request function
// ---------------------------------------------------------------------------

async function request<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  // Merge caller-supplied headers (e.g. for Content-Type override)
  if (options.headers) {
    const extra = options.headers as Record<string, string>;
    for (const key of Object.keys(extra)) {
      headers[key] = extra[key]!;
    }
  }

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch (networkError) {
    throw new ApiError(
      "NETWORK_ERROR",
      "Network request failed — please check your connection",
      0,
    );
  }

  // Try to parse JSON body — empty responses (204, etc.) are fine
  let json: ApiEnvelope<T> | null = null;
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      json = (await res.json()) as ApiEnvelope<T>;
    } catch {
      // body is not valid JSON — treat as success with undefined data
    }
  }

  // --- Handle HTTP-level errors ---
  if (!res.ok) {
    // On 401, flush tokens and redirect to /login (best-effort)
    if (res.status === 401) {
      clearTokens();
      if (typeof window !== "undefined") {
        // Use a small delay so the current render cycle finishes
        setTimeout(() => {
          window.location.href = "/login";
        }, 100);
      }
    }

    throw new ApiError(
      json?.error?.code ?? "HTTP_ERROR",
      json?.error?.message ?? `Request failed with status ${res.status}`,
      res.status,
    );
  }

  // --- API-level error inside 2xx ---
  if (json?.error) {
    throw new ApiError(json.error.code, json.error.message, res.status);
  }

  // --- Success path ---
  return (json?.data as T) ?? (undefined as unknown as T);
}

// ---------------------------------------------------------------------------
// Convenience methods
// ---------------------------------------------------------------------------

export const api = {
  get<T = unknown>(url: string, init?: Omit<RequestInit, "method" | "body">): Promise<T> {
    return request<T>(url, { ...init, method: "GET" });
  },

  /** Like get(), but returns the full JSON body without unwrapping {data}. Use for paginated endpoints. */
  rawGet<T = unknown>(url: string, init?: Omit<RequestInit, "method" | "body">): Promise<T> {
    const token = getToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    return fetch(url, { ...init, method: "GET", headers })
      .then((r) => r.json() as Promise<T>);
  },

  post<T = unknown>(url: string, body?: unknown, init?: Omit<RequestInit, "method" | "body">): Promise<T> {
    return request<T>(url, {
      ...init,
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  put<T = unknown>(url: string, body?: unknown, init?: Omit<RequestInit, "method" | "body">): Promise<T> {
    return request<T>(url, {
      ...init,
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  patch<T = unknown>(url: string, body?: unknown, init?: Omit<RequestInit, "method" | "body">): Promise<T> {
    return request<T>(url, {
      ...init,
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  delete<T = unknown>(url: string, init?: Omit<RequestInit, "method" | "body">): Promise<T> {
    return request<T>(url, { ...init, method: "DELETE" });
  },
};

export default api;
