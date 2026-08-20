import { checkInviteAccess, readJsonBody, validateSameOriginJsonRequest } from "@/lib/invite-access";
import { createFeedbackIssue, jiraFeedbackConfigured } from "@/lib/jira-feedback";

const MAX_MESSAGE_CHARACTERS = 4000;
const MAX_REQUEST_CHARACTERS = 20_000;
const NO_STORE_HEADERS = { "cache-control": "private, no-store, max-age=0" };

type FeedbackBody = {
  rating?: unknown;
  category?: unknown;
  message?: unknown;
  page?: unknown;
  honeypot?: unknown;
};

export async function POST(request: Request) {
  const requestValidation = validateSameOriginJsonRequest(request, MAX_REQUEST_CHARACTERS);
  if (!requestValidation.ok) {
    return Response.json({ error: requestValidation.error }, { status: requestValidation.status, headers: NO_STORE_HEADERS });
  }

  const inviteAccess = await checkInviteAccess(request);
  if (inviteAccess === "unconfigured") {
    return Response.json({ error: "Invite access is not configured yet." }, { status: 503, headers: NO_STORE_HEADERS });
  }
  if (inviteAccess !== "granted") {
    return Response.json({ error: "Enter your invite code to send feedback." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  if (!jiraFeedbackConfigured()) {
    return Response.json({ error: "Feedback collection is not configured yet." }, { status: 503, headers: NO_STORE_HEADERS });
  }

  const parsedBody = await readJsonBody<FeedbackBody>(request, MAX_REQUEST_CHARACTERS);
  if (!parsedBody.ok) return Response.json({ error: parsedBody.error }, { status: parsedBody.status, headers: NO_STORE_HEADERS });

  const { rating, category, message, page, honeypot } = parsedBody.value;

  if (typeof honeypot === "string" && honeypot.trim()) {
    return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
  }
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return Response.json({ error: "Rating must be between 1 and 5." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (typeof category !== "string" || !category.trim()) {
    return Response.json({ error: "Choose a category." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (typeof message !== "string" || !message.trim()) {
    return Response.json({ error: "Add a short message." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (message.length > MAX_MESSAGE_CHARACTERS) {
    return Response.json({ error: "That message is too long." }, { status: 400, headers: NO_STORE_HEADERS });
  }

  try {
    const issue = await createFeedbackIssue({
      rating,
      category: category.trim().slice(0, 60),
      message: message.trim().slice(0, MAX_MESSAGE_CHARACTERS),
      page: typeof page === "string" && page.trim() ? page.trim().slice(0, 200) : "unknown",
    });
    return Response.json({ ok: true, key: issue.key }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Simplifii feedback submission failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "That feedback could not be sent. Try again shortly." }, { status: 502, headers: NO_STORE_HEADERS });
  }
}
