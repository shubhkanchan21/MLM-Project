require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000
});

(async ()=>{
  try{
    const client = await pool.connect();
    const res = await client.query('SELECT 1');
    console.log('DB OK', res.rows);
    client.release();
    await pool.end();
    process.exit(0);
  }catch(err){
    const nested = Array.isArray(err.errors)
      ? err.errors.map((e) => e.message).join(' | ')
      : '';
    console.error('DB ERROR', err.message || String(err), nested);
    await pool.end().catch(() => {});
    process.exit(2);
  }
})();
