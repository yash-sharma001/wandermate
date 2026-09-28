# WanderMates

Social travel platform: activities map, ride-sharing "waves", travel journal, marketplace, packages, group chat and safety tools.
Monorepo, multi-service, fully dockerised.

```
                       ┌───────────────────────────────┐
browser ── :80 ──────> │ gateway (nginx + React build) │
                       └──┬──────────┬────────────┬────┘
                /api/auth │  /api/upload,/uploads  │ /v1/graphql (HTTP + websocket)
                          v          v             v
                        auth      actions       hasura ──> postgres
                          │          │             │  (auth webhook = auth service)
                          └─ redis ──┤             └─ event trigger ─> actions
                                     └─ rabbitmq ──> worker (email, SOS SMS/WhatsApp)
```

| Service | What it does |
| --- | --- |
| `gateway` | nginx: serves the React build, routes `/api/auth`, `/api/upload`, `/uploads`, `/v1/graphql` |
| `hasura` | The data API. Every read/write in the app is GraphQL; permissions are row-level on `X-Hasura-User-Id` |
| `postgres` | Schema, triggers, views and SQL functions in [db/](db/) (loaded on first start) |
| `auth` | Register / login / logout, issues JWTs, and is Hasura's **auth webhook** (`/api/auth/hasura`) |
| `actions` | Hasura actions that need the outside world (email OTP, phone OTP, SOS), file uploads, event-trigger webhook |
| `worker` | RabbitMQ consumer: sends email and SOS SMS/WhatsApp |
| `redis` | JWT revocation list (logout), login/OTP rate limits |
| `rabbitmq` | `mail` and `sos` queues (management UI on http://localhost:15672) |
| `hasura-init` | One-shot: applies [hasura/bootstrap.js](hasura/bootstrap.js) (tracking, relationships, permissions, actions, event trigger) |

## Run

```
cp .env.example .env      # set the secrets
docker compose up --build
```

App: http://localhost (`GATEWAY_PORT` in `.env`). Hasura console: http://localhost:8080 (admin secret from `.env`).
Sample users (from [db/03-seed.sql](db/03-seed.sql)): `sarah@example.com`, `alex@example.com`, `priya@example.com`, `vendor@example.com`. The password is the one the old seed used.

Reset the database: `docker compose down -v`.

## How it fits together

- **JWT auth**: `auth` signs a 7-day JWT with a `jti`. Hasura calls `auth`'s webhook on every request (including websocket subscriptions), which verifies the token and checks Redis for a logout revocation, then returns `X-Hasura-User-Id`. Row access is enforced by Hasura permissions and the `hasura_session` argument of SQL functions.
- **Business rules live in Postgres**: RSVP capacity, ride requests / approvals, bookings and pricing, trust score updates, recommendation promotion. They are SQL functions in [db/02-logic.sql](db/02-logic.sql), exposed as GraphQL mutations/queries.
- **Views** in the same file are flat read models (for example `activity_details`, `wave_requests_detail`); Hasura permissions filter them per viewer.
- **Chat** is a GraphQL subscription on `group_messages`; only the host and confirmed members can open or read a trip chat.
- **Groups and expense splitting**: trip groups have a member list, live chat and Splitwise-style expenses (equal or exact splits, any payer, cash/UPI/card/in-app). Balances, settle-up suggestions and monthly summaries are computed from the `expenses`, `expense_splits` and `settlements` tables ([db/04-groups.sql](db/04-groups.sql)). Views carry a `viewer_id` so only group members can read them. The app records payments and opens the payee's UPI app via a `upi://` link; it does not move money itself.
- **Async work**: `actions` publishes `mail` / `sos` messages to RabbitMQ and `worker` delivers them. A Hasura event trigger on `wave_requests` emails the host when someone asks to join.
- **Design**: the UI follows [design docs/design.pdf](design%20docs/design.pdf). Tokens and shared primitives (cards, buttons, chips, tabs, sheets) live in [frontend/src/theme.css](frontend/src/theme.css); each screen has its own small stylesheet. Phones get a bottom tab bar and a floating SOS button, desktop gets the top nav, and vendors/operators get the indigo sidebar. SOS is press-and-hold (or tap, then tap three times) in [SOSButton.js](frontend/src/components/Safety/SOSButton.js).
- **Frontend data layer**: [frontend/src/utils/api.js](frontend/src/utils/api.js) wraps the GraphQL operations behind the same `activitiesAPI`, `wavesAPI`, ... functions the components already used.

## Layout

```
db/            Postgres init: schema, logic (views/functions/triggers), seed
hasura/        bootstrap.js -> Hasura metadata
packages/common  shared: pg pool, redis, rabbitmq helpers, JWT verification
services/auth, actions, worker
gateway/       nginx config + image that builds the frontend
frontend/      React app
```
