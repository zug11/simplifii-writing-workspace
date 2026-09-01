import { checkInviteAccess, readJsonBody, validateSameOriginJsonRequest } from "@/lib/invite-access";
import { emailFeedbackConfigured, sendFeedbackEmail } from "@/lib/email-feedback";

const MAX_MESSAGE_CHARACTERS = 4000;
const MAX_WISHES_CHARACTERS = 2000;
const MAX_EMAIL_CHARACTERS = 254;
const MAX_REQUEST_CHARACTERS = 20_000;
const MAX_FEATURES = 8;
const NO_STORE_HEADERS = { "cache-control": "private, no-store, max-age=0" };
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FeedbackBody = {
  rating?: unknown;
  area?: unknown;
  category?: unknown;
  message?: unknown;
  nextWishes?: unknown;
  interestedFeatures?: unknown;
  coDesignOptIn?: unknown;
  contactEmail?: unknown;
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

  if (!emailFeedbackConfigured()) {
    return Response.json({ error: "Feedback collection is not configured yet." }, { status: 503, headers: NO_STORE_HEADERS });
  }

  const parsedBody = await readJsonBody<FeedbackBody>(request, MAX_REQUEST_CHARACTERS);
  if (!parsedBody.ok) return Response.json({ error: parsedBody.error }, { status: parsedBody.status, headers: NO_STORE_HEADERS });

  const { rating, area, category, message, nextWishes, interestedFeatures, coDesignOptIn, contactEmail, page, honeypot } = parsedBody.value;

  if (typeof honeypot === "string" && honeypot.trim()) {
    return Response.json({ ok: true }, { headers: NO_STORE_HEADERS });
  }
  if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return Response.json({ error: "Rating must be between 1 and 5." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (typeof area !== "string" || !area.trim()) {
    return Response.json({ error: "Choose which part this is about." }, { status: 400, headers: NO_STORE_HEADERS });
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
  if (nextWishes !== undefined && (typeof nextWishes !== "string" || nextWishes.length > MAX_WISHES_CHARACTERS)) {
    return Response.json({ error: "That's too long." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (interestedFeatures !== undefined && (!Array.isArray(interestedFeatures) || interestedFeatures.length > MAX_FEATURES || !interestedFeatures.every((item) => typeof item === "string"))) {
    return Response.json({ error: "That request was not valid." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  if (coDesignOptIn !== undefined && typeof coDesignOptIn !== "boolean") {
    return Response.json({ error: "That request was not valid." }, { status: 400, headers: NO_STORE_HEADERS });
  }
  const wantsCoDesign = coDesignOptIn === true;
  if (wantsCoDesign) {
    if (typeof contactEmail !== "string" || !EMAIL_PATTERN.test(contactEmail.trim()) || contactEmail.length > MAX_EMAIL_CHARACTERS) {
      return Response.json({ error: "Add an email so we can reach you about co-design." }, { status: 400, headers: NO_STORE_HEADERS });
    }
  }

  try {
    const delivery = await sendFeedbackEmail({
      rating,
      area: area.trim().slice(0, 80),
      category: category.trim().slice(0, 60),
      message: message.trim().slice(0, MAX_MESSAGE_CHARACTERS),
      nextWishes: typeof nextWishes === "string" ? nextWishes.trim().slice(0, MAX_WISHES_CHARACTERS) : "",
      interestedFeatures: Array.isArray(interestedFeatures) ? interestedFeatures.map((item) => String(item).slice(0, 40)) : [],
      coDesignOptIn: wantsCoDesign,
      contactEmail: wantsCoDesign && typeof contactEmail === "string" ? contactEmail.trim().slice(0, MAX_EMAIL_CHARACTERS) : "",
      page: typeof page === "string" && page.trim() ? page.trim().slice(0, 200) : "unknown",
    });
    return Response.json({ ok: true, id: delivery.id }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error("Simplifii feedback submission failed", error instanceof Error ? error.message : "Unknown error");
    return Response.json({ error: "That feedback could not be sent. Try again shortly." }, { status: 502, headers: NO_STORE_HEADERS });
  }
}
