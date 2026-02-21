require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');


const app = express();
app.use(express.json());

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// --- HELPER FUNCTIONS ---

async function query(text, params) {
  const res = await pool.query(text, params);
  return res;
}

async function auditLog({ client_id, actor, action, entity_type, entity_id, metadata }, db = pool) {
  await db.query(
    `INSERT INTO core.audit_logs
     (client_id, actor, action, entity_type, entity_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [client_id, actor, action, entity_type, entity_id, metadata || null]
  );
}

// --- MIDDLEWARE DEFINITIONS ---

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing token' });
  }

  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { sub, client_id, role }
    next();
  } catch {
    return res.status(401).json({ error: 'invalid token' });
  }
}

function enforceClient(req, res, next) {
  // If the user is authenticated via JWT, use the client_id from the token
  if (req.user && req.user.client_id) {
    req.client_id = req.user.client_id;
    return next();
  }
  
  // Fallback for legacy/bootstrap routes (like initial user creation)
  const client_id = req.body?.client_id || req.query?.client_id || req.headers['x-client-id'];

  if (!client_id) {
    return res.status(400).json({ error: 'client_id is required' });
  }

  req.client_id = client_id;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    next();
  };
}

// --- 1. PUBLIC & BOOTSTRAP ROUTES (No Auth Required) ---

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', db: 'not connected' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await query('SELECT * FROM core.users WHERE email = $1', [email]);
    if (result.rowCount === 0) return res.status(401).json({ error: 'invalid credentials' });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'invalid credentials' });

    const token = jwt.sign(
      { sub: user.id, client_id: user.client_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Used for creating the very first client in a clean DB
app.post('/clients', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const result = await query(
      `INSERT INTO core.clients (name) VALUES ($1) RETURNING id, name, status, created_at`,
      [name]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 2. THE WATERFALL (Global Middleware for all routes below) ---

app.use(requireAuth);
app.use(enforceClient);

// --- 3. PROTECTED ROUTES (Requires Auth + Client Enforcement) ---

app.post('/users', async (req, res) => {
  const { email, role, password_hash, sponsor_id } = req.body;
  const client_id = req.client_id; // From enforceClient

  if (!email || !role || !password_hash) {
    return res.status(400).json({ error: 'email, role, password_hash are required' });
  }

  try {
    if (sponsor_id) {
      const sponsorCheck = await query(
        'SELECT id, client_id FROM core.users WHERE id = $1',
        [sponsor_id]
      );
      if (sponsorCheck.rowCount === 0 || sponsorCheck.rows[0].client_id !== client_id) {
        return res.status(400).json({ error: 'invalid sponsor_id' });
      }
    }

    const saltRounds = 10;
    const finalHash = await bcrypt.hash(password_hash, saltRounds);

    const result = await query(
      `INSERT INTO core.users (client_id, email, role, password_hash, sponsor_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, client_id, email, role, sponsor_id, status, created_at`,
      [client_id, email, role, finalHash, sponsor_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.get('/wallet', async (req, res) => {
  try {
    const result = await query(
      `SELECT balance FROM core.wallets WHERE client_id = $1 AND user_id = $2`,
      [req.client_id, req.user.sub]
    );
    res.json(result.rows[0] || { balance: '0.00' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/orders', async (req, res) => {
  const client_id = req.client_id;
  const user_id = req.user.sub; // derived from JWT
  const { total_amount, idempotency_key } = req.body;

  if (!total_amount) {
    return res.status(400).json({ error: 'total_amount is required' });
  }


  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    if (idempotency_key) {
      const existingOrder = await dbClient.query(
        `SELECT id FROM core.orders WHERE client_id = $1 AND idempotency_key = $2`,
        [client_id, idempotency_key]
      );
      if (existingOrder.rowCount > 0) {
        await dbClient.query('ROLLBACK');
        return res.status(200).json({ order_id: existingOrder.rows[0].id, idempotent: true });
      }
    }

    const rulesRes = await dbClient.query(
      `SELECT level, percentage FROM core.commission_rules WHERE client_id = $1`,
      [client_id]
    );
    const rules = {};
    for (const r of rulesRes.rows) rules[r.level] = Number(r.percentage) / 100;

    const userRes = await dbClient.query(
      `SELECT sponsor_id FROM core.users WHERE id = $1 AND client_id = $2`,
      [user_id, client_id]
    );
    if (userRes.rowCount === 0) throw new Error('invalid user for client');

    const orderRes = await dbClient.query(
      `INSERT INTO core.orders (client_id, user_id, total_amount, idempotency_key)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [client_id, user_id, total_amount, idempotency_key || null]
    );
    const order_id = orderRes.rows[0].id;

    const uplineRes = await dbClient.query(
      `WITH RECURSIVE upline AS (
        SELECT id, sponsor_id, 1 AS level FROM core.users WHERE id = $1 AND client_id = $2
        UNION ALL
        SELECT u.id, u.sponsor_id, up.level + 1 FROM core.users u
        JOIN upline up ON u.id = up.sponsor_id WHERE u.client_id = $2
      ) SELECT id, level FROM upline WHERE level > 1;`,
      [user_id, client_id]
    );

    for (const row of uplineRes.rows) {
      const commissionLevel = row.level - 1;
      const pct = rules[commissionLevel];
      if (!pct) continue;
      const amount = total_amount * pct;

      await dbClient.query(
        `INSERT INTO core.commissions (client_id, order_id, user_id, amount, level)
         VALUES ($1, $2, $3, $4, $5)`,
        [client_id, order_id, row.id, amount, commissionLevel]
      );
      await dbClient.query(
        `INSERT INTO core.wallets (client_id, user_id, balance) VALUES ($1, $2, $3)
         ON CONFLICT (client_id, user_id) DO UPDATE SET balance = core.wallets.balance + EXCLUDED.balance`,
        [client_id, row.id, amount]
      );
    }

    await dbClient.query('COMMIT');
    res.status(201).json({ order_id });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});

// --- 4. ADMIN ROUTES (Requires Admin Role) ---

const adminGroup = express.Router();
app.use('/admin', requireRole('admin'), adminGroup);

adminGroup.post('/commissions/:id/approve', async (req, res) => {
  const { id } = req.params;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');

    const cRes = await db.query(
      `SELECT client_id, user_id, amount, status
       FROM core.commissions
       WHERE id = $1 AND client_id = $2
       FOR UPDATE`,
      [id, req.client_id]
    );
    if (cRes.rowCount === 0) throw new Error('commission not found');
    if (cRes.rows[0].status !== 'pending') throw new Error('not pending');

    const { user_id, amount } = cRes.rows[0];

    await db.query(
      `INSERT INTO core.wallets (client_id, user_id, balance)
       VALUES ($1, $2, $3)
       ON CONFLICT (client_id, user_id)
       DO UPDATE SET balance = core.wallets.balance + EXCLUDED.balance`,
      [req.client_id, user_id, amount]
    );

    await db.query(
      `UPDATE core.commissions SET status = 'approved' WHERE id = $1`,
      [id]
    );

    await db.query('COMMIT');

    await auditLog({
      client_id: req.client_id,
      actor: 'admin',
      action: 'commission_approved',
      entity_type: 'commission',
      entity_id: id,
      metadata: { amount }
    });

    res.json({ commission_id: id, status: 'approved' });
  } catch (e) {
    await db.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    db.release();
  }
});

adminGroup.post('/commissions/:id/reverse', async (req, res) => {
  const { id } = req.params;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');

    const cRes = await db.query(
      `SELECT client_id, user_id, amount, status
       FROM core.commissions
       WHERE id = $1 AND client_id = $2
       FOR UPDATE`,
      [id, req.client_id]
    );
    if (cRes.rowCount === 0) throw new Error('commission not found');

    const { user_id, amount, status } = cRes.rows[0];
    if (!['pending', 'approved'].includes(status)) throw new Error('invalid state');

    if (status === 'approved') {
      const wRes = await db.query(
        `SELECT balance FROM core.wallets
         WHERE client_id = $1 AND user_id = $2
         FOR UPDATE`,
        [req.client_id, user_id]
      );
      if (wRes.rowCount === 0 || Number(wRes.rows[0].balance) < Number(amount)) {
        throw new Error('insufficient wallet balance');
      }

      await db.query(
        `UPDATE core.wallets
         SET balance = balance - $1
         WHERE client_id = $2 AND user_id = $3`,
        [amount, req.client_id, user_id]
      );
    }

    await db.query(
      `UPDATE core.commissions SET status = 'reversed' WHERE id = $1`,
      [id]
    );

    await db.query('COMMIT');

    await auditLog({
      client_id: req.client_id,
      actor: 'admin',
      action: 'commission_reversed',
      entity_type: 'commission',
      entity_id: id,
      metadata: { amount, previous_status: status }
    });

    res.json({ commission_id: id, status: 'reversed' });
  } catch (e) {
    await db.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    db.release();
  }
});


adminGroup.get('/commissions', async (req, res) => {
  const { status } = req.query;
  try {
    const result = await query(
      `SELECT id AS commission_id, order_id, user_id AS recipient_user_id, amount, level, status, created_at
       FROM core.commissions WHERE client_id = $1 ${status ? 'AND status = $2' : ''}
       ORDER BY created_at DESC`,
      status ? [req.client_id, status] : [req.client_id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

adminGroup.post('/withdrawals/:id/approve', async (req, res) => {
  const { id } = req.params;
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');
    const wdRes = await dbClient.query(
      `SELECT client_id, user_id, amount, status FROM core.withdrawal_requests WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (wdRes.rowCount === 0) throw new Error('withdrawal not found');
    const wd = wdRes.rows[0];
    if (wd.status !== 'pending') throw new Error('withdrawal not pending');

    const walletRes = await dbClient.query(
      `SELECT balance FROM core.wallets WHERE client_id = $1 AND user_id = $2 FOR UPDATE`,
      [wd.client_id, wd.user_id]
    );
    if (walletRes.rowCount === 0 || Number(walletRes.rows[0].balance) < Number(wd.amount)) {
      throw new Error('insufficient balance');
    }

    await dbClient.query(
      `UPDATE core.wallets SET balance = balance - $1, updated_at = now() WHERE client_id = $2 AND user_id = $3`,
      [wd.amount, wd.client_id, wd.user_id]
    );
    await dbClient.query(`UPDATE core.withdrawal_requests SET status = 'approved' WHERE id = $1`, [id]);
    
    await dbClient.query('COMMIT');

    await auditLog({
      client_id: wd.client_id,
      actor: 'admin',
      action: 'withdrawal_approved',
      entity_type: 'withdrawal',
      entity_id: id,
      metadata: { amount: wd.amount }
    });

    res.json({ withdrawal_id: id, status: 'approved' });
  } catch (err) {
    await dbClient.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally { dbClient.release(); }
});

// --- REMAINING ROUTES (Downline, Upline, Reports) ---

app.get('/users/downline', async (req, res) => {
  const { user_id } = req.query;
  try {
    const result = await query(
      `SELECT id, email, role, sponsor_id, status, created_at FROM core.users WHERE sponsor_id = $1 AND client_id = $2`,
      [user_id, req.client_id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/admin/reports/earnings', async (req, res) => {
  try {
    const result = await query(
      `SELECT u.id AS user_id, u.email, COALESCE(SUM(c.amount), 0) AS total_earned
       FROM core.users u LEFT JOIN core.commissions c ON c.user_id = u.id AND c.client_id = u.client_id AND c.status = 'approved'
       WHERE u.client_id = $1 GROUP BY u.id, u.email ORDER BY total_earned DESC`,
      [req.client_id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- SERVER START ---
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
app.post('/withdrawals', async (req, res) => {
  const client_id = req.client_id;
  const user_id = req.user.sub;
  const { amount, idempotency_key } = req.body;

  if (!amount) {
    return res.status(400).json({ error: 'amount is required' });
  }

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    // Idempotency check
    if (idempotency_key) {
      const existing = await dbClient.query(
        `SELECT id FROM core.withdrawal_requests
         WHERE client_id = $1 AND idempotency_key = $2`,
        [client_id, idempotency_key]
      );
      if (existing.rowCount > 0) {
        await dbClient.query('COMMIT');
        return res.json({
          id: existing.rows[0].id,
          idempotent: true
        });
      }
    }

    // Lock wallet
    const walletRes = await dbClient.query(
      `SELECT balance
       FROM core.wallets
       WHERE client_id = $1 AND user_id = $2
       FOR UPDATE`,
      [client_id, user_id]
    );

    if (walletRes.rowCount === 0) {
      throw new Error('wallet not found');
    }

    const balance = Number(walletRes.rows[0].balance);
    if (balance < Number(amount)) {
      throw new Error('insufficient balance');
    }

    // Create withdrawal request
    const wdRes = await dbClient.query(
      `INSERT INTO core.withdrawal_requests
       (client_id, user_id, amount, idempotency_key)
       VALUES ($1, $2, $3, $4)
       RETURNING id, status, created_at`,
      [client_id, user_id, amount, idempotency_key || null]
    );

    await dbClient.query('COMMIT');
    res.status(201).json(wdRes.rows[0]);

  } catch (err) {
    await dbClient.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    dbClient.release();
  }
});