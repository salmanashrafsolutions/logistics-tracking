import { NextRequest, NextResponse } from 'next/server';
import { getVehicles, createOrUpdateVehicle, getDbStatus } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const vehicles = await getVehicles();
    const dbStatus = await getDbStatus();
    return NextResponse.json({ vehicles, dbStatus }, { status: 200 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id || !body.label) {
      return NextResponse.json(
        { error: 'Vehicle id and label are required' },
        { status: 400 }
      );
    }

    const vehicle = await createOrUpdateVehicle({
      id: body.id,
      label: body.label,
      plate_number: body.plate_number,
      driver_name: body.driver_name,
      phone_number: body.phone_number,
      status: body.status || 'active',
      current_tehsil: body.current_tehsil || null,
      current_district: body.current_district || null,
    });

    return NextResponse.json({ vehicle }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
