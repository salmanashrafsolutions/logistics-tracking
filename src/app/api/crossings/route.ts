import { NextRequest, NextResponse } from 'next/server';
import { getBoundaryCrossings } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const vehicleId = searchParams.get('vehicle_id') || undefined;
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    const crossings = await getBoundaryCrossings(vehicleId, limit);
    return NextResponse.json({ crossings }, { status: 200 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
