import { NextResponse } from 'next/server';
import tehsilsGeoJSON from '@/data/pakistan_tehsils.json';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(tehsilsGeoJSON, { status: 200 });
}
