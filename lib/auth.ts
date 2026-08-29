import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";

export const SESSION_COOKIE_NAME = "habit_session";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function getSessionSecret() {
  const secret =
    process.env.HABIT_SESSION_SECRET || process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("HABIT_SESSION_SECRET must be set in production");
  }
  return secret || "local-dev-session-secret";
}

function sign(value: string) {
  return createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function createSessionToken() {
  const expires = String(Date.now() + SESSION_TTL_MS);
  return `${expires}.${sign(expires)}`;
}

export function isSessionValid(token: string | undefined) {
  if (!token) return false;
  const [expires, signature] = token.split(".");
  if (!expires || !signature) return false;
  if (!safeEqual(signature, sign(expires))) return false;
  return Number(expires) > Date.now();
}

export function verifyAdminCredentials(
  username: string,
  password: string,
) {
  const expectedUsername = process.env.HABIT_ADMIN_USERNAME || "admin";
  const expectedPassword = process.env.HABIT_ADMIN_PASSWORD || "";
  if (!expectedPassword) return false;
  return (
    safeEqual(username, expectedUsername) &&
    safeEqual(password, expectedPassword)
  );
}

export function isApiRequestAuthenticated(request: Request) {
  const cookieHeader = request.headers.get("cookie") || "";
  const cookies = cookieHeader.split(";").map((item) => item.trim());
  const sessionCookie = cookies.find((item) =>
    item.startsWith(`${SESSION_COOKIE_NAME}=`),
  );
  if (!sessionCookie) return false;
  return isSessionValid(
    decodeURIComponent(sessionCookie.slice(SESSION_COOKIE_NAME.length + 1)),
  );
}
