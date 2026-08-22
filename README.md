# 🚛 LogisticX — Standalone Vehicle Tracking & Tehsil Boundary Crossing Test App

A standardized, high-performance telemetry test application built with **Next.js 14 (App Router)**, **TypeScript**, **Tailwind CSS**, **Leaflet**, and **PostgreSQL / PostGIS**. 

Designed to validate high-accuracy mobile GPS streaming, reverse geocoding to sub-district administrative boundaries (**Tehsil level** in Pakistan), and real-time boundary crossing event detection before integrating into production fleet management.

---

## 🌟 Key Features

- 📱 **Mobile Driver PWA (`/driver`)**:
  - `navigator.geolocation.watchPosition` with high accuracy and throttle options.
  - **Screen WakeLock API** to prevent mobile browsers from suspending telemetry in the background.
  - Device battery level & charging state telemetry.
  - Live Tehsil resolution and instant visual alerts on boundary crossings.
  - Distance & time-based throttle settings (reduces battery drain and GPS noise).

- 🗺️ **Live Map & Telemetry Dashboard (`/dashboard`)**:
  - Interactive Leaflet map with dark-mode tiles (CartoDB / OpenStreetMap).
  - Real-time vehicle marker with direction/pulse and breadcrumb track polyline.
  - Color-coded Pakistan **Tehsil boundary polygon overlays** (Admin Level 3).
  - Chronological **Boundary Crossing Events feed** and raw location pings table.

- ⚡ **Interactive Route Simulator**:
  - Test Tehsil boundary crossings (e.g. *Lahore Cantt ➔ Model Town ➔ Raiwind ➔ Kasur* or *Rawalpindi ➔ Islamabad ➔ Murree*) right inside the browser without physical driving.

- 🛰️ **Spatial Point-in-Polygon Engine**:
  - Direct PostgreSQL + **PostGIS** `ST_Contains` spatial query support.
  - In-memory / **Turf.js GeoJSON spatial fallback** for seamless zero-config local testing.

---

## 🏗️ Architecture

```
[Driver Phone (PWA / Mobile Web)] 
       │  HTTP POST /api/tracking/ping (lat, lng, accuracy, battery, speed)
       ▼
[Next.js App Router Ingest API]
       │
       ▼
[Spatial Reverse Geocoder (PostGIS / Turf.js)]
       ├── Point-in-Polygon query against Pakistan Admin-3 polygons
       └── Compare with vehicle's last known Tehsil
       │
       ├──► If Tehsil changed ──► Insert into `boundary_crossings`
       └──► Append raw ping  ──► Insert into `raw_pings`
       │
       ▼
[Live Telematics Visualizer (/dashboard)]
       ├── Live Map with breadcrumb trail & crossing icons
       └── Auto-refreshing event timeline
```

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (Optional for zero-config mode)
Copy the example environment file:
```bash
cp .env.example .env.local
```

> **Note:** The app works out-of-the-box with built-in in-memory storage and Turf.js spatial calculation if no database is connected. When you connect PostgreSQL + PostGIS, it automatically enables database persistence.

### 3. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser:
- Landing Page: `http://localhost:3000`
- Driver App: `http://localhost:3000/driver`
- Live Map Dashboard: `http://localhost:3000/dashboard`

---

## 🗄️ Database Setup (PostgreSQL + PostGIS)

If using **Supabase**, **Neon**, or self-hosted PostgreSQL:

1. Enable PostGIS and create tables by running the SQL in [`src/db/schema.sql`](./src/db/schema.sql) in your database SQL Editor.
2. Add your connection string to `.env.local`:
   ```env
   DATABASE_URL="postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres"
   ```
3. Seed the Pakistan Tehsil administrative polygons into PostGIS:
   ```bash
   npm run seed:boundaries
   ```

---

## ☁️ Deployment on Vercel

1. Push your repository to **GitHub**:
   ```bash
   git init
   git add .
   git commit -m "feat: vehicle tracking and boundary crossing test app"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
2. Import the project in the [Vercel Dashboard](https://vercel.com/new).
3. Under **Environment Variables**, add:
   - `DATABASE_URL` (Your PostgreSQL / Supabase / Neon connection string)
4. Click **Deploy**.

---

## 🧪 Testing Boundary Crossings

1. Open `/dashboard` and click **"Open Route Simulator"**.
2. Select the route **"Lahore Cantt ➔ Model Town ➔ Raiwind ➔ Kasur"**.
3. Click **"Start Simulation"**.
4. Observe the vehicle marker move across boundaries, and see crossing event notifications trigger when crossing from Lahore into Kasur!

---

## 📄 License
MIT License. Created for LogisticX Telematics Testing.
