import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

async function seedBoundaries() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ Error: DATABASE_URL environment variable is required.');
    console.log('Usage: DATABASE_URL="postgresql://..." node scripts/seed-boundaries.mjs');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    console.log('Connecting to PostgreSQL/PostGIS database...');
    await pool.query('SELECT 1');
    console.log('✅ Connected successfully.');

    // Ensure PostGIS extension
    await pool.query('CREATE EXTENSION IF NOT EXISTS postgis;');

    // Read GeoJSON file
    const geoJsonPath = resolve(__dirname, '../src/data/pakistan_tehsils.json');
    const rawData = readFileSync(geoJsonPath, 'utf8');
    const geojson = JSON.parse(rawData);

    console.log(`Found ${geojson.features.length} Tehsil boundary features to import...`);

    for (const feature of geojson.features) {
      const { name, district, province, code } = feature.properties;
      const geomString = JSON.stringify(feature.geometry);

      const query = `
        INSERT INTO tehsil_boundaries (name, district, province, code, geom)
        VALUES ($1, $2, $3, $4, ST_Multi(ST_GeomFromGeoJSON($5)))
        ON CONFLICT DO NOTHING;
      `;

      await pool.query(query, [name, district, province, code, geomString]);
      console.log(`  ✓ Imported Tehsil: ${name} (${district}, ${province})`);
    }

    console.log('\n🎉 Successfully seeded all Tehsil boundaries into PostGIS!');
  } catch (error) {
    console.error('❌ Failed to seed boundaries:', error);
  } finally {
    await pool.end();
  }
}

seedBoundaries();
