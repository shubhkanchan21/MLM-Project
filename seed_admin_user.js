require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const bcrypt = require('bcrypt');

const ADMIN_ID = 'aditya31';
const ADMIN_PASSWORD = 'adi55';
const CLIENT_NAME = 'Primary Client';

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function seedAdmin() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE SCHEMA IF NOT EXISTS core');

    await client.query(`
      CREATE TABLE IF NOT EXISTS core.clients (
        id SERIAL PRIMARY KEY,
        name text NOT NULL,
        status text NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS core.users (
        id SERIAL PRIMARY KEY,
        client_id int NOT NULL REFERENCES core.clients(id),
        email text NOT NULL UNIQUE,
        role text NOT NULL,
        password_hash text NOT NULL,
        sponsor_id int NULL REFERENCES core.users(id),
        status text NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const clientResult = await client.query(
      `INSERT INTO core.clients (name)
       VALUES ($1)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [CLIENT_NAME]
    );

    let clientId;
    if (clientResult.rowCount > 0) {
      clientId = clientResult.rows[0].id;
    } else {
      const existingClient = await client.query(
        `SELECT id FROM core.clients ORDER BY id ASC LIMIT 1`
      );
      clientId = existingClient.rows[0].id;
    }

    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);

    const userResult = await client.query(
      `INSERT INTO core.users (client_id, email, role, password_hash, sponsor_id, status)
       VALUES ($1, $2, 'admin', $3, NULL, 'active')
       ON CONFLICT (email) DO UPDATE SET
         role = 'admin',
         password_hash = EXCLUDED.password_hash,
         status = 'active'
       RETURNING id, email, role, client_id`,
      [clientId, ADMIN_ID, hash]
    );

    await client.query('COMMIT');
    console.log('Admin user seeded:', userResult.rows[0]);
    console.log('Login ID:', ADMIN_ID);
    console.log('Login Password:', ADMIN_PASSWORD);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed admin failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seedAdmin();
}
