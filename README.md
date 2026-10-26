# Take-Home Exercise: Workflow Automation

Full-stack starter for the workflow automation take-home exercise.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Angular 19, TypeScript |
| Backend | Node.js, Express, TypeScript |
| Database | MongoDB (Atlas), Mongoose |
| Package manager | pnpm |
| Tooling | ESLint, Husky (pre-commit) |

## Project Structure

```
workflow-automation/
├── client/                 # Angular frontend (login + welcome)
├── server/
│   └── src/
│       ├── app.ts          # Express app (middleware + routes)
│       ├── server.ts       # Bootstrap (env, DB, listen)
│       ├── config/         # Env + Mongoose helpers
│       ├── models/         # Mongoose models (User, Zap)
│       ├── routes/         # API route modules (health, auth, zaps)
│       └── services/       # GitHub OAuth helpers
├── .env                    # Secrets (not committed; see .env.example)
├── .env.example            # Template for required env vars
├── package.json            # pnpm workspace root
└── pnpm-workspace.yaml
```

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 8+ (`npm install -g pnpm`)
- Access to the MongoDB Atlas cluster (credentials in `.env`)

## Installation

1. **Clone the repository** and enter the project folder:

   ```bash
   cd workflow-automation
   ```

2. **Create `.env`** at the project root (copy from `.env.example`):

   ```bash
   cp .env.example .env
   ```

   Required variables:

   ```env
   PORT=3000
   MONGODB_URI="mongodb+srv://..."
   CLIENT_ORIGIN="http://localhost:4200"
   GITHUB_CLIENT_ID=
   GITHUB_CLIENT_SECRET=
   GITHUB_CALLBACK_URL="http://localhost:4200/api/auth/github/callback"
   SESSION_SECRET="change-me-to-a-long-random-string"
   TOKEN_ENCRYPTION_KEY="change-me-to-a-long-random-string"
   ```

   `CLIENT_ORIGIN` is the Angular dev-server origin allowed by CORS. Production serves the built client from the same Express origin, so the browser does not need a separate CORS origin there.

   Do not set `NODE_ENV` in `.env`. Leave it to the start scripts: `pnpm dev` / `pnpm dev:server` stay in development (API only; use the Angular dev server on port 4200), and `pnpm start:server` sets `NODE_ENV=production` so Express serves the built client. Putting `NODE_ENV=production` in `.env` would also serve the client build during local API-only runs.

3. **Register a GitHub OAuth App** ([docs](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)):

   - Homepage URL: `http://localhost:4200`
   - Authorization callback URL: `http://localhost:4200/api/auth/github/callback` (must match `GITHUB_CALLBACK_URL`; proxied to Express in local dev)
   - Copy the Client ID and Client Secret into `.env`

   The app requests `read:user` and `repo` scopes ([scopes](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps)) so login works and the Zap editor can list the user’s repositories. Existing users who signed in before `repo` was added should log out and sign in again to grant it.

   In production, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, and `GITHUB_CALLBACK_URL` are required. Secrets must be random and at least 32 characters (no example placeholders). `SESSION_SECRET` signs cookies; `TOKEN_ENCRYPTION_KEY` encrypts GitHub access tokens at rest — keep them distinct so either can be rotated alone.

4. **Install dependencies** for the whole workspace:

   ```bash
   pnpm install
   ```

## Running the App

Start the API and the Angular app together:

```bash
pnpm dev
```

Or run them separately:

```bash
# Terminal 1 — Express API (http://localhost:3000)
pnpm dev:server

# Terminal 2 — Angular (http://localhost:4200)
pnpm dev:client
```

Open [http://localhost:4200](http://localhost:4200). The login page offers **Login with GitHub**. After authorizing, you land on `/welcome` with your GitHub name. The Angular dev server proxies `/api` to the Express API.

## GitHub OAuth flow

Per the [web application flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps):

1. Browser visits `GET /api/auth/github` → redirect to GitHub authorize (`read:user repo`)
2. GitHub redirects to `GET /api/auth/github/callback` with a temporary `code`
3. Server exchanges the code for an access token, loads `/user`, upserts the `User` document (access token encrypted at rest), sets a signed session cookie, then redirects to `/welcome`

Login failures redirect to `/login?error=<code>` with a stable code (`oauth_not_configured`, `missing_code`, `invalid_state`, `access_denied`, `login_failed`) — never GitHub’s free-text `error_description`.

## Local webhook testing (`gh webhook forward`)

GitHub rejects webhook URLs on `localhost`. In development, when `PUBLIC_BASE_URL` is localhost, the server uses **`WEBHOOK_DELIVERY=forward`**: it does **not** register a GitHub webhook via the API, and signature verification is skipped (so `forward` is only allowed with a localhost `PUBLIC_BASE_URL`). Forward events with the [GitHub CLI](https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/using-the-github-cli-to-forward-webhooks-for-testing):

```bash
gh extension install cli/gh-webhook
gh auth login   # required — webhook forward needs a github.com token
gh auth status  # confirm you're logged in

# After turning a Zap on, use the Zap id (also logged by the server / returned as webhookForwardCommand):
gh webhook forward --repo=OWNER/REPO --events=pull_request --url=http://localhost:3000/api/webhooks/github/ZAP_ID
```

Leave that command running, then open a pull request on the trigger repo. For production (or a tunnel), set a public `PUBLIC_BASE_URL` and `WEBHOOK_DELIVERY=github` so the API registers real webhooks.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Returns MongoDB connection state (`200` when connected, `503` otherwise) |
| `GET` | `/api/auth/github` | Starts GitHub OAuth (redirect) |
| `GET` | `/api/auth/github/callback` | OAuth callback; saves user and redirects to `/welcome` |
| `GET` | `/api/auth/me` | Current session user (`name`, `login`) or `401` |
| `POST` | `/api/auth/logout` | Clears the session cookie |
| `GET` | `/api/github/repos` | List GitHub repositories for the current user |
| `GET` | `/api/zaps` | List Zaps for the current user |
| `GET` | `/api/zaps/:id` | Get one Zap |
| `POST` | `/api/zaps` | Create a Zap |
| `PUT` | `/api/zaps/:id` | Update a Zap |
| `DELETE` | `/api/zaps/:id` | Delete a Zap |
| `POST` | `/api/webhooks/github/:zapId` | GitHub webhook receiver (no session auth) |

Example health response (connected):

```json
{
  "mongo": "connected",
  "message": "MongoDB connection is established"
}
```

## Lint, Typecheck & Test

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Husky runs lint and typecheck on every commit via `.husky/pre-commit`. After cloning, `pnpm install` installs the hook through the root `prepare` script.

## Production Build

Build the API and Angular app, then serve both from Express (API + static client on the same origin). `pnpm start:server` sets `NODE_ENV=production`, which enables static client serving:

```bash
pnpm build
pnpm start:server
```

Open [http://localhost:3000](http://localhost:3000). `/api` is handled by Express; navigation routes serve the Angular build from `client/dist/client/browser`. Missing static assets (JS/CSS/images) return `404` instead of `index.html`. Dev (`pnpm dev` / `pnpm dev:server`) does not serve the client build — use the Angular dev server on port 4200.
