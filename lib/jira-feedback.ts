const DEFAULT_BASE_URL = "https://simplifiiy.atlassian.net";
const DEFAULT_PROJECT_KEY = "SCRUM";
const DEFAULT_ISSUE_TYPE = "Task";
// aaron@simplifii.com.au is not a registered Atlassian user on this site (checked via
// user search, zero matches), so it can never resolve to an assignee. The verified
// account on simplifiiy.atlassian.net is a.saint-james@unsw.edu.au. Override with
// JIRA_NOTIFY_EMAIL once aaron@simplifii.com.au is added as a user, if preferred.
const DEFAULT_NOTIFY_EMAIL = "a.saint-james@unsw.edu.au";
const JIRA_REQUEST_TIMEOUT_MS = 8000;

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
  const email = process.env.JIRA_EMAIL?.trim() ?? "";
  const apiToken = process.env.JIRA_API_TOKEN?.trim() ?? "";
  if (!email || !apiToken) return null;
  return {
    email,
    apiToken,
    baseUrl: (process.env.JIRA_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    projectKey: process.env.JIRA_PROJECT_KEY?.trim() || DEFAULT_PROJECT_KEY,
    issueType: process.env.JIRA_ISSUE_TYPE?.trim() || DEFAULT_ISSUE_TYPE,
    notifyEmail: process.env.JIRA_NOTIFY_EMAIL?.trim() || DEFAULT_NOTIFY_EMAIL,
  };
}

export function jiraFeedbackConfigured() {
  return configuration() !== null;
}

function basicAuthHeader(email: string, apiToken: string) {
  return `Basic ${btoa(`${email}:${apiToken}`)}`;
}

async function resolveAssigneeAccountId(baseUrl: string, email: string, authHeader: string): Promise<string | null> {
  try {
    const response = await fetch(`${baseUrl}/rest/api/3/user/search?query=${encodeURIComponent(email)}`, {
      headers: { authorization: authHeader, accept: "application/json" },
      signal: AbortSignal.timeout(JIRA_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const users = (await response.json()) as Array<{ accountId?: string; emailAddress?: string }>;
    const exact = users.find((user) => user.emailAddress?.toLowerCase() === email.toLowerCase());
    return exact?.accountId ?? users[0]?.accountId ?? null;
  } catch {
    return null;
  }
}

export async function createFeedbackIssue(feedback: FeedbackInput): Promise<{ key: string }> {
  const configured = configuration();
  if (!configured) throw new Error("JIRA_NOT_CONFIGURED");

  const authHeader = basicAuthHeader(configured.email, configured.apiToken);
  const summary = `Tester feedback · ${feedback.area} · ${feedback.rating}/5`;
  const descriptionLines = [
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
  ];

  const labels = ["tester-feedback"];
  if (feedback.coDesignOptIn) labels.push("co-design-interest");

  const assigneeAccountId = await resolveAssigneeAccountId(configured.baseUrl, configured.notifyEmail, authHeader);

  const response = await fetch(`${configured.baseUrl}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      authorization: authHeader,
      "content-type": "application/json",
      accept: "application/json",
    },
    signal: AbortSignal.timeout(JIRA_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({
      fields: {
        project: { key: configured.projectKey },
        issuetype: { name: configured.issueType },
        summary,
        labels,
        ...(assigneeAccountId ? { assignee: { accountId: assigneeAccountId } } : {}),
        description: {
          type: "doc",
          version: 1,
          content: descriptionLines
            .filter((line) => line.length > 0)
            .map((line) => ({ type: "paragraph", content: [{ type: "text", text: line }] })),
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`JIRA_REQUEST_FAILED:${response.status}:${body.slice(0, 300)}`);
  }

  return (await response.json()) as { key: string };
}
