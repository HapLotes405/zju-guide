import { SignJWT, jwtVerify } from "jose";
import { hashSync, compareSync } from "bcryptjs";
import type { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// JWT secret (fallback for dev so the app doesn't crash when .env is missing)
// ---------------------------------------------------------------------------

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "dev-jwt-secret"
);

const JWT_REFRESH_SECRET = new TextEncoder().encode(
  process.env.JWT_REFRESH_SECRET || "dev-refresh-secret"
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JwtPayload {
  sub: string;
  role: string;
}

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------

/** Create an access token (24h expiry). */
export async function signToken(payload: {
  sub: string;
  role: string;
}): Promise<string> {
  return new SignJWT({ sub: payload.sub, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(JWT_SECRET);
}

/** Create a refresh token (7d expiry). */
export async function signRefreshToken(payload: {
  sub: string;
  role: string;
}): Promise<string> {
  return new SignJWT({ sub: payload.sub, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(JWT_REFRESH_SECRET);
}

/** Verify an access token and return the payload. */
export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET);
  return payload as unknown as JwtPayload;
}

// ---------------------------------------------------------------------------
// Password helpers
// ---------------------------------------------------------------------------

/** Hash a plain-text password with bcryptjs (salt rounds = 10). */
export function hashPassword(password: string): string {
  return hashSync(password, 10);
}

/** Compare a plain-text password against a bcryptjs hash. */
export function comparePassword(password: string, hash: string): boolean {
  return compareSync(password, hash);
}

// ---------------------------------------------------------------------------
// Auth middleware helpers
// ---------------------------------------------------------------------------

/**
 * Extract and verify the JWT from the Authorization header.
 * Returns { userId, role } on success; throws on failure.
 */
export async function requireAuth(
  request: NextRequest
): Promise<{ userId: string; role: string }> {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("UNAUTHORIZED", "Missing or invalid Authorization header");
  }

  const token = authHeader.slice(7);

  try {
    const payload = await verifyToken(token);
    return { userId: payload.sub, role: payload.role };
  } catch {
    throw new AuthError("UNAUTHORIZED", "Invalid or expired token");
  }
}

/**
 * Call requireAuth first, then check that the caller has the required role.
 * Returns the same { userId, role } object on success; throws on failure.
 */
export async function requireRole(
  request: NextRequest,
  role: string
): Promise<{ userId: string; role: string }> {
  const user = await requireAuth(request);

  if (user.role !== role) {
    throw new AuthError("FORBIDDEN", `Role '${role}' is required`);
  }

  return user;
}

// ---------------------------------------------------------------------------
// Error class – caught by API route handlers to produce uniform responses
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status ?? (code === "UNAUTHORIZED" ? 401 : code === "FORBIDDEN" ? 403 : 400);
  }
}
