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
├── client/                 # Angular frontend
├── server/
│   └── src/
│       ├── app.ts          # Express app (middleware + routes)
│       ├── server.ts       # Bootstrap (env, DB, listen)
│       ├── config/         # Env + Mongoose helpers
│       └── routes/         # API route modules
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
   ```

   `CLIENT_ORIGIN` is the Angular dev-server origin allowed by CORS. Production serves the built client from the same Express origin, so the browser does not need a separate CORS origin there.

   Do not set `NODE_ENV` in `.env`. Leave it to the start scripts: `pnpm dev` / `pnpm dev:server` stay in development (API only; use the Angular dev server on port 4200), and `pnpm start:server` sets `NODE_ENV=production` so Express serves the built client. Putting `NODE_ENV=production` in `.env` would also serve the client build during local API-only runs.

3. **Install dependencies** for the whole workspace:

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

Open [http://localhost:4200](http://localhost:4200). The home page shows the exercise title and the current MongoDB connection status from `GET /api/health`. The Angular dev server proxies `/api` to the Express API.

## API

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Returns MongoDB connection state (`200` when connected, `503` otherwise) |

Example response (connected):

```json
{
  "mongo": "connected",
  "message": "MongoDB connection is established"
}
```

## Lint & Typecheck

```bash
pnpm lint
pnpm typecheck
```

Husky runs both on every commit via `.husky/pre-commit`. After cloning, `pnpm install` installs the hook through the root `prepare` script.

## Production Build

Build the API and Angular app, then serve both from Express (API + static client on the same origin). `pnpm start:server` sets `NODE_ENV=production`, which enables static client serving:

```bash
pnpm build
pnpm start:server
```

Open [http://localhost:3000](http://localhost:3000). `/api` is handled by Express; navigation routes serve the Angular build from `client/dist/client/browser`. Missing static assets (JS/CSS/images) return `404` instead of `index.html`. Dev (`pnpm dev` / `pnpm dev:server`) does not serve the client build — use the Angular dev server on port 4200.
