// helpers for the employees table
const { pool } = require('./index');

async function initEmployeeTable() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS core`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS core.employees (
      id SERIAL PRIMARY KEY,
      user_id varchar(32) UNIQUE,
      full_name text NOT NULL,
      email text UNIQUE NOT NULL,
      mobile_number varchar(20) UNIQUE,
      joining_date date NOT NULL,
      level text,
      payment_status text NOT NULL DEFAULT 'NOT_COMPLETED',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  // Ensure backward compatibility with older table shape.
  await pool.query(`
    ALTER TABLE core.employees
    ADD COLUMN IF NOT EXISTS user_id varchar(32)
  `);
  await pool.query(`
    ALTER TABLE core.employees
    ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now()
  `);
  await pool.query(`
    ALTER TABLE core.employees
    ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()
  `);
  await pool.query(`
    ALTER TABLE core.employees
    ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'NOT_COMPLETED'
  `);
  await pool.query(`
    CREATE SEQUENCE IF NOT EXISTS core.employees_id_seq
  `);
  await pool.query(`
    ALTER TABLE core.employees
    ALTER COLUMN id SET DEFAULT nextval('core.employees_id_seq')
  `);
  await pool.query(`
    ALTER SEQUENCE core.employees_id_seq OWNED BY core.employees.id
  `).catch(() => {});

  await pool.query(`
    ALTER TABLE core.employees
    ADD CONSTRAINT employees_payment_status_chk
    CHECK (payment_status IN ('COMPLETED', 'NOT_COMPLETED'))
  `).catch(() => {});

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS employees_user_id_uq
    ON core.employees(user_id)
    WHERE user_id IS NOT NULL
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS employees_mobile_number_uq
    ON core.employees(mobile_number)
    WHERE mobile_number IS NOT NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS employees_search_idx
    ON core.employees (id, user_id, full_name, email, mobile_number)
  `);

  // Backfill user_id for existing rows that don't have one yet.
  await pool.query(`
    UPDATE core.employees
    SET user_id = 'EMP' || LPAD(id::text, 5, '0')
    WHERE user_id IS NULL
  `);
  await pool.query(`
    SELECT setval(
      'core.employees_id_seq',
      COALESCE((SELECT MAX(id) FROM core.employees), 0),
      true
    )
  `);
}

async function createEmployee({ user_id, full_name, email, mobile_number, joining_date, level, payment_status }) {
  const result = await pool.query(
    `WITH seq AS (
       SELECT pg_get_serial_sequence('core.employees', 'id') AS seq_name
     ),
     next_id AS (
       SELECT CASE
         WHEN seq_name IS NOT NULL THEN nextval(seq_name::regclass)::int
         ELSE (SELECT COALESCE(MAX(id), 0) + 1 FROM core.employees)
       END AS id_val
       FROM seq
     )
     INSERT INTO core.employees
     (id, user_id, full_name, email, mobile_number, joining_date, level, payment_status)
     SELECT
       id_val,
       COALESCE($1, 'EMP' || LPAD(id_val::text, 5, '0')),
       $2, $3, $4, $5, $6, $7
     FROM next_id
     RETURNING *`,
    [user_id || null, full_name, email, mobile_number || null, joining_date, level || null, payment_status || 'NOT_COMPLETED']
  );
  return result.rows[0];
}

async function createEmployeesBulk(employees) {
  const client = await pool.connect();
  const created = [];
  try {
    await client.query('BEGIN');
    for (const emp of employees) {
      const result = await client.query(
        `WITH seq AS (
           SELECT pg_get_serial_sequence('core.employees', 'id') AS seq_name
         ),
         next_id AS (
           SELECT CASE
             WHEN seq_name IS NOT NULL THEN nextval(seq_name::regclass)::int
             ELSE (SELECT COALESCE(MAX(id), 0) + 1 FROM core.employees)
           END AS id_val
           FROM seq
         )
         INSERT INTO core.employees
         (id, user_id, full_name, email, mobile_number, joining_date, level, payment_status)
         SELECT
           id_val,
           COALESCE($1, 'EMP' || LPAD(id_val::text, 5, '0')),
           $2, $3, $4, $5, $6, $7
         FROM next_id
         RETURNING *`,
        [
          emp.user_id || null,
          emp.full_name,
          emp.email,
          emp.mobile_number || null,
          emp.joining_date,
          emp.level || null,
          emp.payment_status || 'NOT_COMPLETED'
        ]
      );
      created.push(result.rows[0]);
    }
    await client.query('COMMIT');
    return created;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getAllEmployees({ search }) {
  const selectColumns = `
    SELECT
      id,
      user_id,
      full_name,
      email,
      mobile_number,
      joining_date::text AS joining_date,
      level,
      payment_status,
      created_at,
      updated_at
    FROM core.employees
  `;
  if (!search) {
    const result = await pool.query(`${selectColumns} ORDER BY id`);
    return result.rows;
  }

  const term = String(search).trim();
  const q = `%${term}%`;
  const idNumber = Number(term);

  // If user types a numeric id like "62", resolve to exact DB id or exact user_id (EMP00062).
  if (/^\d+$/.test(term) && Number.isFinite(idNumber)) {
    const padded = `EMP${term.padStart(5, '0')}`;
    const exact = await pool.query(
      `${selectColumns}
       WHERE id = $1 OR user_id = $2
       ORDER BY id`,
      [idNumber, padded]
    );
    if (exact.rowCount > 0) {
      return exact.rows;
    }
  }

  const result = await pool.query(
    `${selectColumns}
     WHERE
       user_id ILIKE $1 OR
       full_name ILIKE $1 OR
       email ILIKE $1 OR
       mobile_number ILIKE $1 OR
       ($2::int IS NOT NULL AND id = $2)
     ORDER BY id`,
    [q, Number.isFinite(idNumber) ? idNumber : null]
  );
  return result.rows;
}

async function getEmployeeById(id) {
  const result = await pool.query(
    `SELECT
      id,
      user_id,
      full_name,
      email,
      mobile_number,
      joining_date::text AS joining_date,
      level,
      payment_status,
      created_at,
      updated_at
     FROM core.employees WHERE id = $1`,
    [id]
  );
  return result.rows[0];
}

module.exports = { initEmployeeTable, createEmployee, createEmployeesBulk, getAllEmployees, getEmployeeById };
