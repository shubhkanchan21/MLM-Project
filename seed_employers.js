require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const employers = [
  { full_name: 'Acme Corp', email: 'hr@acme.example.com', mobile_number: '9000000001', state: 'CA', wages: 100000 },
  { full_name: 'Beta LLC', email: 'contact@beta.example.com', mobile_number: '9000000002', state: 'NY', wages: 50000 }
];

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA IF NOT EXISTS core`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS core.employers (
        id SERIAL PRIMARY KEY,
        full_name text NOT NULL,
        email text UNIQUE NOT NULL,
        mobile_number varchar(20),
        state text,
        wages numeric DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const insertText = `INSERT INTO core.employers
      (full_name, email, mobile_number, state, wages)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (email) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        mobile_number = EXCLUDED.mobile_number,
        state = EXCLUDED.state,
        wages = EXCLUDED.wages,
        updated_at = now()`;

    for (const e of employers) {
      await client.query(insertText, [e.full_name, e.email, e.mobile_number, e.state, e.wages]);
    }

    await client.query('COMMIT');
    console.log('Seed complete: inserted/updated', employers.length, 'employers');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) seed();
