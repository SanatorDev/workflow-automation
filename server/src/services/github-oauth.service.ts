import { env } from '../config/env';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const GITHUB_REPOS_URL = 'https://api.github.com/user/repos';
/** `repo` is required to list the authenticated user's repositories. */
const OAUTH_SCOPES = 'read:user repo';

export type GitHubUser = {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
};

export type GitHubRepo = {
  id: number;
  full_name: string;
  private: boolean;
};

type TokenResponse = {
  access_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export function buildGitHubAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.githubClientId,
    redirect_uri: env.githubCallbackUrl,
    scope: OAUTH_SCOPES,
    state,
  });

  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForAccessToken(code: string): Promise<string> {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: env.githubClientId,
      client_secret: env.githubClientSecret,
      code,
      redirect_uri: env.githubCallbackUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub token exchange failed with status ${response.status}`);
  }

  const data = (await response.json()) as TokenResponse;

  if (!data.access_token) {
    throw new Error(
      data.error_description || data.error || 'GitHub did not return an access token'
    );
  }

  return data.access_token;
}

function githubApiHeaders(accessToken: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'workflow-automation',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch(GITHUB_USER_URL, {
    headers: githubApiHeaders(accessToken),
  });

  if (!response.ok) {
    throw new Error(`GitHub user fetch failed with status ${response.status}`);
  }

  const data = (await response.json()) as GitHubUser;

  if (typeof data.id !== 'number' || typeof data.login !== 'string') {
    throw new Error('GitHub user response was missing required fields');
  }

  return data;
}

/**
 * List repositories for the authenticated user (paginated).
 * @see https://docs.github.com/en/rest/repos/repos#list-repositories-for-the-authenticated-user
 */
/** Cap pages so a huge account (or stuck API) cannot hang the request. */
const GITHUB_REPOS_MAX_PAGES = 10;

export async function fetchGitHubRepos(
  accessToken: string
): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  let page = 1;
  const perPage = 100;

  while (page <= GITHUB_REPOS_MAX_PAGES) {
    const url = new URL(GITHUB_REPOS_URL);
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort', 'full_name');
    url.searchParams.set('affiliation', 'owner,collaborator,organization_member');

    const response = await fetch(url, {
      headers: githubApiHeaders(accessToken),
    });

    if (!response.ok) {
      throw new Error(
        `GitHub repos fetch failed with status ${response.status}`
      );
    }

    const batch = (await response.json()) as GitHubRepo[];
    if (!Array.isArray(batch)) {
      throw new Error('GitHub repos response was not an array');
    }

    for (const repo of batch) {
      if (
        typeof repo.id === 'number' &&
        typeof repo.full_name === 'string' &&
        repo.full_name.trim()
      ) {
        repos.push({
          id: repo.id,
          full_name: repo.full_name,
          private: Boolean(repo.private),
        });
      }
    }

    if (batch.length < perPage) {
      break;
    }
    page += 1;
  }

  return repos;
}
