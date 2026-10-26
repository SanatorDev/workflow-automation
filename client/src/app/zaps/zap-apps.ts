/** Developer tools available in trigger/action app dropdowns. */
export const DEVELOPER_APPS = [
  'GitHub',
  'GitLab',
  'Bitbucket',
  'Jira',
  'Linear',
  'Slack',
  'Notion',
  'Sentry',
  'CircleCI',
  'Docker Hub',
] as const;

export type DeveloperApp = (typeof DEVELOPER_APPS)[number];

/** Trigger events by app. Only GitHub is wired for now. */
export const TRIGGER_EVENTS_BY_APP: Record<string, readonly string[]> = {
  GitHub: ['New Pull Request'],
};

/** Action events by app. Only GitHub is wired for now. */
export const ACTION_EVENTS_BY_APP: Record<string, readonly string[]> = {
  GitHub: ['Create Comment'],
};

export function eventsForApp(
  catalog: Record<string, readonly string[]>,
  app: string
): string[] {
  return [...(catalog[app] ?? [])];
}

/** True when the app has at least one event in both trigger and action catalogs. */
export function appIsWired(app: string): boolean {
  return (
    eventsForApp(TRIGGER_EVENTS_BY_APP, app).length > 0 &&
    eventsForApp(ACTION_EVENTS_BY_APP, app).length > 0
  );
}

const GITHUB_APP = 'GitHub';

/** Case-insensitive match for the GitHub app label. */
export function isGitHubApp(app: string): boolean {
  return app.trim().toLowerCase() === GITHUB_APP.toLowerCase();
}

/**
 * Trigger output fields that can be mapped into the action Body.
 * Tokens are inserted as `{{token}}` and resolved at run time from the trigger.
 */
export const BODY_FIELD_MAPPINGS = [
  { label: 'Author', token: 'author' },
  { label: 'Head branch', token: 'headBranch' },
  { label: 'Base branch', token: 'baseBranch' },
  { label: 'Number', token: 'number' },
] as const;

export function bodyFieldToken(token: string): string {
  return `{{${token}}}`;
}

/** Known body tokens that appear in a message (order preserved, unique). */
export function bodyTokensInMessage(body: string): string[] {
  const known = new Set(
    BODY_FIELD_MAPPINGS.map((mapping) => mapping.token as string)
  );
  const found: string[] = [];
  const seen = new Set<string>();

  for (const match of body.matchAll(/\{\{([a-zA-Z0-9_]+)\}\}/g)) {
    const token = match[1];
    if (!known.has(token) || seen.has(token)) {
      continue;
    }
    seen.add(token);
    found.push(token);
  }

  return found;
}
