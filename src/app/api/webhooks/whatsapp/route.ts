import { NextRequest, NextResponse } from 'next/server';
import { processLocationPing } from '@/lib/geocoding';
import { getVehicles, createOrUpdateVehicle } from '@/lib/db';
import { PingPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

const VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || 'logisticx_whatsapp_webhook_token_2026';

/**
 * GET /api/webhooks/whatsapp
 * Meta WhatsApp Cloud API Webhook Verification Challenge
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ WhatsApp Webhook verified successfully');
      return new NextResponse(challenge, { status: 200 });
    }

    return NextResponse.json({ error: 'Verification token mismatch' }, { status: 403 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * POST /api/webhooks/whatsapp
 * Ingests incoming location messages (Static & Live Location) from WhatsApp
 * Compatible with Meta WhatsApp Cloud API & WhatsApp Web Gateways (Baileys/WPPConnect)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 1. Check for Meta WhatsApp Cloud API format
    if (body.object === 'whatsapp_business_account' && body.entry) {
      const results = [];

      for (const entry of body.entry) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const value = change.value;
          if (value && value.messages) {
            for (const message of value.messages) {
              const fromPhone = message.from; // Driver phone number (e.g. 923001234567)

              // Check if location message
              if (message.type === 'location' && message.location) {
                const lat = parseFloat(message.location.latitude);
                const lng = parseFloat(message.location.longitude);

                if (!isNaN(lat) && !isNaN(lng)) {
                  // Find or auto-create vehicle for this driver phone
                  const vehicles = await getVehicles();
                  let vehicle = vehicles.find(
                    (v) => v.phone_number === fromPhone || v.id === `wa-${fromPhone}`
                  );

                  if (!vehicle) {
                    vehicle = await createOrUpdateVehicle({
                      id: `wa-${fromPhone}`,
                      label: `Truck (${fromPhone})`,
                      driver_name: `Driver ${fromPhone.slice(-4)}`,
                      phone_number: fromPhone,
                      plate_number: `WA-${fromPhone.slice(-4)}`
                    });
                  }

                  const pingPayload: PingPayload = {
                    vehicle_id: vehicle.id,
                    lat,
                    lng,
                    accuracy_m: 10,
                    timestamp: message.timestamp 
                      ? new Date(parseInt(message.timestamp, 10) * 1000).toISOString()
                      : new Date().toISOString()
                  };

                  const result = await processLocationPing(pingPayload);
                  results.push({ phone: fromPhone, result });
                }
              }
            }
          }
        }
      }

      return NextResponse.json({ success: true, processed: results.length, details: results }, { status: 200 });
    }

    // 2. Check for Direct WhatsApp Gateway format (Baileys / WPPConnect / Custom Bot)
    if (body.phone && (body.lat || body.latitude) && (body.lng || body.longitude)) {
      const fromPhone = String(body.phone).replace(/[^0-9]/g, '');
      const lat = parseFloat(body.lat || body.latitude);
      const lng = parseFloat(body.lng || body.longitude);
      const speed = body.speed !== undefined ? parseFloat(body.speed) : undefined;
      const heading = body.heading !== undefined ? parseFloat(body.heading) : undefined;
      const accuracy = body.accuracy !== undefined ? parseFloat(body.accuracy) : 10;

      const vehicles = await getVehicles();
      let vehicle = vehicles.find(
        (v) => v.phone_number === fromPhone || v.id === `wa-${fromPhone}`
      );

      if (!vehicle) {
        vehicle = await createOrUpdateVehicle({
          id: `wa-${fromPhone}`,
          label: body.driver_name ? `Truck (${body.driver_name})` : `Truck (${fromPhone})`,
          driver_name: body.driver_name || `Driver ${fromPhone.slice(-4)}`,
          phone_number: fromPhone,
          plate_number: body.plate_number || `WA-${fromPhone.slice(-4)}`
        });
      }

      const pingPayload: PingPayload = {
        vehicle_id: vehicle.id,
        lat,
        lng,
        speed,
        heading,
        accuracy_m: accuracy,
        timestamp: body.timestamp || new Date().toISOString()
      };

      const result = await processLocationPing(pingPayload);
      return NextResponse.json({ success: true, vehicle_id: vehicle.id, result }, { status: 200 });
    }

    // Default acknowledge to keep webhook active
    return NextResponse.json({ status: 'ignored_non_location_event' }, { status: 200 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Webhook error';
    console.error('WhatsApp Webhook Error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
