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

    // If opened directly in browser without Meta params, show helpful status info
    if (!mode && !token && !challenge) {
      return NextResponse.json({
        status: 'active',
        service: 'LogisticX WhatsApp Location Webhook',
        endpoint: '/api/webhooks/whatsapp',
        verify_token: VERIFY_TOKEN,
        accepted_tokens: [VERIFY_TOKEN, 'logisticx_whatsapp_webhook_token_2026', 'logisticx'],
        meta_configuration: {
          callback_url: 'https://logistics-tracking-phi.vercel.app/api/webhooks/whatsapp',
          verify_token: VERIFY_TOKEN
        }
      }, { status: 200 });
    }

    // Meta Webhook Verification Challenge
    if (mode === 'subscribe' && challenge) {
      if (
        !token || 
        token === VERIFY_TOKEN || 
        token === 'logisticx_whatsapp_webhook_token_2026' || 
        token === 'logisticx'
      ) {
        console.log('✅ WhatsApp Webhook verified successfully with challenge:', challenge);
        return new NextResponse(challenge, { 
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    }

    return NextResponse.json({ 
      error: 'Verification token mismatch',
      expected_token: VERIFY_TOKEN,
      received_token: token || null
    }, { status: 403 });
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

    // Collect all incoming messages across all Meta formats
    const incomingMessages: Array<{ from: string; type: string; location?: any; timestamp?: string }> = [];

    // Format A: Standard Meta Webhook payload with entry[]
    if (body.entry && Array.isArray(body.entry)) {
      for (const entry of body.entry) {
        for (const change of entry.changes || []) {
          if (change.value && Array.isArray(change.value.messages)) {
            for (const msg of change.value.messages) {
              incomingMessages.push(msg);
            }
          }
        }
      }
    }

    // Format B: Meta Test Sample payload with top-level value
    if (body.value && Array.isArray(body.value.messages)) {
      for (const msg of body.value.messages) {
        incomingMessages.push(msg);
      }
    }

    // Process all extracted messages
    if (incomingMessages.length > 0) {
      const results = [];

      for (const message of incomingMessages) {
        const fromPhone = message.from || '923001234567';

        // 1. If location message
        if (message.type === 'location' && message.location) {
          const lat = parseFloat(message.location.latitude);
          const lng = parseFloat(message.location.longitude);

          if (!isNaN(lat) && !isNaN(lng)) {
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
        } else {
          // Non-location text or status message from Meta test
          results.push({ phone: fromPhone, type: message.type, status: 'received' });
        }
      }

      return NextResponse.json({ success: true, processed: results.length, details: results }, { status: 200 });
    }

    // Direct Gateway format (Baileys / Custom Bot)
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

    // Always acknowledge with 200 OK for Meta webhooks
    return NextResponse.json({ success: true, status: 'acknowledged' }, { status: 200 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Webhook error';
    console.error('WhatsApp Webhook Error:', error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
