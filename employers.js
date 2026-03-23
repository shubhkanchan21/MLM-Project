// helpers for the employer/member table
const { pool } = require('./index');

async function initEmployerTable() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS core`);
  await pool.query(`
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
  // ensure timestamp columns exist in case table already existed
  await pool.query(`
    ALTER TABLE core.employers
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()
  `);
  await pool.query(`
    ALTER TABLE core.employers
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `);
}

async function createEmployer({ full_name, email, mobile_number, state, wages }) {
  const result = await pool.query(
    `INSERT INTO core.employers (full_name, email, mobile_number, state, wages)
     VALUES ($1,$2,$3,$4,$5)
     RETURNING *`,
    [full_name, email, mobile_number || null, state || null, wages || 0]
  );
  return result.rows[0];
}

async function getEmployerById(id) {
  const result = await pool.query(
    `SELECT * FROM core.employers WHERE id = $1`,
    [id]
  );
  return result.rows[0];
}

module.exports = { initEmployerTable, createEmployer, getEmployerById };
