/** Low-level GitHub REST helpers used by Zap webhooks and runners. */

const GITHUB_API = 'https://api.github.com';

export type CreateWebhookResult = {
  id: number;
};

function githubApiHeaders(accessToken: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'workflow-automation',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export function parseOwnerRepo(
  fullName: string
): { owner: string; repo: string } | null {
  const parts = fullName.trim().split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return null;
  }
  return { owner: parts[0], repo: parts[1] };
}

/**
 * Create a repository webhook.
 * @see https://docs.github.com/en/rest/repos/webhooks#create-a-repository-webhook
 */
export async function createRepoWebhook(
  accessToken: string,
  owner: string,
  repo: string,
  options: { url: string; secret: string; events: string[] }
): Promise<CreateWebhookResult> {
  const response = await fetch(
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks`,
    {
      method: 'POST',
      headers: {
        ...githubApiHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'web',
        active: true,
        events: options.events,
        config: {
          url: options.url,
          content_type: 'json',
          secret: options.secret,
          insecure_ssl: '0',
        },
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `GitHub create webhook failed with status ${response.status}${
        detail ? `: ${detail}` : ''
      }`
    );
  }

  const data = (await response.json()) as { id?: number };
  if (typeof data.id !== 'number') {
    throw new Error('GitHub create webhook response was missing id');
  }

  return { id: data.id };
}

/**
 * Delete a repository webhook.
 * @see https://docs.github.com/en/rest/repos/webhooks#delete-a-repository-webhook
 */
export async function deleteRepoWebhook(
  accessToken: string,
  owner: string,
  repo: string,
  hookId: number
): Promise<void> {
  const response = await fetch(
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/hooks/${hookId}`,
    {
      method: 'DELETE',
      headers: githubApiHeaders(accessToken),
    }
  );

  // 404: already gone — treat as success so turn-off stays idempotent.
  if (response.ok || response.status === 204 || response.status === 404) {
    return;
  }

  const detail = await response.text().catch(() => '');
  throw new Error(
    `GitHub delete webhook failed with status ${response.status}${
      detail ? `: ${detail}` : ''
    }`
  );
}

/**
 * Create a comment on a pull request (issues comments API).
 * @see https://docs.github.com/en/rest/issues/comments#create-an-issue-comment
 */
export async function createIssueComment(
  accessToken: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
): Promise<void> {
  const response = await fetch(
    `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${issueNumber}/comments`,
    {
      method: 'POST',
      headers: {
        ...githubApiHeaders(accessToken),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ body }),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `GitHub create comment failed with status ${response.status}${
        detail ? `: ${detail}` : ''
      }`
    );
  }
}
