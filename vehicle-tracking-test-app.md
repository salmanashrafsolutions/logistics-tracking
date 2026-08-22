# Vehicle Tracking — Standalone Test App Spec

## Goal
Build a small, isolated test app that proves out the core tracking mechanics
before wiring anything into LogisticX:
- Get a driver's live location from their phone (foreground + background)
- Log a location history with timestamps
- Detect and record when the vehicle crosses an administrative boundary
  (tehsil-level, not just city-level) and log the crossing event
- Once this works reliably on its own, port the logic into LogisticX as a
  `vehicle_locations` / `boundary_crossings` module

Keeping it standalone first is the right call — you can iterate fast on the
tricky parts (background permissions, reverse geocoding accuracy, battery
drain) without touching the production schema or UI.

---

## 1. Architecture Overview

```
[Driver's Phone]
   │  location pings (lat, lng, timestamp, accuracy)
   ▼
[Ingest API]  (Next.js API route or Supabase Edge Function)
   │
   ▼
[Postgres / Supabase]
   ├── raw_pings          (every ping, append-only)
   ├── location_history   (cleaned/deduped track)
   └── boundary_crossings (derived events: entered/exited tehsil X at time T)
   │
   ▼
[Reverse Geocoding Worker]
   compares each new ping's tehsil against the last known tehsil
   → if different, writes a row to boundary_crossings
```

Two moving parts you're testing independently:
1. **Can we reliably get a location stream from the phone**, including
   while the browser tab/app is backgrounded?
2. **Can we reliably map a lat/lng to a tehsil** and detect the moment it
   changes?

---

## 2. Getting the Location Stream

### Option A — PWA (fastest to prototype, foreground-only reliable)
- `navigator.geolocation.watchPosition()` with `enableHighAccuracy: true`
- Push each reading to your ingest API every N seconds or M meters moved
  (distance-based throttling saves battery and reduces noise)
- Background behavior is unreliable in mobile browsers (iOS Safari
  especially suspends JS when the tab isn't active) — fine for a first
  test, not fine for production driver tracking

### Option B — Installed PWA + Service Worker
- Adds a manifest + service worker so the app can be "installed" to the
  home screen
- Slightly better background survival on Android; still weak on iOS
- Good middle step if you want to stay in the Next.js codebase

### Option C — Native wrapper (Capacitor or React Native) — recommended for real background tracking
- Wrap your existing web logic in Capacitor, add the
  `@capacitor/geolocation` + a background-geolocation plugin
  (e.g. `capacitor-background-geolocation`)
- Android: requires a foreground service with a persistent notification
  ("LogisticX is tracking this vehicle") — this is required by the OS, not
  optional, and it's good practice to keep it visible anyway
- iOS: requires "Always" location authorization, shows the blue
  status-bar indicator when tracking in background — also required by
  the OS, can't be hidden
- This is the only path that gives you dependable background pings when
  the driver's screen is off or they've switched apps

**For the test app: start with Option A to validate the geocoding/history
logic, then swap the location source to Option C once that's solid — the
ingest API and database side don't need to change.**

---

## 3. Tehsil-Level Reverse Geocoding

City-level is too coarse for a "crossed into another area" log. You want
admin boundaries at the tehsil (sub-district) level.

### Data source options
- **GADM** (gadm.org) — free administrative boundary polygons for
  Pakistan down to admin level 3, which lines up closely with tehsils.
  Download as GeoJSON/Shapefile, load into Postgres with PostGIS.
- **OpenStreetMap + Nominatim** — reverse geocoding API can return
  `county`/`state_district` fields that often correspond to tehsil names,
  but coverage/naming consistency in Pakistan varies — treat as a
  secondary check, not primary source.
- **HDX (Humanitarian Data Exchange)** — has Pakistan admin boundary
  datasets (admin0–admin3) that are sometimes cleaner than GADM for
  Pakistan specifically.

Recommended: pull GADM level-3 polygons for Pakistan once, store them in a
PostGIS `tehsil_boundaries` table (`name`, `district`, `province`,
`geom`), and do the lookup **locally** with a point-in-polygon query
instead of hitting an external API on every ping. This is faster, free,
works offline, and avoids rate limits.

```sql
-- given a new ping (lng, lat), find which tehsil it falls in
SELECT name, district
FROM tehsil_boundaries
WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(:lng, :lat), 4326))
LIMIT 1;
```

### Crossing detection logic
1. On each new ping, run the point-in-polygon lookup.
2. Compare the result to the vehicle's last known tehsil (kept in a
   small `current_tehsil` cache per vehicle, or just query the last row
   in `boundary_crossings`).
3. If it changed, insert a row into `boundary_crossings`:
   `(vehicle_id, from_tehsil, to_tehsil, crossed_at, lat, lng)`.
4. If it's the same, do nothing (avoids flooding the table with
   duplicate "still in the same tehsil" rows).

---

## 4. Suggested Schema (test app, Supabase/Postgres + PostGIS)

```sql
create extension if not exists postgis;

create table tehsil_boundaries (
  id serial primary key,
  name text not null,
  district text,
  province text,
  geom geometry(MultiPolygon, 4326)
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  label text not null            -- e.g. "Truck 12 - Driver Imran"
);

create table raw_pings (
  id bigserial primary key,
  vehicle_id uuid references vehicles(id),
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  recorded_at timestamptz default now()
);

create table boundary_crossings (
  id bigserial primary key,
  vehicle_id uuid references vehicles(id),
  from_tehsil text,
  to_tehsil text,
  lat double precision,
  lng double precision,
  crossed_at timestamptz default now()
);
```

---

## 5. Test App Build Order

1. **Ingest first** — one API route that accepts `{vehicle_id, lat, lng,
   accuracy, timestamp}` and writes to `raw_pings`. Test with Postman /
   curl before touching the phone.
2. **Load boundaries** — import GADM/HDX Pakistan admin-3 polygons into
   `tehsil_boundaries`. Sanity check with a few known coordinates
   (e.g. confirm a Lahore point resolves to the right tehsil).
3. **Wire up the phone** — simple mobile web page with
   `watchPosition()` posting to the ingest route every ~15–30 sec or on
   ~200m movement.
4. **Add the crossing worker** — either a Postgres trigger/function on
   insert into `raw_pings`, or a small server-side job that runs the
   point-in-polygon check after each ping and writes to
   `boundary_crossings` when it changes.
5. **Simple history view** — a page listing pings and crossings for a
   vehicle, sorted by time, so you can visually confirm accuracy while
   driving/testing.
6. **Once accuracy and battery behavior look right**, move the schema
   and ingest logic into LogisticX as a new module, and swap the
   location source over to the native/Capacitor background approach.

---

## 6. Open Questions to Settle During Testing
- Ping frequency vs. battery drain trade-off (time-based vs
  distance-based throttling)
- How to handle GPS noise near a tehsil border (a vehicle sitting near
  the line can "flicker" between two tehsils) — consider requiring the
  new tehsil to persist for 2 consecutive pings before logging a crossing
- Whether drivers need visibility into their own tracked history (builds
  trust, and is required for background location permission on both
  major platforms anyway)
