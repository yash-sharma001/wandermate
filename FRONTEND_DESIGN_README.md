# WanderMates — Frontend Design Handoff

> Audience: frontend / UI designers taking on the visual and UX upgrade.
> Scope: everything you need to know about what the app is, who uses it, every screen, the current design system, and where the rough edges are. Backend details are included only where they affect the UI (data shown, states, validation).

---

## 1. What is WanderMates?

A **social travel platform**. Travelers find each other in real time, join local meetups, share rides, book experiences and packages, and keep a private travel diary — with safety features (verification, SOS) baked in because many users are solo and women travelers in unfamiliar places.

Tagline in the code: **"Your Travel Tribe Awaits."**
Current test region: Rishikesh, India (default map centre). Currency is ₹ (INR). Phone format is Indian (+91).

### Product pillars (each is a top-level area of the UI)

| Pillar | Nav label | What it does |
|---|---|---|
| **Explore (Social Map)** | Explore | Live map of nearby meetups ("activities") and the user's own private memory pins |
| **Waves** | Waves | Ride-sharing between travelers (host a car ride / join one) with request-approval flow |
| **Marketplace** | Shop | Local vendor experiences (yoga, rafting, stays, cafes…) — browse and register interest |
| **Travel Packages** | Trips | Multi-day curated trips from verified providers, with itinerary, dates, booking |
| **Journal** | Journal | Private timeline + map of memories with photos, notes, mood emoji |
| **Profile / Trust & Safety** | Me | Profile, trust score, verification, emergency contacts, upcoming trips |
| **SOS** | (floating button) | Hold-to-trigger emergency alert, on every screen |

---

## 2. Users and roles

Three account types, chosen at registration ("I am a…"). The role changes the entire navigation.

| Role | Lands on | Nav tabs |
|---|---|---|
| **Traveler** (default) | `/` (map) | Explore · Waves · Shop · Trips · Journal · Me |
| **Vendor** (marketplace seller) | `/vendor/dashboard` | Dashboard · Listings · Shop · Settings |
| **Provider** (travel-package operator) | `/provider/dashboard` | Panel · Host · Browse · Profile |

Design implication: there are effectively **three products in one shell**. The vendor and provider dashboards are business tools (stats, request queues, CRUD); the traveler side is consumer / social / map-first.

---

## 3. Running the app locally

**Requirements:** Node 16+, PostgreSQL 12+ with PostGIS, npm.

```bash
# 1. DB
psql -U postgres -c "CREATE DATABASE wandermates;"

# 2. Backend  (create backend/.env — see below)
cd backend
npm install
npm run init-db        # creates schema + seed data
npm start              # http://localhost:5000

# 3. Frontend
cd frontend
npm install
npm start              # http://localhost:3000
```

`backend/.env`:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wandermates
DB_USER=postgres
DB_PASSWORD=your_password
PORT=5000
JWT_SECRET=any-random-string
```

Optional frontend env (defaults shown): `REACT_APP_API_URL=http://localhost:5000`, `REACT_APP_WS_URL=ws://localhost:5000`.

Windows shortcuts exist in the repo root: `setup.bat`, `start.bat`.

**Demo logins** (from the older README; seed script is `backend/scripts/init-db.js` — verify they exist in your DB):
`sarah@example.com` / `password123` · `alex@example.com` / `password123` · `priya@example.com` / `password123`.
To test vendor/provider views, register a new account and pick that role. `backend/create_test_user.js` creates a test user.

> **Designer tip:** you can do most visual work without the backend by running only the frontend, but every screen behind login needs a valid JWT in `localStorage` (`token` and `user` keys). Easiest path is to run the full stack once.

---

## 4. Tech stack (frontend)

| Concern | Tool | Notes |
|---|---|---|
| Framework | React 18, Create React App (`react-scripts` 5) | No TypeScript |
| Routing | `react-router-dom` v6 | Routes all defined in [App.js](frontend/src/App.js) |
| Animation | `framer-motion` | Page transitions, nav entrance, hover/tap micro-interactions |
| Icons | `lucide-react` | Plus lots of raw emoji used as icons (see §9) |
| Map (main) | `react-map-gl` + `maplibre-gl` | Style: OpenFreeMap "liberty" (`https://tiles.openfreemap.org/styles/liberty`) |
| Map (legacy) | `leaflet` / `react-leaflet` | Still in `package.json`; `LocationPicker` is an old stub |
| Geocoding | Photon (komoot) public API | Place search + reverse geocode, no key |
| Toasts | `react-hot-toast` | Installed, **barely used** — most feedback is `alert()` (see §11) |
| Dates | `date-fns` | |
| HTTP | `axios` | Wrapper in [utils/api.js](frontend/src/utils/api.js) |
| Realtime | Native WebSocket | [utils/websocket.js](frontend/src/utils/websocket.js) |
| Styling | **Plain CSS files**, one per feature + global `App.css` | No Tailwind, no CSS-in-JS, no component library |

Styling is co-located: each component folder has its own `.css`. The global tokens live in `:root` at the top of [App.css](frontend/src/App.css).

---

## 5. Design system as it exists today

Named "Global Design System v3.0" in [App.css](frontend/src/App.css). Palette: **Teal + Coral + Navy + Cyan**.

### 5.1 Colour tokens

| Token | Value | Use |
|---|---|---|
| `--teal` (`--primary`) | `#0D9488` | Primary brand, CTAs, active states (most-used token, ~150 references) |
| `--teal-light` / `--teal-dark` | `#14B8A6` / `#0F766E` | Hover / gradients |
| `--coral` (`--accent`) | `#F97316` | Secondary accent, highlights |
| `--cyan` | `#06B6D4` | Gradient partner |
| `--violet` (`--purple`) | `#8B5CF6` | Occasional accent |
| `--success` / `--danger` / `--warning` | `#10B981` / `#EF4444` / `#F59E0B` | Status |
| `--bg-main` | `#F8FFFE` | Page background (light) |
| `--bg-card` | `#FFFFFF` | Cards |
| `--bg-grey` | `#F0FDFA` | Tinted panels / inputs |
| `--text-main` / `--text-muted` | `#0F172A` / `#64748B` | Text |
| `--border` | `rgba(13,148,136,.15)` | Teal-tinted hairline |

**Gradients:** `--gradient-brand` (teal→cyan→teal-dark), `--gradient-coral`, `--gradient-hero`, `--gradient-sunset`, `--gradient-landing`, `--gradient-onboarding`.
**Glass:** `--glass` = `blur(20px) saturate(200%)`; `--glass-heavy` = `blur(32px)…`. Used heavily on nav, cards, sheets.
**Shadows:** `--shadow-sm/md/lg/xl`, plus tinted `--shadow-teal`, `--shadow-coral`, `--shadow-premium`.
**Radii:** 6 / 10 / 16 / 24 / 32 / 48 / full (`--radius-xs … --radius-2xl`, `--radius-full`).
**Easing:** `--ease-spring` (bouncy), `--ease-smooth`, `--ease-elegant`.
**Layout:** `--nav-height: 72px`, `--mobile-nav-height: 68px`, `--sidebar-width: 300px`, `--max-content: 1680px`.

### 5.2 Dark mode
Implemented via `@media (prefers-color-scheme: dark)` on `:root` — **system-driven only, no in-app toggle**. It overrides backgrounds, text, border and shadows to deep teal-black (`#060E0D` / `#0D1F1E`). Many components hard-code light values (`#fee2e2`, `#fff`, `#ef4444`, inline `style={{}}` colours) and will look wrong in dark mode. Treat dark mode as **partially working**.

### 5.3 Typography
- Loaded in `App.css`: **Inter** (300–900) and **Space Grotesk** (400–800).
- Headings/brand use Space Grotesk; body uses Inter / inherit.
- `public/index.html` *also* loads **Plus Jakarta Sans** and one CSS rule uses it. `index.css` sets a system-font stack. → **Three type systems are competing.** Pick one pairing.
- Weights are heavy (700–900 for headings, uppercase micro-labels like `ACTIVITY TYPE`, `TITLE *`).

### 5.4 Shared building blocks (class names you'll meet)

| Class | Purpose |
|---|---|
| `.page-container` | Wrapper added by `PageWrapper` in App.js (fade/slide-in on route change) |
| `.noise-bg` | Full-page grain overlay (SVG noise data-URI) |
| `.btn-modern`, `.btn-modern-primary/-secondary/-danger`, `.btn-full`, `.btn-mini` | Newer button set |
| `.btn`, `.btn-primary`, `.btn-secondary` | **Older** button set still used in Vendor, Safety, ActivityDetails |
| `.form-label`, `.form-input`, `.form-textarea` | Form fields (labels are uppercase, small) |
| `.glass-card-modern`, `.sidebar-card-glass` | Glass surfaces |
| `.modal-overlay` / `.modal-content` | Journal & Safety modals |
| `.edit-profile-modal`, `.ep-label`, `.close-ep-btn` | Profile-edit modal (**reused** in MyWaves for "Remove Traveler") |
| `.vendor-modal-*`, `.provider-modal-*` | Separate modal implementations per dashboard |
| `.spinner-modern`, `.loading-screen` | Loader |
| `.type-chip`, `.gender-chip`, `.pkg-category-chip`, `.marketplace-categories` | Selectable chips (several near-duplicate implementations) |

---

## 6. Global shell and navigation

Defined in [App.js](frontend/src/App.js) and [Layout/Navbar.js](frontend/src/components/Layout/Navbar.js).

```
<App>
  .noise-bg                     (grain overlay)
  <Navbar/>      only when logged in
  <SOSButton/>   only when logged in — floating on every screen
  <AnimatePresence><Routes/> …  (page fade/slide, keyed by pathname)
```

- **Desktop (≥ tablet):** floating glass top bar — logo tile (compass icon, rotates on hover) + "Wander**Mates**" wordmark, centred tab links (icon + label), right side: avatar initial + first name + role, and a logout icon that spins 90° on hover.
- **Mobile:** floating bottom tab bar (icon + tiny label, active icon gets heavier stroke, tap-scale spring).
- Avatar is just the **first letter** of the name in a circle (there is a photo upload in Edit Profile, but the navbar doesn't show it).
- Only 38 `@media` queries across the whole app — responsiveness is uneven (see §11).

---

## 7. Screen-by-screen inventory

Route → file → what the user sees → states to design. Each entry lists the **content and interactions that must survive the redesign**.

### 7.1 Auth

**Login** — `/login` — [Auth/Login.js](frontend/src/components/Auth/Login.js), [Auth.css](frontend/src/components/Auth/Auth.css)
Split layout: left "aside" with tagline + feature bullets (title + description each), right form card. Heading "Welcome back 👋". Two **social buttons** (Google/Apple-style — decorative, not wired). Fields: *Email or Username*, *Password* (show/hide toggle). Primary "Sign in" button with loading state. Inline error banner. Footer link "Create one free".

**Register** — `/register` — [Auth/Register.js](frontend/src/components/Auth/Register.js)
Same split layout. "Create account ✨". **Role selector** ("I am a": Traveler / Vendor / Provider), Display Name, Username (`your_unique_handle`), Email, **Gender** (button group, required — drives women-only event logic), Password (min 6), Confirm Password. Inline error, loading state, link to Sign In.

**Landing** — [Auth/Landing.js](frontend/src/components/Auth/Landing.js) — ⚠️ **built but not routed.** Dark teal gradient, three floating circles, compass logo box, "WanderMates / Your Travel Tribe Awaits", "Get Started →" and "Log In", terms/privacy footer. Currently logged-out users are redirected straight to `/login`. **Opportunity:** wire this up as a real marketing landing at `/`.

**Onboarding** — [Auth/Onboarding.js](frontend/src/components/Auth/Onboarding.js) — ⚠️ **built but not routed.** 3-step wizard: (1) "Tell us about yourself" — name, age (18+ dropdown), home city search, gender, optional bio; (2) "Verify your identity" — "Why verify?" explainer; (3) "Find travelers near you". Progress steps, Continue / Skip. **Opportunity:** wire in after register.

### 7.2 Explore (Social Map) — the home screen

`/` — [Map/MapView.js](frontend/src/components/Map/MapView.js) (503 lines), [MapView.css](frontend/src/components/Map/MapView.css)
Full-bleed MapLibre map — this is the hero of the product.

- **Search bar** floating on top: "Where to next?", debounced place autocomplete dropdown (city, state, country), clear (✕) button.
- **Current location label** ("Locating…" until resolved) + geolocate & zoom controls.
- **Markers:** activity markers (emoji per activity type) and the user's **private journal pins** (own style).
- **Bottom sheet — activity selected:** title, host, type, time, attendees, "View details" primary button.
- **Bottom sheet — pin selected:** memory title, note, "Open journal" button.
- **Drawer — "Nearby WanderMates":** list of activity cards, opened from a control; close (✕).
- **Two floating action buttons (FABs):** *Create Event* (→ `/create-activity`) and *Drop a Pin* (enters **pinning mode** — a banner with Cancel appears; tap the map to place a pin → opens Create Pin modal).
- States: loading, no location permission, no nearby activities, pinning mode.

**Activity types** (11, each with an emoji): Cafe ☕ · Hike ⛰️ · Night Out ✨ · Wellness/Yoga 🧘 · Foodie 🍜 · Creative 🎨 · Photo 📸 · Getaway 🎒 · Sports 🏀 · Spiritual 🛕 · Meetup 🤝. These emoji are the marker icons — a custom marker set would be a high-impact upgrade.

### 7.3 Activities

**Activity Details** — `/activity/:id` — [Activities/ActivityDetails.js](frontend/src/components/Activities/ActivityDetails.js)
Back arrow, type badge (emoji + type), title, host, **tabs: Details | Chat** (group chat for attendees), attendee count `X / capacity` with avatars, description, women-only banner (green, shield). Action button depends on state: **Join** / **Cancel RSVP** / **Delete** (host) / **Leave review** (after the event). Also a **Report** entry.
Uses `alert()` for errors.

**Create Activity** — `/create-activity` — [Activities/CreateActivity.js](frontend/src/components/Activities/CreateActivity.js)
Title "Host an Activity" with close ✕. Sections: **Activity type** chip grid (11), Title (60 chars), **Location** (autocomplete search + "pick on map" full-screen picker + "use current location" + coordinate badge), Date & time, **Capacity** stepper (− / +), Description, **Women-Only toggle** ("Women-Only Event 🛡️", only meaningful for female users), submit.

### 7.4 Waves (ride-sharing)

`/waves` — [Waves/WaveDashboard.js](frontend/src/components/Waves/WaveDashboard.js) — Header "Waves Community" + 3-tab pill nav:

1. **Explore Rides** — search form (from / to / date) → "Live Waves" list of wave cards (route From → To, time, seats left, price/seat, car, host) → detail sheet with **seat stepper** and "Request to join". Empty state + error card.
2. **Host a Wave** — [HostWaveForm.js](frontend/src/components/Waves/HostWaveForm.js): Leaving from, Going to, Departure time, Seats, Car model, Car number, Price per seat ("You earn"), Notes. **Submit is disabled until the host is fully verified** — needs a clear "why is this disabled / go verify" treatment.
3. **My Travels** — [Waves/MyWaves.js](frontend/src/components/Waves/MyWaves.js): two roles in one list — waves you **host** (edit, cancel entire ride, view passenger requests with Accept/Reject, remove passenger with reason modal) and waves you **joined** (status, cancel request, review host after trip). Each card shows From/To blocks. Includes **Trip Group Chat** ([Chat/GroupChat.js](frontend/src/components/Chat/GroupChat.js)): message list, own vs. other bubbles, empty state, send box; real-time via WebSocket.

Request statuses to style: pending · accepted · rejected · cancelled.

### 7.5 Marketplace ("Shop")

`/marketplace` — [Marketplace/Marketplace.js](frontend/src/components/Marketplace/Marketplace.js)
Title, search ("Search activities, stays, cafes…"), category chip row: **All · Yoga · Rafting · Stays · Camping · Cafe · Photography · Adventure**. Grid of `premium-listing-card`: emoji "visual" area with category tag, title, vendor, price (₹), duration, distance (uses user location). Tap → bottom sheet with full description, vendor info, contact, **"Register interest"** → success state ("Interest Registered!" → Return Home).
Cards use **emoji instead of photos** — listings have no image field today. Adding imagery is a big visual win but needs a backend/upload change (flag to dev).

### 7.6 Travel Packages ("Trips")

`/packages` — [Packages/TravelPackages.js](frontend/src/components/Packages/TravelPackages.js)
Title, search, **inline month calendar** ("Select Travel Date", prev/next month, days with departures highlighted, clear-date), category chips: **All · Adventure · Trekking · Wellness · Cultural · Wildlife · Beach · Pilgrimage**. Result count header ("N Packages Available"), empty state ("No packages found — try a different date, category, or search"). `package-card`: image area, category badge, "✓ Verified" provider badge, title, meta, price footer.
**Detail modal:** title, category, About, What's Included (list), **Itinerary** (day-by-day timeline), **Available Departure Dates** (selectable), booking form (traveler count / notes) → "Booking confirmed!" success.

### 7.7 Journal

`/journal` — [Journal/TravelJournal.js](frontend/src/components/Journal/TravelJournal.js), [MemoryLine.js](frontend/src/components/Journal/MemoryLine.js), [PersonalMap.js](frontend/src/components/Journal/PersonalMap.js), [CreatePinModal.js](frontend/src/components/Journal/CreatePinModal.js)
Private, only visible to the user. A **timeline of memory "milestone cards"** (photo(s), title, place, date, note, mood emoji, delete) beside/above a **personal map** of pins. Location filter chip ("📍 current place"). Empty state: *"Silence in the valley"*.
**Capture a Memory modal:** photo upload (**max 5 images**, thumbnails with remove ✕), Title ("Morning Magic…"), Location name (required, auto-filled from GPS via reverse geocode), Date & time, "Tell the story" note, **Vibe check** — 17-emoji mood picker: 📍 ☕ 🏨 ⛰️ 🏖️ 🍽️ 📸 ✨ 🧘 🚴 🏰 🛶 🛤️ 🎒 🌇 🏮 🎭.

### 7.8 Profile & Trust

`/profile` — [Profile/Profile.js](frontend/src/components/Profile/Profile.js) (495 lines) — two-column: **sidebar glass card** (avatar, edit ✎ circle, name, home base, verification badges, Bio, Sign Out) + **tabbed content**:
- **Overview** — "Boost your trust score!" nudge card with *Verify ➔*, **Trust meter** card ("Identity Status"), stat tiles (**Experiences**, **Connections**).
- **Adventures** — "Upcoming Adventures" list (activities RSVP'd, waves joined).
- **Trust & Safety** — "Security & Privacy": verification rows (email OTP, phone OTP, Aadhaar) each with *Start / Verify* action or a green "Secured ✓" badge; emergency contacts add/remove.

**Edit Profile modal:** profile picture upload, Full Name, Home Base, Email, Contact number (+91…), Story/Bio, Cancel / Save Changes.

**Safety Center** — [Safety/SafetyCenter.js](frontend/src/components/Safety/SafetyCenter.js) — ⚠️ not currently routed but fully built ("← Profile", "Safety & Verification"): **Identity Verification card** (photo of Aadhaar, name as on card, 12-digit number, submit → states *Not submitted / Under review / "Whistled & Verified!"*), **Emergency Contacts card** (add form: name, relationship, phone; list with delete; empty state), **"How SOS Works"** explainer.

Trust concepts the UI must communicate: **verification levels**, **trust score**, **verified badge** (also shown on Package providers), star **reviews** and **reports** (see §7.10).

### 7.9 Vendor dashboard

`/vendor/dashboard` — [Vendor/VendorDashboard.js](frontend/src/components/Vendor/VendorDashboard.js), [Vendor.css](frontend/src/components/Vendor/Vendor.css)
"Partner Dashboard": **stat cards** row, three quick actions (New listing / My listings / View marketplace), **Recent Requests** (booking cards with Accept / Decline; empty "No bookings yet"), **Your Experiences** (listing cards with category icon, edit ✎, delete 🗑; empty "Start your journey").
**Vendor Listings** — [Vendor/VendorListings.js](frontend/src/components/Vendor/VendorListings.js) ("My Listings"): CRUD list + modal with category chips (Yoga, Rafting, Stays, Camping, Cafe, Photography, Adventure, **Other**), Title, Description, Price ₹, Duration, Business name, Location name, Lat/Long (raw number inputs — should be a map picker!), "use current location", Contact phone/email.
⚠️ The nav links `/vendor/listings` and the dashboard navigates to `/vendor/listings/new` and `/vendor/listings/edit/:id`, but **`VendorListings` is commented out in App.js**, so those links currently redirect. Decide the intended flow with the dev.

### 7.10 Provider dashboard

`/provider/dashboard` — [Provider/ProviderDashboard.js](frontend/src/components/Provider/ProviderDashboard.js), [ProviderDashboard.css](frontend/src/components/Provider/ProviderDashboard.css)
"Package Hub": header + "Create" button, stat cards, **3 tabs — Dashboard | My Concepts | Traveler List**. Dashboard: "New Requests" with Confirm / Decline. My Concepts: full package cards (category, title, edit, delete). Modal "New Concept / Refine Concept" (title, price, itinerary, inclusions, departure dates, category from Adventure/Trekking/Wellness/Cultural/Wildlife/Beach/Pilgrimage). Empty: "No Packages Found".
⚠️ Nav also links `/provider/packages` which has no route.

### 7.11 Safety overlays (global)

- **SOS button** — [Safety/SOSButton.js](frontend/src/components/Safety/SOSButton.js): fixed floating shield button labelled "SOS". **Press and hold 1.5 s** — a ring fills from the bottom (`height: progress%`), text "HOLD TO TRIGGER" appears, on completion sends GPS to backend, which alerts emergency contacts; result shown in a **browser `alert()`** — should be a proper confirmation screen. Cool-down 5 s. This is the most safety-critical UI in the app: it must be unmistakable, reachable, and impossible to trigger by accident, without blocking content on small screens.
- **Review modal** — [Safety/ReviewModal.js](frontend/src/components/Safety/ReviewModal.js): "Rate your experience", star rating, comment.
- **Report modal** — [Safety/ReportModal.js](frontend/src/components/Safety/ReportModal.js): "Report Concern", reason options + details textarea, warm copy about the safety team.
- Styles for all in [Safety.css](frontend/src/components/Safety/Safety.css).

---

## 8. Map view details worth knowing

- Map style is a **third-party hosted vector style** (OpenFreeMap "liberty") — a custom style (brand colours, dark variant) is possible and would visually unify the app. Talk to the dev before switching provider.
- Marker = emoji in a styled pin. Two visually distinct marker families (public activities vs private memories) must remain distinguishable.
- `CreateActivity` and `TravelJournal`/`PersonalMap` each instantiate their own map — keep styles consistent across all three.

---

## 9. Icons and imagery (current state)

- **lucide-react** line icons for nav and UI chrome.
- **Emoji everywhere else:** activity types, marketplace categories, mood picker, headings ("Welcome back 👋", "Create account ✨", "Women-Only Event 🛡️"), empty states.
- **No photography, illustration or brand assets.** `frontend/public/` contains only `index.html`; `index.html` references a `manifest.json` that doesn't exist, there's no favicon, and `theme-color` is `#2563EB` (blue — stale, brand is teal).
- User-uploaded images: journal photos (up to 5), profile picture, Aadhaar photo. Served from backend `/uploads`.

---

## 10. Motion (current)

Framer-motion is already in place — keep the *feel*, refine the execution:
- Route change: fade + 10px slide, 0.3 s, spring-ish `[0.34,1.56,0.64,1]` (overshoots — may feel bouncy on page changes).
- Navbar slides in from the top on load.
- Buttons: hover rotate/scale, tap shrink.
- Cards: `whileHover` nudges (e.g. booking cards move 8px right).
- Modals scale 0.9 → 1.
- No `prefers-reduced-motion` handling yet.

---

## 11. Known UX / design debt (please address or advise)

**Consistency**
1. Two button systems (`.btn*` and `.btn-modern*`) and at least four modal implementations (`modal-*`, `edit-profile-modal`, `vendor-modal-*`, `provider-modal-*`) plus several chip variants. Consolidate into one set of primitives.
2. Three font systems (Inter/Space Grotesk, Plus Jakarta Sans, system stack). Choose one.
3. Hard-coded colours and lots of inline `style={{…}}` in JS (ActivityDetails, Waves, MyWaves) bypass tokens; `--alert-red` is used but **not defined**. Tokens `--purple`/`--primary` are aliases of others — clean up naming.
4. `theme-color` meta is blue while the brand is teal.

**Feedback & states**
5. Errors/successes use blocking `alert()` in ~20 places (RSVP, profile save, wave created, SOS, reports, reviews, aadhaar…). `react-hot-toast` is already installed — replace with toasts and proper confirmation screens.
6. Loading states are mostly a lone spinner; no skeletons for cards/lists/map sheets.
7. Empty states exist and have personality ("Silence in the valley") but are inconsistent in style and illustration.
8. Destructive actions (delete listing/wave/pin, cancel RSVP) use `window.confirm` or nothing — need a shared confirm dialog.

**Layout & responsiveness**
9. Only ~38 media queries app-wide; check every screen at 360 / 390 / 768 / 1024 / 1440. The map bottom sheets, marketplace/packages detail sheets and dashboards need particular attention on phones. Mobile is the primary use case (travelers on the go) — treat it as mobile-first.
10. The fixed SOS button, floating nav, FABs and bottom sheets can collide on small screens — needs a defined stacking/spacing plan.
11. `--max-content: 1680px` is very wide; desktop layouts for list pages may feel sparse.

**Accessibility**
12. Many clickable `div`s, icon-only buttons without labels, uppercase micro-labels at small sizes, teal-on-white and muted-grey text that may fail WCAG AA contrast, no focus-visible styling review, emoji as sole meaning, no reduced-motion support. SOS hold gesture has no keyboard / assistive alternative.

**Dark mode**
13. System-preference only, incomplete (see §5.2). Decide: support properly (with a toggle) or drop.

**Unrouted / orphaned UI (built, not reachable)**
14. `Landing`, `Onboarding`, `SafetyCenter`, `VendorListings` (and `/provider/packages`) — decide whether each is part of the redesign and tell the dev which routes to wire.

**Content / trust**
15. Social login buttons on Login/Register are decorative.
16. Marketplace and Package cards lack real imagery (packages have an image area; marketplace uses emoji).
17. Trust score / verification is a core differentiator but is visually modest — a stronger, consistent **trust badge system** (levels, colours, where it appears on cards, chats, attendee lists) would pay off.

---

## 12. Suggested priorities for the upgrade

1. **Foundations:** finalize tokens (colour, type, spacing scale, radius, elevation), one button/input/chip/modal/toast/skeleton kit, light + (optionally) dark theme.
2. **Mobile-first pass** on the five highest-traffic screens: Map, Activity details, Waves, Marketplace, Profile.
3. **Marketing landing + onboarding** (already coded, just unrouted) — first impression and trust.
4. **Safety UX:** SOS confirmation flow, verification/trust badge system, report/review polish.
5. **Imagery & marker set:** custom map markers, category illustrations, photo-first cards.
6. **Business dashboards** (Vendor/Provider): data-dense but clean, table/card patterns, real stat visuals.
7. **Motion & a11y** polish.

---

## 13. Project structure (frontend)

```
frontend/
├── public/index.html                # meta, font links (needs favicon + manifest)
└── src/
    ├── index.js / index.css         # entry + base font (superseded by App.css)
    ├── App.js / App.css             # routes, page transition, GLOBAL TOKENS + shared classes
    ├── utils/
    │   ├── api.js                   # axios instance + API modules (auth, activities, pins, waves, marketplace, packages, safety, users, chat)
    │   └── websocket.js             # live activity updates + chat
    └── components/
        ├── Auth/         Login, Register, Landing*, Onboarding*, Auth.css
        ├── Layout/       Navbar (desktop top bar + mobile bottom bar)
        ├── Map/          MapView (home)
        ├── Activities/   ActivityDetails, CreateActivity
        ├── Waves/        WaveDashboard, WaveSearchForm, HostWaveForm, MyWaves
        ├── Chat/         GroupChat
        ├── Marketplace/  Marketplace
        ├── Packages/     TravelPackages
        ├── Journal/      TravelJournal, MemoryLine, PersonalMap, CreatePinModal
        ├── Profile/      Profile (+ EditProfile modal styles)
        ├── Safety/       SOSButton, SafetyCenter*, ReviewModal, ReportModal
        ├── Vendor/       VendorDashboard, VendorListings*
        ├── Provider/     ProviderDashboard
        └── Common/       LocationPicker (legacy stub)
* = built but not currently routed
```

## 14. Backend surface (for context on what data each screen has)

REST under `/api/*`: `auth` (register, login) · `users` (me, profile, my activities) · `activities` (nearby, create, detail, RSVP/cancel, delete) · `pins` (private journal CRUD, multi-image upload) · `recommendations` (nearby) · `marketplace` (listings, vendors, bookings) · `packages` (browse, provider CRUD, book, booking status) · `waves` (create, search, my-waves, join, requests approve/reject/cancel) · `safety` (email/phone OTP, Aadhaar, emergency contacts, SOS + history, review, report) · `chat` (group messages). Database: PostgreSQL + PostGIS (`backend/sql/schema.sql`). Auth: JWT stored in `localStorage` (`token`, `user`).

## 15. Ground rules for the handoff

- **Don't rename or remove** class names/DOM structure that JS depends on without coordinating — much of the state (`active`, `selected`, `triggered`) is toggled via class names.
- Keep the **content and behaviours** in §7; visual treatment is yours.
- Prefer **CSS variables** (extend the `:root` block) so the dev can adopt changes without touching components.
- Deliver: token sheet, component kit (Figma or Storybook-style), annotated mobile + desktop screens for each route in §7, and empty / loading / error states for each.
