-- ========================================================================
-- LOGISTICX VEHICLE TRACKING & BOUNDARY CROSSING MODULE
-- Schema Definition for PostgreSQL + PostGIS (Supabase / Neon / Self-hosted)
-- ========================================================================

-- 1. Enable PostGIS Extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Tehsil Administrative Boundaries (Admin Level 3)
CREATE TABLE IF NOT EXISTS tehsil_boundaries (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,                  -- e.g. "Lahore Cantt", "Model Town", "Kasur"
  district TEXT NOT NULL,              -- e.g. "Lahore", "Kasur", "Rawalpindi"
  province TEXT NOT NULL,              -- e.g. "Punjab", "Sindh", "KPK", "Balochistan"
  code TEXT,                           -- GADM/HDX administrative code
  geom GEOMETRY(MultiPolygon, 4326),   -- Spatial polygon in WGS84
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for sub-millisecond point-in-polygon queries
CREATE INDEX IF NOT EXISTS idx_tehsil_boundaries_geom 
ON tehsil_boundaries USING GIST(geom);

-- 3. Vehicles Registry
CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,                 -- e.g. "Truck 12 - Driver Imran"
  plate_number TEXT,                  -- e.g. "LEA-2024"
  driver_name TEXT,                   -- e.g. "Imran Khan"
  phone_number TEXT,                  -- e.g. "+923001234567"
  status TEXT DEFAULT 'active',       -- 'active', 'idle', 'offline'
  current_tehsil TEXT,                -- Cache of last resolved tehsil
  last_ping_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Raw Ingest Location Pings (Append-only)
CREATE TABLE IF NOT EXISTS raw_pings (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION,
  speed DOUBLE PRECISION,              -- Speed in m/s or km/h (if available)
  heading DOUBLE PRECISION,            -- Heading/bearing in degrees
  battery_level DOUBLE PRECISION,      -- Device battery level (0.0 - 1.0)
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  server_received_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices for rapid vehicle history queries
CREATE INDEX IF NOT EXISTS idx_raw_pings_vehicle_time 
ON raw_pings(vehicle_id, recorded_at DESC);

-- 5. Derived Boundary Crossing Events
CREATE TABLE IF NOT EXISTS boundary_crossings (
  id BIGSERIAL PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  from_tehsil TEXT,                    -- Nullable for first ping or entry
  to_tehsil TEXT NOT NULL,
  from_district TEXT,
  to_district TEXT,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION,
  crossed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

-- Indices for crossing history
CREATE INDEX IF NOT EXISTS idx_boundary_crossings_vehicle_time 
ON boundary_crossings(vehicle_id, crossed_at DESC);

-- 6. Helper Point-in-Polygon Function
CREATE OR REPLACE FUNCTION lookup_tehsil(in_lat DOUBLE PRECISION, in_lng DOUBLE PRECISION)
RETURNS TABLE (
  tehsil_id INT,
  tehsil_name TEXT,
  district_name TEXT,
  province_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT id, name, district, province
  FROM tehsil_boundaries
  WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(in_lng, in_lat), 4326))
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
