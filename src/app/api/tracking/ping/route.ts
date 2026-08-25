import { NextRequest, NextResponse } from 'next/server';
import { processLocationPing } from '@/lib/geocoding';
import { getRawPings } from '@/lib/db';
import { PingPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * POST /api/tracking/ping
 * Ingests a live location ping from driver phone / GPS tracker
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Check if batch pings payload
    if (body.pings && Array.isArray(body.pings) && body.pings.length > 0) {
      const vehicleId = body.vehicle_id || body.vehicleId;
      let lastResult: any = null;
      let count = 0;

      for (const p of body.pings) {
        const payload: PingPayload = {
          vehicle_id: p.vehicle_id || p.vehicleId || vehicleId,
          lat: parseFloat(p.lat || p.latitude),
          lng: parseFloat(p.lng || p.longitude),
          accuracy_m: p.accuracy_m !== undefined ? parseFloat(p.accuracy_m) : (p.accuracy ? parseFloat(p.accuracy) : undefined),
          speed: p.speed !== undefined ? parseFloat(p.speed) : undefined,
          heading: p.heading !== undefined ? parseFloat(p.heading) : undefined,
          battery_level: p.battery_level !== undefined ? parseFloat(p.battery_level) : undefined,
          timestamp: p.timestamp || p.recorded_at || new Date().toISOString()
        };

        if (payload.vehicle_id && !isNaN(payload.lat) && !isNaN(payload.lng)) {
          lastResult = await processLocationPing(payload);
          count++;
        }
      }

      return NextResponse.json({
        success: true,
        processed: count,
        last_result: lastResult
      }, { status: 200 });
    }

    const payload: PingPayload = {
      vehicle_id: body.vehicle_id || body.vehicleId,
      lat: parseFloat(body.lat || body.latitude),
      lng: parseFloat(body.lng || body.longitude),
      accuracy_m: body.accuracy_m !== undefined ? parseFloat(body.accuracy_m) : (body.accuracy ? parseFloat(body.accuracy) : undefined),
      speed: body.speed !== undefined ? parseFloat(body.speed) : undefined,
      heading: body.heading !== undefined ? parseFloat(body.heading) : undefined,
      battery_level: body.battery_level !== undefined ? parseFloat(body.battery_level) : undefined,
      timestamp: body.timestamp || body.recorded_at || new Date().toISOString()
    };

    if (!payload.vehicle_id || isNaN(payload.lat) || isNaN(payload.lng)) {
      return NextResponse.json(
        { error: 'Missing required parameters: vehicle_id, lat, lng' },
        { status: 400 }
      );
    }

    const result = await processLocationPing(payload);
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal Server Error';
    console.error('Error processing ping:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * GET /api/tracking/ping?vehicle_id=...&limit=100
 * Fetches recent location pings
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const vehicleId = searchParams.get('vehicle_id') || undefined;
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const pings = await getRawPings(vehicleId, limit);
    return NextResponse.json({ pings }, { status: 200 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
