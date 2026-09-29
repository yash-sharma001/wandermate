# WanderMates: folder map and what happens where

## 1. Folder map

```
wandermate/
├── docker-compose.yml        Wires every container together (see section 2)
├── Dockerfile                One Dockerfile for the Node services: --build-arg SERVICE=api
├── .env / .env.example       Secrets and switches (JWT_SECRET, APP_URL, COOKIE_SECURE, CORS_ORIGIN, mail, Twilio)
├── package.json              npm workspaces: packages/*, services/*
├── README.md                 Overview + how to run
│
├── frontend/                 React app (built into the gateway image)
│   ├── public/index.html
│   └── src/
│       ├── App.js            Routes, session restore on load, login/logout handlers
│       ├── theme.css         Design tokens, Anthropic font stacks, shared primitives
│       ├── utils/
│       │   ├── api.js        THE data layer: axios (REST) + GraphQL fetch + websocket + token refresh
│       │   └── activityTypes.js, categoryIcons.js, moods.js, money.js   small lookups
│       └── components/       One folder per screen area, each with its own small stylesheet
│           ├── Auth/         Landing, Login, Register, Recover (forgot + reset password)
│           ├── Map/          MapView: live activity map (home screen)
│           ├── Activities/   ActivityDetails, CreateActivity
│           ├── Waves/        Ride sharing: WaveDashboard, HostWaveForm, MyWaves
│           ├── Groups/       Trip groups + expense splitting: Groups, GroupDetail, JoinGroup
│           ├── Chat/         GroupChat (GraphQL subscription = live)
│           ├── Journal/      Private pins: TravelJournal, CreatePinModal
│           ├── Itinerary/    AI trip planner (reached from a card on the Trips screen)
│           ├── Marketplace/  Local experiences (traveler view)
│           ├── Packages/     Multi-day trips (traveler view)
│           ├── Vendor/       VendorDashboard (marketplace sellers)
│           ├── Provider/     ProviderDashboard (trip operators)
│           ├── Profile/      Profile, SafetyPanel (Aadhaar, email/phone verification, contacts)
│           ├── Safety/       SOSButton, ReportModal, ReviewModal
│           └── Layout/       Navbar (top nav, mobile tab bar, vendor sidebar)
│
├── gateway/                  nginx: the only public entry point
│   ├── Dockerfile            Builds the React app, serves it
│   └── nginx.conf            /api/* and /uploads/ -> api,  /v1/graphql -> hasura,  everything else -> React
│
├── services/
│   ├── api/                  Node MODULAR MONOLITH (one codebase, two processes)
│   │   ├── server.js         HTTP process: mounts routers, collects Hasura action handlers
│   │   ├── worker.js         Queue process: consumes mail + SOS messages
│   │   ├── lib/              limit.js (Redis rate limit), validate.js, twilio.js
│   │   ├── uploads/          Uploaded images (mounted as a Docker volume)
│   │   └── modules/          Domain folders; modules never import each other
│   │       ├── auth/routes.js          register, login, refresh, logout, forgot, reset, Hasura webhook
│   │       ├── verification/           Hasura actions: email + phone OTP
│   │       ├── safety/                 Hasura action: SOS trigger
│   │       ├── groups/                 Hasura action: invite-link preview
│   │       ├── uploads/                POST /api/upload (multer, images only, 5 MB)
│   │       ├── notifications/          events.js (Hasura event trigger) + consumers.js (mail/SMS senders)
│   │       └── ai/                     POST /api/ai/itinerary -> Python service
│   └── ai/                   Python (FastAPI) AI layer
│       ├── main.py           /itinerary (retrieval + layout) and /events/embed (Hasura event trigger)
│       ├── embeddings.py     Embedding model (fastembed, baked into the image) + item_embeddings reads/writes
│       └── test_main.py      Smoke test; Dockerfile, requirements.txt alongside
│
├── packages/common/          Shared Node helpers used by services/api
│   ├── db.js                 Postgres pool
│   ├── redis.js              Redis client (fails fast)
│   ├── mq.js                 RabbitMQ send/work helpers
│   ├── auth.js               verifyBearer / authenticateToken (JWT + logout blacklist)
│   ├── emailOtp.js           Create + queue an email verification code
│   └── phone.js              Phone number formatting
│
├── scripts/upgrade-existing-db.sql   One-off upgrade for databases created before pgvector/PostGIS
│
├── hasura/bootstrap.js       Builds and applies ALL Hasura metadata (tables, permissions, actions, triggers)
│
├── db/                       Postgres image + init scripts (run once on an empty volume, in name order)
│   ├── Dockerfile            Postgres 16 + pgvector + PostGIS
│   ├── 01-schema.sql         Tables + pgvector and PostGIS extensions
│   ├── 02-logic.sql          Views, SQL functions (business rules), triggers; haversine() uses PostGIS
│   ├── 03-seed.sql           Sample users
│   ├── 04-groups.sql         Trip groups, expenses, settlements
│   ├── 05-geo-index.sql      activities.geog (generated geography column) + GiST index; nearby_activities uses ST_DWithin
│   └── 06-embeddings.sql     item_embeddings table (pgvector, HNSW index); not exposed through Hasura
│
└── design docs/              Design reference (HTML/PDF), not used at runtime
```

## 2. Containers and who talks to whom

```
                        browser
                           │  :80
                     ┌─────▼──────┐
                     │  gateway   │  nginx + React build
                     └──┬──────┬──┘
              /api/*    │      │  /v1/graphql (HTTP + websocket)
                        │      │
        ┌───────────────▼┐    ┌▼───────────────┐
        │ api (Node)     │◄───│ hasura         │  calls api for: auth webhook,
        │  server.js     │    │ (GraphQL)      │  /actions, /events
        └─┬───┬────┬─────┘    └───────┬────────┘
   sync   │   │    │ publish          │ SQL           event trigger
   HTTP   │   │    ▼                  ▼               (embeddings)
          │   │  rabbitmq ──► worker  postgres (+ pgvector, PostGIS)
          ▼   │  (mail, sos)  (same code as api, sends email / SMS)
   ai (Python) ◄── hasura /events/embed;  ai reads and writes postgres directly
              │
              └─► redis (refresh tokens, logout blacklist, rate limits, reset tokens)
```

| Container | Image / source | Reads/writes |
| --- | --- | --- |
| `gateway` | gateway/Dockerfile | Public port 80. Routes traffic, serves the app |
| `api` | Dockerfile (SERVICE=api) | Postgres, Redis, RabbitMQ, ai |
| `worker` | same image, `node worker.js` | RabbitMQ in; Gmail (SMTP) and Twilio out |
| `ai` | services/ai | Postgres (item_embeddings, reads activities and packages); called by `api` and by Hasura event triggers |
| `hasura` | hasura/graphql-engine | Postgres; calls `api` (auth, actions, mail events) and `ai` (embedding events) |
| `hasura-init` | one-shot, runs hasura/bootstrap.js | Hasura metadata API, then exits |
| `postgres` | db/Dockerfile (pgvector + PostGIS) | Loads db/*.sql on first start |
| `redis`, `rabbitmq` | official images | |

## 3. What happens where (by request type)

**Reading and writing app data (most of the app).** The React screen calls a function in `frontend/src/utils/api.js`, which sends a GraphQL request to `/v1/graphql`. nginx forwards it to Hasura. Hasura asks `api` (`GET /api/auth/hasura`) whether the token is valid and who the user is, then runs the query against Postgres. Access rules are Hasura permissions (defined in `hasura/bootstrap.js`); business rules such as RSVP capacity, ride approval, bookings and trust scores are SQL functions in `db/02-logic.sql`. The API service is not in the data path except for that auth check.

**Sign up / log in / session.** `Login.js` and `Register.js` call `/api/auth/*`, handled by `modules/auth/routes.js`. It checks the password (bcrypt), returns a 15-minute access token in the response, and sets a 30-day refresh token as an httpOnly cookie. The access token lives only in memory in `api.js`. On page load `App.js` calls `/api/auth/refresh` to restore the session, and `api.js` refreshes and retries automatically when a request gets a 401. Logout revokes both tokens in Redis. Signup also queues a verification email.

**Password reset.** Forgot-password page calls `/api/auth/forgot`. The API stores a hashed one-hour token in Redis and queues an email with a link to `/reset-password`. `/api/auth/reset` sets the new password and signs out every device.

**Email, phone and SOS actions.** These need the outside world, so Hasura forwards them to `api` (`POST /actions`). `server.js` looks the action name up in the handlers from `modules/verification`, `safety` and `groups`. Email and phone OTP checks are rate-limited in Redis. SOS saves an alert in Postgres and puts a message on the RabbitMQ `sos` queue.

**Background delivery.** `worker.js` consumes the `mail` and `sos` queues (`modules/notifications/consumers.js`): mail goes out over Gmail SMTP, SOS goes out as SMS and WhatsApp through Twilio. If credentials are missing, mail fails and SOS is skipped with a warning. A Hasura event trigger on new ride requests calls `POST /events/wave-request` (`notifications/events.js`), which queues an email to the host.

**File uploads.** GraphQL can't carry files, so the app posts multipart to `/api/upload` (`modules/uploads`). Files land in `services/api/uploads/`, served back at `/uploads/...`. The returned URL is then saved through a normal GraphQL mutation.

**AI itinerary.** The Trips screen has a "Plan your own trip" card that opens `/itinerary` (`components/Itinerary/Itinerary.js`), which calls `aiAPI.itinerary` in `api.js` -> `POST /api/ai/itinerary` (`modules/ai`). The API checks login, validates input, allows 5 calls per minute per user, and calls `ai:8000/itinerary` with a 30-second timeout. The AI service embeds "destination + interests", asks pgvector for the closest upcoming activities and active trips (cosine distance cut-off 0.5), and lays them over the days (3 slots a day). Slots with no match say "Free time to explore" instead of inventing places, and a destination with no matches returns none. No language model writes the days yet: it is retrieval and layout only, and the response says `mode: "retrieval"`.

**Keeping embeddings fresh.** Hasura event triggers on `activities` and `travel_packages` (insert, delete, and updates to title, description, type/category, place/destination) call `ai:8000/events/embed` (defined in `hasura/bootstrap.js`; Hasura retries 5 times). The service embeds the row's text with BAAI/bge-small-en-v1.5 (384 dimensions) and upserts `item_embeddings`, skipping rows whose text didn't change. On every start the service also backfills anything missing, so rows created before it existed or while it was down get caught up. This goes straight from Hasura to the AI service rather than through RabbitMQ, because Hasura's event log already gives durable delivery and retries.

**Nearby activities (geo index).** `activities.geog` is a generated `geography(Point,4326)` column with a GiST index (`db/05-geo-index.sql`); `nearby_activities` filters with `ST_DWithin` so Postgres uses the index instead of computing a distance for every row. On 50,000 rows it went from about 67 ms (every row checked) to about 11 ms, and the gap grows with the table. The column is hidden from GraphQL.

**Live chat.** The chat screen opens a GraphQL subscription over the websocket; Hasura pushes new `group_messages` rows. `api.js` refreshes the access token before each websocket reconnect.

## 4. Where to change things

| I want to... | Go to |
| --- | --- |
| Add a screen | `frontend/src/components/<Area>/`, route in `frontend/src/App.js` |
| Add a data query or mutation for the UI | `frontend/src/utils/api.js` |
| Add a table, view or business rule | `db/` (new SQL), then track and set permissions in `hasura/bootstrap.js` |
| Add something that needs email, SMS or a third party | New handler in a `services/api/modules/<name>/index.js`, register it in `server.js`, declare the action in `hasura/bootstrap.js` |
| Add a REST endpoint | New router in `services/api/modules/`, mount it in `server.js`, nginx already forwards `/api/*` |
| Send something in the background | `mq.send('<queue>', msg)` in a module, a `mq.work` consumer in `modules/notifications/consumers.js` |
| Plug in a real LLM for itineraries | Body of `build_itinerary` in `services/ai/main.py` |
| Change fonts or colors | `frontend/src/theme.css` |
| Change auth timings | `ACCESS_TTL`, `REFRESH_TTL`, `RESET_TTL` at the top of `modules/auth/routes.js` |

## 5. Not built yet

- Moderation and recommendation consumers for the AI layer (lowest priority; nothing depends on them yet). When added, put messages on RabbitMQ from `api` and consume them in the Python service.
- A language model writing the itinerary text. `assemble_plan` in `services/ai/main.py` is where it plugs in; retrieval already supplies the grounding.
- Geo indexes for the other lat/lng tables (`private_pins`, `recommendations`, `marketplace_listings`, `travel_packages`); only `activities` has one. They can copy the pattern in `db/05-geo-index.sql`.
- Retrieval quality: the small embedding model ranks results that repeat the destination name ahead of a better interest match (a kayaking meetup ranked below trips that mention "Rishikesh"). Fine for now; a larger model or a second interests-only query would fix it.
