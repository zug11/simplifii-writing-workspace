const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_TO_EMAIL = "aaron@simplifii.com.au";
const EMAIL_REQUEST_TIMEOUT_MS = 8000;

export type FeedbackInput = {
  rating: number;
  area: string;
  category: string;
  message: string;
  nextWishes: string;
  interestedFeatures: string[];
  coDesignOptIn: boolean;
  contactEmail: string;
  page: string;
};

function configuration() {
  const apiKey = process.env.RESEND_API_KEY?.trim() ?? "";
  const fromEmail = process.env.FEEDBACK_FROM_EMAIL?.trim() ?? "";
  if (!apiKey || !fromEmail) return null;
  return {
    apiKey,
    fromEmail,
    toEmail: process.env.FEEDBACK_TO_EMAIL?.trim() || DEFAULT_TO_EMAIL,
  };
}

export function emailFeedbackConfigured() {
  return configuration() !== null;
}

function feedbackLines(feedback: FeedbackInput) {
  return [
    feedback.message,
    "",
    `Rating: ${feedback.rating}/5`,
    `Area: ${feedback.area}`,
    `Category: ${feedback.category}`,
    feedback.nextWishes ? `Wants to see next: ${feedback.nextWishes}` : "",
    feedback.interestedFeatures.length ? `Interested in: ${feedback.interestedFeatures.join(", ")}` : "",
    feedback.coDesignOptIn ? `Wants to join the co-design team${feedback.contactEmail ? ` (${feedback.contactEmail})` : ""}` : "",
    `Page: ${feedback.page}`,
    `Received: ${new Date().toISOString()}`,
  ].filter((line) => line.length > 0);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export async function sendFeedbackEmail(feedback: FeedbackInput): Promise<{ id: string }> {
  const configured = configuration();
  if (!configured) throw new Error("EMAIL_NOT_CONFIGURED");

  const lines = feedbackLines(feedback);
  const response = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${configured.apiKey}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    signal: AbortSignal.timeout(EMAIL_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      from: configured.fromEmail,
      to: [configured.toEmail],
      subject: `Tester feedback · ${feedback.area} · ${feedback.rating}/5`,
      text: lines.join("\n"),
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5">${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("")}</div>`,
      ...(feedback.coDesignOptIn && feedback.contactEmail ? { reply_to: feedback.contactEmail } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`EMAIL_REQUEST_FAILED:${response.status}:${body.slice(0, 300)}`);
  }

  const body = (await response.json()) as { id?: string };
  if (!body.id) throw new Error("EMAIL_RESPONSE_MISSING_ID");
  return { id: body.id };
}
