# WanderMates

Social travel platform: activities map, ride-sharing "waves", travel journal, marketplace, packages, group chat and safety tools.
A Node modular monolith plus a separate Python AI service, fully dockerised.

```
                       ┌───────────────────────────────┐
browser ── :80 ──────> │ gateway (nginx + React build) │
                       └──────────┬────────────┬───────┘
                            /api/*│            │ /v1/graphql (HTTP + websocket)
                                  v            v
                        api (Node monolith)   hasura ──> postgres (+ pgvector)
                          │  │  │   ^            │
              sync HTTP ──┘  │  │   └─ auth webhook, actions, event triggers
                   ai (Python)  │
                                ├─ redis (sessions, rate limits)
                                └─ rabbitmq ──> worker (email, SOS SMS/WhatsApp)
```

| Service | What it does |
| --- | --- |
| `gateway` | nginx: serves the React build, routes `/api/*`, `/uploads`, `/v1/graphql` |
| `api` | The Node modular monolith ([services/api/](services/api/)): auth, verification, safety, groups, uploads, notifications, ai. Also Hasura's auth webhook, actions and event triggers |
| `worker` | Same image and codebase as `api`, run as `node worker.js`: consumes the `mail` and `sos` queues |
| `ai` | Python (FastAPI) AI layer ([services/ai/](services/ai/)). Itinerary planner: retrieves matching activities and trips from pgvector embeddings (kept current by Hasura event triggers) and lays them out over the days; no language model yet |
| `hasura` | The data API. Every read/write in the app is GraphQL; permissions are row-level on `X-Hasura-User-Id` |
| `postgres` | Schema, triggers, views and SQL functions in [db/](db/) (loaded on first start); image built from [db/Dockerfile](db/Dockerfile) with pgvector + PostGIS |
| `redis` | JWT revocation list, refresh tokens, rate limits |
| `rabbitmq` | The event bus: `mail` and `sos` queues (management UI on http://localhost:15672) |
| `hasura-init` | One-shot: applies [hasura/bootstrap.js](hasura/bootstrap.js) (tracking, relationships, permissions, actions, event trigger) |

Modules live in `services/api/modules/<name>/` and don't import each other; shared helpers are in `services/api/lib/` and `packages/common/`. Hasura action handlers are collected in [server.js](services/api/server.js), REST routers are mounted there.

## Run

```
./setup.sh    # once: checks Docker, creates .env with random secrets, builds the images
./run.sh      # start and wait until the app is ready (also: down | restart | status | logs [service] | upgrade-db | reset)
```

By hand instead: `cp .env.example .env`, set the secrets, `docker compose up --build`.

App: http://localhost (`GATEWAY_PORT` in `.env`). Hasura console: http://localhost:8080 (admin secret from `.env`).
Sample users (from [db/03-seed.sql](db/03-seed.sql)): `sarah@example.com`, `alex@example.com`, `priya@example.com`, `vendor@example.com`. The password is the one the old seed used.

Reset the database: `docker compose down -v`.

**Upgrading an existing database** (created before the pgvector/PostGIS image; the base image also changed from Alpine to Debian): init scripts only run on an empty volume, so run `./run.sh upgrade-db` (backs up, then applies the scripts below), or by hand run [scripts/upgrade-existing-db.sql](scripts/upgrade-existing-db.sql) once. It enables both extensions, swaps the distance function to PostGIS and reindexes. Back up first (`pg_dump`); the commands are at the top of that file. Then run [db/05-geo-index.sql](db/05-geo-index.sql) and [db/06-embeddings.sql](db/06-embeddings.sql) the same way (both are idempotent; the AI service fills in embeddings for existing rows when it next starts). Fresh volumes run all of these automatically.

## How it fits together

- **Auth**: `api` signs a 15-minute access JWT (kept in memory by the frontend) and sets a single-use, rotating refresh token in an httpOnly cookie. Hasura calls `api`'s webhook on every request (including websocket subscriptions), which verifies the token and checks Redis for a logout revocation, then returns `X-Hasura-User-Id`. Row access is enforced by Hasura permissions and the `hasura_session` argument of SQL functions. Password reset and signup email verification use the mail queue.
- **Business rules live in Postgres**: RSVP capacity, ride requests / approvals, bookings and pricing, trust score updates, recommendation promotion. They are SQL functions in [db/02-logic.sql](db/02-logic.sql), exposed as GraphQL mutations/queries.
- **Views** in the same file are flat read models (for example `activity_details`, `wave_requests_detail`); Hasura permissions filter them per viewer.
- **Chat** is a GraphQL subscription on `group_messages`; only the host and confirmed members can open or read a trip chat.
- **Groups and expense splitting**: trip groups have a member list, live chat and Splitwise-style expenses (equal or exact splits, any payer, cash/UPI/card/in-app). Balances, settle-up suggestions and monthly summaries are computed from the `expenses`, `expense_splits` and `settlements` tables ([db/04-groups.sql](db/04-groups.sql)). Views carry a `viewer_id` so only group members can read them. The app records payments and opens the payee's UPI app via a `upi://` link; it does not move money itself.
- **Sync vs async AI**: things the user waits on (itinerary) are a synchronous call `api` -> `ai` (`POST /api/ai/itinerary`, rate-limited, 30s timeout). Embeddings are refreshed in the background by Hasura event triggers calling `ai`. Background work goes over RabbitMQ so a slow consumer never blocks a request; today that is mail and SOS, and moderation/recommendations should join it. A Hasura event trigger on `wave_requests` emails the host when someone asks to join.
- **Design**: the UI follows [design docs/design.pdf](design%20docs/design.pdf). Tokens and shared primitives (cards, buttons, chips, tabs, sheets) live in [frontend/src/theme.css](frontend/src/theme.css); each screen has its own small stylesheet. Phones get a bottom tab bar and a floating SOS button, desktop gets the top nav, and vendors/operators get the indigo sidebar. SOS is press-and-hold (or tap, then tap three times) in [SOSButton.js](frontend/src/components/Safety/SOSButton.js).
- **Frontend data layer**: [frontend/src/utils/api.js](frontend/src/utils/api.js) wraps the GraphQL operations behind the same `activitiesAPI`, `wavesAPI`, ... functions the components already used.

## Layout

```
db/            Postgres init: schema, logic (views/functions/triggers), seed
hasura/        bootstrap.js -> Hasura metadata
packages/common  shared: pg pool, redis, rabbitmq helpers, JWT verification
services/api   Node modular monolith (modules/, lib/, server.js, worker.js)
services/ai    Python AI service (FastAPI)
gateway/       nginx config + image that builds the frontend
frontend/      React app
```
