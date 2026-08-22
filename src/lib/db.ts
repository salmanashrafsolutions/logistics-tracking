import { Pool } from 'pg';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Vehicle, RawPing, BoundaryCrossing, TehsilLookupResult } from './types';
import tehsilsGeoJSON from '../data/pakistan_tehsils.json';

// In-Memory store for offline/demo/testing mode when no PostgreSQL connection is provided
const memoryStore = {
  vehicles: [
    {
      id: 'v-truck-12',
      label: 'Truck 12 - Driver Imran',
      plate_number: 'LEA-2024-88',
      driver_name: 'Imran Khan',
      phone_number: '+92 300 1234567',
      status: 'active' as const,
      current_tehsil: 'Model Town',
      current_district: 'Lahore',
      last_ping_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    },
    {
      id: 'v-van-04',
      label: 'Delivery Van 04 - Driver Tariq',
      plate_number: 'ICT-2023-14',
      driver_name: 'Tariq Mehmood',
      phone_number: '+92 321 9876543',
      status: 'active' as const,
      current_tehsil: 'Islamabad',
      current_district: 'Islamabad',
      last_ping_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    }
  ] as Vehicle[],
  rawPings: [] as RawPing[],
  boundaryCrossings: [] as BoundaryCrossing[],
};

// PostgreSQL Connection Pool
let pgPool: Pool | null = null;
if (process.env.DATABASE_URL) {
  try {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
    });
  } catch (e) {
    console.warn('Failed to initialize Postgres Pool, falling back to memory store', e);
  }
}

// Supabase Client
let supabase: SupabaseClient | null = null;
if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  try {
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  } catch (e) {
    console.warn('Failed to initialize Supabase client, falling back to memory store', e);
  }
}

export async function getDbStatus(): Promise<{
  mode: 'postgres' | 'supabase' | 'in-memory';
  connected: boolean;
}> {
  if (pgPool) {
    try {
      await pgPool.query('SELECT 1');
      return { mode: 'postgres', connected: true };
    } catch {
      // ignore
    }
  }
  if (supabase) {
    return { mode: 'supabase', connected: true };
  }
  return { mode: 'in-memory', connected: true };
}

// Vehicle operations
export async function getVehicles(): Promise<Vehicle[]> {
  if (pgPool) {
    try {
      const res = await pgPool.query('SELECT * FROM vehicles ORDER BY created_at DESC');
      return res.rows;
    } catch (e) {
      console.warn('Postgres query error in getVehicles:', e);
    }
  }
  return memoryStore.vehicles;
}

export async function getVehicleById(vehicleId: string): Promise<Vehicle | null> {
  if (pgPool) {
    try {
      const res = await pgPool.query('SELECT * FROM vehicles WHERE id = $1', [vehicleId]);
      if (res.rows.length > 0) return res.rows[0];
    } catch (e) {
      console.warn('Postgres query error in getVehicleById:', e);
    }
  }
  return memoryStore.vehicles.find(v => v.id === vehicleId) || null;
}

export async function createOrUpdateVehicle(vehicle: Partial<Vehicle> & { id: string; label: string }): Promise<Vehicle> {
  if (pgPool) {
    try {
      const query = `
        INSERT INTO vehicles (id, label, plate_number, driver_name, phone_number, status, current_tehsil, current_district, last_ping_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
        ON CONFLICT (id) DO UPDATE SET
          label = EXCLUDED.label,
          plate_number = COALESCE(EXCLUDED.plate_number, vehicles.plate_number),
          driver_name = COALESCE(EXCLUDED.driver_name, vehicles.driver_name),
          phone_number = COALESCE(EXCLUDED.phone_number, vehicles.phone_number),
          status = COALESCE(EXCLUDED.status, vehicles.status),
          current_tehsil = COALESCE(EXCLUDED.current_tehsil, vehicles.current_tehsil),
          current_district = COALESCE(EXCLUDED.current_district, vehicles.current_district),
          last_ping_at = NOW()
        RETURNING *;
      `;
      const res = await pgPool.query(query, [
        vehicle.id,
        vehicle.label,
        vehicle.plate_number || null,
        vehicle.driver_name || null,
        vehicle.phone_number || null,
        vehicle.status || 'active',
        vehicle.current_tehsil || null,
        vehicle.current_district || null,
      ]);
      return res.rows[0];
    } catch (e) {
      console.warn('Postgres error in createOrUpdateVehicle:', e);
    }
  }

  const existingIdx = memoryStore.vehicles.findIndex(v => v.id === vehicle.id);
  const updated: Vehicle = {
    id: vehicle.id,
    label: vehicle.label,
    plate_number: vehicle.plate_number || (existingIdx >= 0 ? memoryStore.vehicles[existingIdx].plate_number : undefined),
    driver_name: vehicle.driver_name || (existingIdx >= 0 ? memoryStore.vehicles[existingIdx].driver_name : undefined),
    phone_number: vehicle.phone_number || (existingIdx >= 0 ? memoryStore.vehicles[existingIdx].phone_number : undefined),
    status: vehicle.status || 'active',
    current_tehsil: vehicle.current_tehsil !== undefined ? vehicle.current_tehsil : (existingIdx >= 0 ? memoryStore.vehicles[existingIdx].current_tehsil : null),
    current_district: vehicle.current_district !== undefined ? vehicle.current_district : (existingIdx >= 0 ? memoryStore.vehicles[existingIdx].current_district : null),
    last_ping_at: new Date().toISOString(),
    created_at: existingIdx >= 0 ? memoryStore.vehicles[existingIdx].created_at : new Date().toISOString()
  };

  if (existingIdx >= 0) {
    memoryStore.vehicles[existingIdx] = updated;
  } else {
    memoryStore.vehicles.unshift(updated);
  }
  return updated;
}

// Ingest location ping
export async function insertRawPing(ping: RawPing): Promise<RawPing> {
  if (pgPool) {
    try {
      const query = `
        INSERT INTO raw_pings (vehicle_id, lat, lng, accuracy_m, speed, heading, battery_level, recorded_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
      `;
      const res = await pgPool.query(query, [
        ping.vehicle_id,
        ping.lat,
        ping.lng,
        ping.accuracy_m || null,
        ping.speed || null,
        ping.heading || null,
        ping.battery_level || null,
        ping.recorded_at || new Date().toISOString()
      ]);
      return res.rows[0];
    } catch (e) {
      console.warn('Postgres error in insertRawPing:', e);
    }
  }

  const savedPing: RawPing = {
    ...ping,
    id: memoryStore.rawPings.length + 1,
    server_received_at: new Date().toISOString()
  };
  memoryStore.rawPings.push(savedPing);
  return savedPing;
}

// Record boundary crossing
export async function insertBoundaryCrossing(crossing: BoundaryCrossing): Promise<BoundaryCrossing> {
  if (pgPool) {
    try {
      const query = `
        INSERT INTO boundary_crossings (vehicle_id, from_tehsil, to_tehsil, from_district, to_district, lat, lng, accuracy_m, crossed_at, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *;
      `;
      const res = await pgPool.query(query, [
        crossing.vehicle_id,
        crossing.from_tehsil,
        crossing.to_tehsil,
        crossing.from_district || null,
        crossing.to_district || null,
        crossing.lat,
        crossing.lng,
        crossing.accuracy_m || null,
        crossing.crossed_at || new Date().toISOString(),
        crossing.notes || null
      ]);
      return res.rows[0];
    } catch (e) {
      console.warn('Postgres error in insertBoundaryCrossing:', e);
    }
  }

  const savedCrossing: BoundaryCrossing = {
    ...crossing,
    id: memoryStore.boundaryCrossings.length + 1
  };
  memoryStore.boundaryCrossings.unshift(savedCrossing);
  return savedCrossing;
}

// Fetch crossings
export async function getBoundaryCrossings(vehicleId?: string, limit = 50): Promise<BoundaryCrossing[]> {
  if (pgPool) {
    try {
      if (vehicleId) {
        const res = await pgPool.query(
          'SELECT * FROM boundary_crossings WHERE vehicle_id = $1 ORDER BY crossed_at DESC LIMIT $2',
          [vehicleId, limit]
        );
        return res.rows;
      }
      const res = await pgPool.query(
        'SELECT * FROM boundary_crossings ORDER BY crossed_at DESC LIMIT $1',
        [limit]
      );
      return res.rows;
    } catch (e) {
      console.warn('Postgres error in getBoundaryCrossings:', e);
    }
  }

  if (vehicleId) {
    return memoryStore.boundaryCrossings.filter(c => c.vehicle_id === vehicleId).slice(0, limit);
  }
  return memoryStore.boundaryCrossings.slice(0, limit);
}

// Fetch raw pings
export async function getRawPings(vehicleId?: string, limit = 100): Promise<RawPing[]> {
  if (pgPool) {
    try {
      if (vehicleId) {
        const res = await pgPool.query(
          'SELECT * FROM raw_pings WHERE vehicle_id = $1 ORDER BY recorded_at DESC LIMIT $2',
          [vehicleId, limit]
        );
        return res.rows;
      }
      const res = await pgPool.query(
        'SELECT * FROM raw_pings ORDER BY recorded_at DESC LIMIT $1',
        [limit]
      );
      return res.rows;
    } catch (e) {
      console.warn('Postgres error in getRawPings:', e);
    }
  }

  if (vehicleId) {
    return memoryStore.rawPings
      .filter(p => p.vehicle_id === vehicleId)
      .slice(-limit)
      .reverse();
  }
  return memoryStore.rawPings.slice(-limit).reverse();
}

// Lookup Tehsil using PostGIS or fallback
export async function queryPostGISTehsil(lat: number, lng: number): Promise<TehsilLookupResult | null> {
  if (pgPool) {
    try {
      const query = `
        SELECT id, name, district, province, code
        FROM tehsil_boundaries
        WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
        LIMIT 1;
      `;
      const res = await pgPool.query(query, [lng, lat]);
      if (res.rows.length > 0) {
        return res.rows[0];
      }
    } catch (e) {
      console.warn('PostGIS query error, using spatial fallback:', e);
    }
  }
  return null;
}
