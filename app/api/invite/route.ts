import { checkInviteAccess, inviteCookie, readSameOriginJson, verifyInviteCode } from "@/lib/invite-access";

const NO_STORE_HEADERS = { "cache-control": "private, no-store, max-age=0", vary: "Cookie" };
const MAX_INVITE_BODY_CHARACTERS = 1024;
const MAX_FAILED_ATTEMPTS = 8;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const failedAttempts = new Map<string, { count: number; resetsAt: number }>();

function visitorKey(request: Request) {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}

function attemptState(key: string) {
  const now = Date.now();
  const current = failedAttempts.get(key);
  if (!current || current.resetsAt <= now) {
    failedAttempts.delete(key);
    return null;
  }
  return current;
}

function recordFailure(key: string) {
  const current = attemptState(key);
  failedAttempts.set(key, current
    ? { ...current, count: current.count + 1 }
    : { count: 1, resetsAt: Date.now() + ATTEMPT_WINDOW_MS });
  if (failedAttempts.size > 1000) {
    for (const storedKey of failedAttempts.keys()) {
      if (!attemptState(storedKey)) failedAttempts.delete(storedKey);
    }
  }
}

export async function GET(request: Request) {
  const state = await checkInviteAccess(request);
  if (state === "unconfigured") {
    return Response.json({ granted: false, error: "Invite access is not configured yet." }, { status: 503, headers: NO_STORE_HEADERS });
  }
  return Response.json({ granted: state === "granted" }, { headers: NO_STORE_HEADERS });
}

export async function POST(request: Request) {
  const body = await readSameOriginJson<{ code?: unknown }>(request, MAX_INVITE_BODY_CHARACTERS);
  if (!body.ok) return Response.json({ granted: false, error: body.error }, { status: body.status, headers: NO_STORE_HEADERS });
  const code = typeof body.value.code === "string" ? body.value.code.slice(0, 256) : "";
  const key = visitorKey(request);
  if ((attemptState(key)?.count ?? 0) >= MAX_FAILED_ATTEMPTS) {
    return Response.json({ granted: false, error: "Too many attempts. Try again later." }, { status: 429, headers: NO_STORE_HEADERS });
  }

  const result = await verifyInviteCode(code);
  if (result.state === "unconfigured") {
    return Response.json({ granted: false, error: "Invite access is not configured yet." }, { status: 503, headers: NO_STORE_HEADERS });
  }
  if (result.state !== "granted") {
    recordFailure(key);
    await new Promise((resolve) => setTimeout(resolve, 350));
    return Response.json({ granted: false, error: "That invite code is not recognised." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  failedAttempts.delete(key);
  return Response.json(
    { granted: true },
    {
      headers: {
        ...NO_STORE_HEADERS,
        "set-cookie": inviteCookie(request, result.token),
      },
    },
  );
}
