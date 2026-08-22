import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point as turfPoint } from '@turf/helpers';
import tehsilsGeoJSON from '../data/pakistan_tehsils.json';
import { TehsilLookupResult, PingPayload, PingResponse, RawPing, BoundaryCrossing, TehsilFeatureCollection } from './types';
import {
  queryPostGISTehsil,
  getVehicleById,
  createOrUpdateVehicle,
  insertRawPing,
  insertBoundaryCrossing
} from './db';

const tehsils = tehsilsGeoJSON as unknown as TehsilFeatureCollection;

/**
 * Resolves a given Lat/Lng to a Pakistan Tehsil.
 * First tries PostGIS (if active), then falls back to local Turf.js point-in-polygon.
 */
export async function resolveTehsil(lat: number, lng: number): Promise<TehsilLookupResult | null> {
  // 1. PostGIS Database query
  try {
    const postgisResult = await queryPostGISTehsil(lat, lng);
    if (postgisResult) {
      return postgisResult;
    }
  } catch (err) {
    console.warn('PostGIS lookup failed, falling back to local GeoJSON', err);
  }

  // 2. Spatial Fallback with Turf.js
  const pt = turfPoint([lng, lat]); // GeoJSON is [lng, lat]

  for (const feature of tehsils.features) {
    try {
      // @ts-expect-error Turf polygon coordinate types
      if (booleanPointInPolygon(pt, feature)) {
        return {
          id: feature.properties.id,
          name: feature.properties.name,
          district: feature.properties.district,
          province: feature.properties.province,
          code: feature.properties.code
        };
      }
    } catch {
      // ignore polygon parsing errors
    }
  }

  return null;
}

/**
 * Ingests a raw location ping, resolves tehsil, detects boundary crossings,
 * and updates vehicle status.
 */
export async function processLocationPing(payload: PingPayload): Promise<PingResponse> {
  const { vehicle_id, lat, lng, accuracy_m, speed, heading, battery_level, timestamp } = payload;

  if (typeof lat !== 'number' || typeof lng !== 'number' || !vehicle_id) {
    throw new Error('Invalid payload: vehicle_id, lat, and lng are required.');
  }

  const recordedAt = timestamp 
    ? (typeof timestamp === 'number' ? new Date(timestamp).toISOString() : new Date(timestamp).toISOString())
    : new Date().toISOString();

  // 1. Insert into raw_pings (Append-only)
  const rawPing: RawPing = {
    vehicle_id,
    lat,
    lng,
    accuracy_m: accuracy_m || 10,
    speed: speed || null,
    heading: heading || null,
    battery_level: battery_level !== undefined ? battery_level : null,
    recorded_at: recordedAt
  };
  const savedPing = await insertRawPing(rawPing);

  // 2. Resolve current Tehsil
  const resolved = await resolveTehsil(lat, lng);
  const currentTehsil = resolved ? resolved.name : 'Unknown Tehsil';
  const currentDistrict = resolved ? resolved.district : 'Unknown District';

  // 3. Check previous vehicle state for boundary crossing
  const vehicle = await getVehicleById(vehicle_id);
  const previousTehsil = vehicle?.current_tehsil || null;
  const previousDistrict = vehicle?.current_district || null;

  let crossingDetected = false;
  let savedCrossing: BoundaryCrossing | null = null;

  // Boundary Crossing Condition:
  // - Previous Tehsil was known and differs from current resolved Tehsil, OR
  // - First initial registration if vehicle had no previous tehsil.
  if (resolved && previousTehsil && previousTehsil !== currentTehsil) {
    crossingDetected = true;
    const crossingData: BoundaryCrossing = {
      vehicle_id,
      from_tehsil: previousTehsil,
      to_tehsil: currentTehsil,
      from_district: previousDistrict,
      to_district: currentDistrict,
      lat,
      lng,
      accuracy_m: accuracy_m || 10,
      crossed_at: recordedAt,
      notes: `Transitioned from ${previousTehsil} (${previousDistrict || ''}) to ${currentTehsil} (${currentDistrict})`
    };
    savedCrossing = await insertBoundaryCrossing(crossingData);
  }

  // 4. Update Vehicle State
  await createOrUpdateVehicle({
    id: vehicle_id,
    label: vehicle?.label || `Vehicle ${vehicle_id}`,
    current_tehsil: currentTehsil,
    current_district: currentDistrict,
    status: 'active'
  });

  return {
    success: true,
    ping_id: savedPing.id,
    vehicle_id,
    current_tehsil: currentTehsil,
    current_district: currentDistrict,
    crossing_detected: crossingDetected,
    crossing: savedCrossing,
    timestamp: recordedAt,
    message: crossingDetected 
      ? `Boundary crossed! Entered ${currentTehsil} from ${previousTehsil}`
      : `Ping recorded in ${currentTehsil}`
  };
}
