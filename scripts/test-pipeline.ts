import { resolveTehsil, processLocationPing } from '../src/lib/geocoding';

async function runTests() {
  console.log('--- TEST 1: Direct Tehsil Resolution ---');
  const cantt = await resolveTehsil(31.5150, 74.4100);
  console.log('Coords (31.5150, 74.4100) ->', cantt?.name, `(${cantt?.district})`);
  if (cantt?.name !== 'Lahore Cantt') throw new Error(`Expected Lahore Cantt, got ${cantt?.name}`);

  const modelTown = await resolveTehsil(31.4850, 74.3500);
  console.log('Coords (31.4850, 74.3500) ->', modelTown?.name, `(${modelTown?.district})`);
  if (modelTown?.name !== 'Model Town') throw new Error(`Expected Model Town, got ${modelTown?.name}`);

  const kasur = await resolveTehsil(31.1150, 74.4500);
  console.log('Coords (31.1150, 74.4500) ->', kasur?.name, `(${kasur?.district})`);
  if (kasur?.name !== 'Kasur') throw new Error(`Expected Kasur, got ${kasur?.name}`);

  const isb = await resolveTehsil(33.6800, 73.0700);
  console.log('Coords (33.6800, 73.0700) ->', isb?.name, `(${isb?.district})`);
  if (isb?.name !== 'Islamabad') throw new Error(`Expected Islamabad, got ${isb?.name}`);

  console.log('\n--- TEST 2: Multi-Hop Boundary Crossing Ingest Pipeline ---');
  const testVehicleId = 'v-test-qa-01';

  // Step 1: Start in Lahore Cantt
  const ping1 = await processLocationPing({
    vehicle_id: testVehicleId,
    lat: 31.5150,
    lng: 74.4100,
    accuracy_m: 5.0,
    timestamp: new Date().toISOString()
  });
  console.log('Ping 1 (Cantt):', ping1.current_tehsil, '| Crossing detected:', ping1.crossing_detected);

  // Step 2: Move within Lahore Cantt
  const ping2 = await processLocationPing({
    vehicle_id: testVehicleId,
    lat: 31.5000,
    lng: 74.3900,
    accuracy_m: 5.0,
    timestamp: new Date().toISOString()
  });
  console.log('Ping 2 (Cantt internal):', ping2.current_tehsil, '| Crossing detected:', ping2.crossing_detected);
  if (ping2.crossing_detected) throw new Error('Should NOT trigger crossing for same tehsil');

  // Step 3: Cross into Model Town
  const ping3 = await processLocationPing({
    vehicle_id: testVehicleId,
    lat: 31.4850,
    lng: 74.3500,
    accuracy_m: 5.0,
    timestamp: new Date().toISOString()
  });
  console.log('Ping 3 (Model Town):', ping3.current_tehsil, '| Crossing detected:', ping3.crossing_detected);
  console.log('  -> From:', ping3.crossing?.from_tehsil, 'To:', ping3.crossing?.to_tehsil);
  if (!ping3.crossing_detected) throw new Error('Should trigger crossing when entering Model Town');
  if (ping3.crossing?.from_tehsil !== 'Lahore Cantt' || ping3.crossing?.to_tehsil !== 'Model Town') {
    throw new Error('Crossing metadata mismatch for Model Town transition');
  }

  // Step 4: Cross into Kasur
  const ping4 = await processLocationPing({
    vehicle_id: testVehicleId,
    lat: 31.1150,
    lng: 74.4500,
    accuracy_m: 5.0,
    timestamp: new Date().toISOString()
  });
  console.log('Ping 4 (Kasur):', ping4.current_tehsil, '| Crossing detected:', ping4.crossing_detected);
  console.log('  -> From:', ping4.crossing?.from_tehsil, 'To:', ping4.crossing?.to_tehsil);
  if (!ping4.crossing_detected) throw new Error('Should trigger crossing when entering Kasur');
  if (ping4.crossing?.from_tehsil !== 'Model Town' || ping4.crossing?.to_tehsil !== 'Kasur') {
    throw new Error('Crossing metadata mismatch for Kasur transition');
  }

  console.log('\n🎉 ALL AUTOMATED PIPELINE TESTS PASSED SUCCESSFUL!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
