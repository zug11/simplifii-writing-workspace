const DEFAULT_BASE_URL = "https://simplifiiy.atlassian.net";
const DEFAULT_PROJECT_KEY = "SCRUM";
const DEFAULT_ISSUE_TYPE = "Task";

export type FeedbackInput = {
  rating: number;
  category: string;
  message: string;
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
  };
}

export function jiraFeedbackConfigured() {
  return configuration() !== null;
}

function basicAuthHeader(email: string, apiToken: string) {
  return `Basic ${btoa(`${email}:${apiToken}`)}`;
}

export async function createFeedbackIssue(feedback: FeedbackInput): Promise<{ key: string }> {
  const configured = configuration();
  if (!configured) throw new Error("JIRA_NOT_CONFIGURED");

  const summary = `Tester feedback · ${feedback.rating}/5 · ${feedback.category}`;
  const descriptionLines = [
    feedback.message,
    "",
    `Rating: ${feedback.rating}/5`,
    `Category: ${feedback.category}`,
    `Page: ${feedback.page}`,
    `Received: ${new Date().toISOString()}`,
  ];

  const response = await fetch(`${configured.baseUrl}/rest/api/3/issue`, {
    method: "POST",
    headers: {
      authorization: basicAuthHeader(configured.email, configured.apiToken),
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      fields: {
        project: { key: configured.projectKey },
        issuetype: { name: configured.issueType },
        summary,
        labels: ["tester-feedback"],
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
