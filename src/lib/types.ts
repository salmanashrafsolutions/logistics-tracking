export interface Vehicle {
  id: string;
  label: string;
  plate_number?: string;
  driver_name?: string;
  phone_number?: string;
  status?: 'active' | 'idle' | 'offline';
  current_tehsil?: string | null;
  current_district?: string | null;
  last_ping_at?: string | null;
  created_at?: string;
}

export interface RawPing {
  id?: number | string;
  vehicle_id: string;
  lat: number;
  lng: number;
  accuracy_m?: number;
  speed?: number | null;
  heading?: number | null;
  battery_level?: number | null;
  recorded_at: string;
  server_received_at?: string;
}

export interface BoundaryCrossing {
  id?: number | string;
  vehicle_id: string;
  from_tehsil: string | null;
  to_tehsil: string;
  from_district?: string | null;
  to_district?: string | null;
  lat: number;
  lng: number;
  accuracy_m?: number;
  crossed_at: string;
  notes?: string;
}

export interface TehsilLookupResult {
  id?: number | string;
  name: string;
  district: string;
  province: string;
  code?: string;
}

export interface PingPayload {
  vehicle_id: string;
  lat: number;
  lng: number;
  accuracy_m?: number;
  speed?: number | null;
  heading?: number | null;
  battery_level?: number | null;
  timestamp?: string | number;
}

export interface PingResponse {
  success: boolean;
  ping_id?: number | string;
  vehicle_id: string;
  current_tehsil: string | null;
  current_district: string | null;
  crossing_detected: boolean;
  crossing?: BoundaryCrossing | null;
  timestamp: string;
  message?: string;
}

export interface TehsilGeoJSONFeature {
  type: 'Feature';
  properties: {
    id?: number | string;
    name: string;
    district: string;
    province: string;
    code?: string;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

export interface TehsilFeatureCollection {
  type: 'FeatureCollection';
  features: TehsilGeoJSONFeature[];
}
