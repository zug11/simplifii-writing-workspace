const PRODUCTION_COOKIE = "__Host-simplifii-invite";
const DEVELOPMENT_COOKIE = "simplifii_invite_v1";
const INVITE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const MAX_CLOCK_SKEW_SECONDS = 60;

export type InviteAccessState = "granted" | "required" | "unconfigured";
export type JsonReadResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
export type RequestValidationResult = { ok: true } | { ok: false; status: number; error: string };

function configuration() {
  const inviteCode = process.env.SIMPLIFII_INVITE_CODE?.trim() ?? "";
  const sessionSecret = process.env.SIMPLIFII_INVITE_SESSION_SECRET?.trim() ?? "";
  if (inviteCode.length < 20 || sessionSecret.length < 32) return null;
  return { inviteCode, sessionSecret };
}

function isHttps(request: Request) {
  return new URL(request.url).protocol === "https:";
}

function cookieName(request: Request) {
  return isHttps(request) ? PRODUCTION_COOKIE : DEVELOPMENT_COOKIE;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("INVALID_TOKEN");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function textToBase64Url(value: string) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function base64UrlToText(value: string) {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

async function digest(value: string) {
  const output = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(output);
}

function constantTimeEqual(first: Uint8Array, second: Uint8Array) {
  const length = Math.max(first.length, second.length);
  let difference = first.length ^ second.length;
  for (let index = 0; index < length; index += 1) difference |= (first[index] || 0) ^ (second[index] || 0);
  return difference === 0;
}

async function signingKey(inviteCode: string, sessionSecret: string) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`${sessionSecret}:${inviteCode}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function createSessionToken(inviteCode: string, sessionSecret: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const nonce = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = textToBase64Url(JSON.stringify({ v: 1, iat: issuedAt, exp: issuedAt + INVITE_MAX_AGE_SECONDS, n: nonce }));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(inviteCode, sessionSecret), new TextEncoder().encode(payload));
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function verifySessionToken(token: string, inviteCode: string, sessionSecret: string) {
  if (token.length > 1024) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return false;

  try {
    const signatureValid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(inviteCode, sessionSecret),
      base64UrlToBytes(signature),
      new TextEncoder().encode(payload),
    );
    if (!signatureValid) return false;
    const parsed = JSON.parse(base64UrlToText(payload)) as { v?: unknown; iat?: unknown; exp?: unknown; n?: unknown };
    const now = Math.floor(Date.now() / 1000);
    return parsed.v === 1
      && typeof parsed.iat === "number"
      && typeof parsed.exp === "number"
      && typeof parsed.n === "string"
      && parsed.n.length >= 20
      && parsed.iat <= now + MAX_CLOCK_SKEW_SECONDS
      && parsed.exp > now
      && parsed.exp - parsed.iat === INVITE_MAX_AGE_SECONDS;
  } catch {
    return false;
  }
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return "";
    }
  }
  return "";
}

export async function checkInviteAccess(request: Request): Promise<InviteAccessState> {
  const configured = configuration();
  if (!configured) return "unconfigured";
  const cookie = readCookie(request, cookieName(request));
  if (!cookie) return "required";
  return await verifySessionToken(cookie, configured.inviteCode, configured.sessionSecret) ? "granted" : "required";
}

export async function verifyInviteCode(submittedCode: string) {
  const configured = configuration();
  if (!configured) return { state: "unconfigured" as const };
  const [submittedDigest, expectedDigest] = await Promise.all([
    digest(submittedCode.trim()),
    digest(configured.inviteCode),
  ]);
  if (!constantTimeEqual(submittedDigest, expectedDigest)) return { state: "required" as const };
  return {
    state: "granted" as const,
    token: await createSessionToken(configured.inviteCode, configured.sessionSecret),
  };
}

export function inviteCookie(request: Request, token: string) {
  const secure = isHttps(request) ? "; Secure" : "";
  return `${cookieName(request)}=${encodeURIComponent(token)}; Path=/; Max-Age=${INVITE_MAX_AGE_SECONDS}; HttpOnly; SameSite=Lax${secure}`;
}

export function validateSameOriginJsonRequest(request: Request, maxCharacters: number): RequestValidationResult {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin !== new URL(request.url).origin) return { ok: false, status: 403, error: "This request was not accepted." };
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) return { ok: false, status: 415, error: "Send this request as JSON." };
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > maxCharacters) return { ok: false, status: 413, error: "That request is too large." };
  return { ok: true };
}

export async function readJsonBody<T>(request: Request, maxCharacters: number): Promise<JsonReadResult<T>> {
  const text = await request.text();
  if (text.length > maxCharacters) return { ok: false, status: 413, error: "That request is too large." };
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false, status: 400, error: "That request was not valid JSON." };
  }
}

export async function readSameOriginJson<T>(request: Request, maxCharacters: number): Promise<JsonReadResult<T>> {
  const validation = validateSameOriginJsonRequest(request, maxCharacters);
  if (!validation.ok) return validation;
  return readJsonBody<T>(request, maxCharacters);
}
