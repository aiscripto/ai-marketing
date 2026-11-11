# AIScripto AI Marketing Suite — Web Application

This folder contains the React app, authenticated API, PostgreSQL schema, Redis job queue, and isolated Python worker. The implementation keeps the original 14 marketing workflows, five agent definitions, four Python utilities, and six templates in the repository root. See [`IMPLEMENTATION.md`](IMPLEMENTATION.md) for the feature inventory and verification record.

## Requirements

- Docker Desktop or Docker Engine with Compose v2
- Node.js 22 for running or building the app outside Docker
- Python 3.11 or newer for the original scripts and Python tests
- OpenAI or Anthropic API credentials for generated content and AI analysis

## Local development

From the repository root:

```sh
cp web-app/.env.example web-app/.env
```

Replace the local placeholder values with separate random values. Generate each secret with `openssl rand -hex 32`; use the output for `JWT_SECRET`, `ENCRYPTION_KEY`, and `WORKER_API_KEY`. Keep `ENCRYPTION_KEY` fixed after saving workspace AI keys, because changing it makes existing encrypted keys unreadable.

Start the app:

```sh
cd web-app
docker compose up --build
```

Open `http://localhost:5173`. PostgreSQL and Redis persist in named Docker volumes. The development backend runs `prisma db push` at startup. Configure an OpenAI or Anthropic key in **Settings → Integrations** before starting an AI workflow. Without a provider key, the app still supports registration, workspace/project management, execution history, and existing reports; generation actions return a configuration error instead of sample results. Set SMTP credentials to enable password recovery and email invitations; without SMTP, the invitation flow returns a one-time link for an administrator to share.

Useful commands:

```sh
npm --prefix web-app/backend test
npm --prefix web-app/frontend run build
python3 -m unittest discover -s scripts/tests -v
```

The backend test command builds TypeScript and checks audit scoring and workflow registration. The Python tests cover public URL validation and redirect SSRF protection.

## Environment variables

The full local configuration template is [`web-app/.env.example`](.env.example).

| Variable | Required | Purpose |
|---|---:|---|
| `POSTGRES_PASSWORD` | Yes | Local/production PostgreSQL password |
| `DATABASE_URL` | Local API use | PostgreSQL connection string; Compose supplies an internal production URL |
| `REDIS_URL` | Yes | BullMQ queue connection; Compose supplies an internal URL |
| `JWT_SECRET` | Yes | Signs access tokens; use a random value of at least 32 characters |
| `ENCRYPTION_KEY` | Yes | AES-256-GCM key for workspace AI credentials; keep stable and back it up securely |
| `WORKER_API_KEY` | Yes | Authenticates internal backend-to-Python-worker calls |
| `FRONTEND_URL` | Yes | Allowed browser origin(s); comma-separated in the API |
| `PUBLIC_APP_URL` | Yes for email links | One public origin used in invitation and password-reset links |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | Optional | Server-level provider fallback; workspace keys can be saved in Integrations |
| `DEFAULT_AI_PROVIDER`, `DEFAULT_MODEL` | Optional | Server-level AI provider and model defaults |
| `SMTP_URL`, `SMTP_FROM` | Optional | Password-reset and invitation email delivery |
| `TRUST_PROXY` | Production only | Set `true` when a trusted reverse proxy terminates TLS and forwards client IPs |

Provider keys saved in the workspace are encrypted at rest and never returned to the browser. Rotating `ENCRYPTION_KEY` requires re-encrypting stored keys before restart. OAuth credentials for Google, social publishers, CRMs, and SEO data vendors are not supplied; those connectors are shown as unavailable and their data is not simulated.

## Production Compose

1. Copy `.env.example` to `.env` and replace every placeholder with a managed secret. Set `FRONTEND_URL` and `PUBLIC_APP_URL` to the HTTPS app origin. Configure SMTP and at least one AI provider as needed.
2. Put a TLS reverse proxy or load balancer in front of port `8080`. Keep PostgreSQL, Redis, API, and Python worker on the private Compose network.
3. Back up the PostgreSQL volume and the `ENCRYPTION_KEY` before upgrades.
4. Build and start the production stack:

   ```sh
   docker compose -f docker-compose.production.yml up --build -d
   ```

   The API container runs checked-in Prisma migrations before starting. `/health` reports API readiness. Deploy the `web-app/frontend/dist` output to a static host by setting `VITE_API_URL` to the public API base if the frontend and API use different origins.

5. Back up and restore data with PostgreSQL tools. Example backup:

   ```sh
   docker compose -f docker-compose.production.yml exec -T postgres pg_dump -U postgres ai_marketing > ai-marketing-$(date +%F).sql
   ```

Send container stdout/stderr to the hosting platform's log service and configure its alerting there. The application emits request, queue, worker, and failure logs without recording provider API keys.

## Honest connector scope

OpenAI and Anthropic API keys can be tested and saved per workspace. Website crawling, explicit competitor scanning, PDF extraction, social-calendar preparation, Markdown/JSON/CSV exports, and PDF reports use the bundled code. Google Analytics/Search Console, Google Ads, Meta, LinkedIn, WordPress, Mailchimp, HubSpot, Semrush, and Ahrefs require OAuth/API implementations and credentials that are not present; the UI reports them as unavailable. Ads remain editable drafts, and calendar status means an internal plan rather than a published post.
