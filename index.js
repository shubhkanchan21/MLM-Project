// centralized database connection helper
const path = require('path');
const envPath = path.join(__dirname, '..', 'database(sql)', '.env');
const fallbackEnvPath = path.join(__dirname, '..', '.env');

try {
  require('dotenv').config({ path: envPath });
} catch {
  // fallback when dependencies are installed only under database(sql)/node_modules
  try {
    require(path.join(__dirname, '..', 'database(sql)', 'node_modules', 'dotenv')).config({ path: envPath });
  } catch {}
}

// If database(sql)/.env is missing, also support root .env
if (!process.env.DB_HOST && !process.env.DB_USER) {
  try {
    require('dotenv').config({ path: fallbackEnvPath });
  } catch {
    try {
      require(path.join(__dirname, '..', 'database(sql)', 'node_modules', 'dotenv')).config({ path: fallbackEnvPath });
    } catch {}
  }
}

let Pool;
try {
  ({ Pool } = require('pg'));
} catch {
  ({ Pool } = require(path.join(__dirname, '..', 'database(sql)', 'node_modules', 'pg')));
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function query(text, params) {
  return pool.query(text, params);
}

module.exports = { pool, query };
