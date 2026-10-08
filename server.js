require('dotenv').config();

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const nodemailer = require('nodemailer');
const pool = require('./db');

const app = express();
const port = Number(process.env.APP_PORT) || 3000;
const frontendOrigin = process.env.FRONTEND_ORIGIN || `http://localhost:${port}`;
const sessionCookieName = 'tomas_session';
const sessionTtlMs = 8 * 60 * 60 * 1000;
const codeLifetimeMs = 10 * 60 * 1000;
const resendDelayMs = 60 * 1000;
const requestWindowMs = 10 * 60 * 1000;
const maxRequestsPerWindow = 3;
const requestHistory = new Map();
const loginHistory = new Map();
const sessions = new Map();
const otpSecret = process.env.OTP_SECRET || crypto.randomBytes(32).toString('hex');

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  frameguard: { action: 'deny' },
  noSniff: true,
}));
app.use((request, response, next) => {
  if (request.headers.origin && request.headers.origin !== frontendOrigin) {
    return response.status(403).json({ error: 'Origin is not allowed.' });
  }
  if (request.headers.origin === frontendOrigin) {
    response.setHeader('Access-Control-Allow-Origin', frontendOrigin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  if (process.env.NODE_ENV === 'production' && request.headers['x-forwarded-proto'] !== 'https') {
    return response.redirect(`https://${request.headers.host}${request.originalUrl}`);
  }
  return next();
});
app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'dist')));

const mailer = process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD
  ? nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD.replace(/\s/g, ''),
      },
    })
  : null;

function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9._-]{3,40}$/.test(username);
}

function clientCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: sessionTtlMs,
    path: '/',
  };
}

function readCookie(request, name) {
  const cookies = request.headers.cookie?.split(';').map((part) => part.trim()) || [];
  const entry = cookies.find((part) => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}

function issueSession(response, user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { ...user, expiresAt: Date.now() + sessionTtlMs });
  response.cookie(sessionCookieName, token, clientCookieOptions());
}

function getSession(request) {
  const token = readCookie(request, sessionCookieName);
  const session = token ? sessions.get(token) : null;
  if (!session || session.expiresAt <= Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return session;
}

function rateLimitedLogin(key) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const attempts = (loginHistory.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
  loginHistory.set(key, attempts);
  return attempts.length >= 5;
}

function recordLoginAttempt(key) {
  loginHistory.set(key, [...(loginHistory.get(key) || []), Date.now()]);
}

async function audit(action, request, userId = null, metadata = {}) {
  try {
    await pool.query(
      'INSERT INTO audit_logs (user_id, action, ip_address, metadata) VALUES ($1, $2, $3, $4)',
      [userId, action, request.ip, JSON.stringify(metadata)],
    );
  } catch (error) {
    console.error('Unable to write audit log:', error.message);
  }
}

function isGmail(email) {
  return /^[^\s@]+@gmail\.com$/i.test(email);
}

function hashCode(email, code, purpose = 'login') {
  return crypto.createHmac('sha256', otpSecret).update(`${purpose}:${email}:${code}`).digest('hex');
}

function createCode() {
  return crypto.randomInt(100000, 1000000).toString();
}

function tooManyRequests(email) {
  const now = Date.now();
  const recent = (requestHistory.get(email) || []).filter((timestamp) => now - timestamp < requestWindowMs);
  requestHistory.set(email, recent);
  return recent.length >= maxRequestsPerWindow;
}

function recordRequest(email) {
  const recent = requestHistory.get(email) || [];
  recent.push(Date.now());
  requestHistory.set(email, recent);
}

async function sendCode(email, purpose = 'login') {
  if (!mailer) throw new Error('Email service is not configured.');
  const code = createCode();
  await pool.query(
    `INSERT INTO otp_challenges (email, purpose, code_hash, expires_at, attempts)
     VALUES ($1, $2, $3, NOW() + INTERVAL '10 minutes', 0)
     ON CONFLICT (email) DO UPDATE SET purpose = EXCLUDED.purpose, code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0`,
    [email, purpose, hashCode(email, code, purpose)],
  );
  await mailer.sendMail({
    from: `Tomas Car Accessories <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your Tomas Car Accessories verification code',
    text: `Your verification code is ${code}. It expires in 10 minutes.`,
  });
}

app.post('/api/auth/request-code', async (request, response) => {
  const email = normalizeEmail(request.body?.email);
  if (!isGmail(email)) return response.status(400).json({ error: 'Enter a valid Gmail address.' });
  if (!mailer) return response.status(503).json({ error: 'Gmail is not configured on the server. Add EMAIL_USER and EMAIL_APP_PASSWORD to .env.' });
  if (tooManyRequests(email)) return response.status(429).json({ error: 'Too many requests. Try again later.' });

  try {
    await sendCode(email);
    recordRequest(email);
    return response.json({ message: 'If the address is eligible, a verification code has been sent.' });
  } catch (error) {
    console.error('Unable to send verification email:', error.message);
    return response.status(503).json({ error: 'The email service is unavailable. Check the server configuration.' });
  }
});

app.post('/api/auth/request-reset-code', async (request, response) => {
  const email = normalizeEmail(request.body?.email);
  if (!isGmail(email)) return response.status(400).json({ error: 'Enter a valid Gmail address.' });
  if (!mailer) return response.status(503).json({ error: 'Gmail is not configured on the server. Add EMAIL_USER and EMAIL_APP_PASSWORD to .env.' });
  if (tooManyRequests(email)) return response.status(429).json({ error: 'Too many requests. Try again later.' });

  const user = await pool.query('SELECT id FROM users WHERE email = $1 AND password_hash IS NOT NULL', [email]);
  if (!user.rows.length) return response.status(404).json({ error: 'This Gmail address is not registered.' });
  try {
    await sendCode(email, 'reset');
    recordRequest(email);
    return response.json({ message: 'A password reset code has been sent.' });
  } catch (error) {
    console.error('Unable to send password reset email:', error.message);
    return response.status(503).json({ error: 'The email service is unavailable. Check the server configuration.' });
  }
});

app.post('/api/auth/login', async (request, response) => {
  const username = normalizeUsername(request.body?.username);
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  const attemptKey = `${request.ip}:${username.toLowerCase()}`;
  if (!isValidUsername(username) || !password || password.length > 128) {
    await audit('login_rejected', request, null, { reason: 'invalid_input' });
    return response.status(400).json({ error: 'Enter a valid username and password.' });
  }
  if (rateLimitedLogin(attemptKey)) {
    await audit('login_rate_limited', request, null, { username });
    return response.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }
  recordLoginAttempt(attemptKey);

  const result = await pool.query('SELECT id, email, password_hash, role FROM users WHERE username = $1', [username]);
  const user = result.rows[0];
  if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
    await audit('login_failed', request, user?.id || null, { username });
    return response.status(401).json({ error: 'Invalid username or password.' });
  }

  issueSession(response, { userId: user.id, email: user.email, username, role: user.role });
  await audit('login_success', request, user.id, { username, role: user.role });
  return response.json({ authenticated: true });
});

app.post('/api/auth/verify-code', async (request, response) => {
  const email = normalizeEmail(request.body?.email);
  const code = typeof request.body?.code === 'string' ? request.body.code : '';
  if (!isGmail(email) || !/^\d{6}$/.test(code)) return response.status(400).json({ error: 'Enter the six-digit code.' });

  const result = await pool.query('SELECT purpose, code_hash, expires_at, attempts FROM otp_challenges WHERE email = $1', [email]);
  const challenge = result.rows[0];
  if (!challenge || new Date(challenge.expires_at).getTime() <= Date.now()) {
    return response.status(400).json({ error: 'This code has expired. Request a new one.' });
  }
  if (challenge.attempts >= 5) return response.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });

  const expected = Buffer.from(challenge.code_hash, 'hex');
  const received = Buffer.from(hashCode(email, code, challenge.purpose || 'login'), 'hex');
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    await pool.query('UPDATE otp_challenges SET attempts = attempts + 1 WHERE email = $1', [email]);
    return response.status(401).json({ error: 'That code is incorrect.' });
  }

  await pool.query('DELETE FROM otp_challenges WHERE email = $1', [email]);
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
  const userResult = await pool.query(
    `INSERT INTO users (email, password_hash, role, email_verified_at)
     VALUES ($1, $2, 'cashier', NOW())
     ON CONFLICT (email) DO UPDATE SET email_verified_at = NOW(), updated_at = NOW()
     RETURNING id, username, role`,
    [email, passwordHash],
  );
  const user = userResult.rows[0];
  issueSession(response, { userId: user.id, email, username: user.username || email.split('@')[0], role: user.role });
  await audit('otp_login_success', request, user.id, { email, role: user.role });
  return response.json({ authenticated: true });
});

app.post('/api/auth/reset-password', async (request, response) => {
  const email = normalizeEmail(request.body?.email);
  const code = typeof request.body?.code === 'string' ? request.body.code : '';
  const password = typeof request.body?.password === 'string' ? request.body.password : '';
  if (!isGmail(email) || !/^\d{6}$/.test(code) || password.length < 8 || password.length > 128) {
    return response.status(400).json({ error: 'Enter the six-digit code and a password of at least 8 characters.' });
  }

  const result = await pool.query('SELECT purpose, code_hash, expires_at, attempts FROM otp_challenges WHERE email = $1', [email]);
  const challenge = result.rows[0];
  if (!challenge || challenge.purpose !== 'reset' || new Date(challenge.expires_at).getTime() <= Date.now()) {
    return response.status(400).json({ error: 'This reset code has expired. Request a new one.' });
  }
  if (challenge.attempts >= 5) return response.status(429).json({ error: 'Too many incorrect attempts. Request a new code.' });

  const expected = Buffer.from(challenge.code_hash, 'hex');
  const received = Buffer.from(hashCode(email, code, 'reset'), 'hex');
  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    await pool.query('UPDATE otp_challenges SET attempts = attempts + 1 WHERE email = $1', [email]);
    return response.status(401).json({ error: 'That reset code is incorrect.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const userResult = await pool.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE email = $2 RETURNING id', [passwordHash, email]);
  await pool.query('DELETE FROM otp_challenges WHERE email = $1', [email]);
  await audit('password_reset', request, userResult.rows[0]?.id || null, { email });
  return response.json({ message: 'Password updated successfully.' });
});

app.get('/api/auth/session', (request, response) => {
  const session = getSession(request);
  if (!session) {
    return response.status(401).json({ error: 'Session expired.' });
  }
  return response.json({ email: session.email, username: session.username || session.email.split('@')[0], role: session.role });
});

app.post('/api/auth/logout', async (request, response) => {
  const token = readCookie(request, sessionCookieName);
  const session = getSession(request);
  if (token) sessions.delete(token);
  response.clearCookie(sessionCookieName, { ...clientCookieOptions(), maxAge: undefined });
  if (session) await audit('logout', request, session.userId);
  return response.json({ authenticated: false });
});

function inventorySession(request, response) {
  const session = getSession(request);
  if (!session) {
    response.status(401).json({ error: 'Session expired.' });
    return null;
  }
  if (!['admin', 'manager'].includes(session.role)) {
    response.status(403).json({ error: 'You do not have access to inventory.' });
    return null;
  }
  return session;
}

function productPayload(body) {
  const categories = ['Tires', 'Lighting', 'Interior', 'Exterior', 'Tools'];
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const sku = typeof body?.sku === 'string' ? body.sku.trim() : '';
  const category = typeof body?.category === 'string' ? body.category : '';
  const quantity = Number(body?.quantity);
  const reorder = Number(body?.reorder);
  const price = Number(body?.price);
  const imageData = body?.imageData || null;
  const validImage = imageData === null ||
    (typeof imageData === 'string' && imageData.length <= 2 * 1024 * 1024 &&
      /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(imageData));
  if (!name || !sku || !categories.includes(category) ||
      !Number.isInteger(quantity) || quantity < 0 ||
      !Number.isInteger(reorder) || reorder < 0 ||
      !Number.isFinite(price) || price < 0 || !validImage) {
    return null;
  }
  return { name, sku, category, quantity, reorder, price, imageData };
}

function productRow(row) {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    quantity: row.quantity_on_hand,
    reorder: row.reorder_threshold,
    price: Number(row.unit_price),
    imageData: row.image_data,
  };
}

app.get('/api/products', (request, response) => {
  if (!getSession(request)) return response.status(401).json({ error: 'Session expired.' });
  pool.query(
    `SELECT id, name, sku, category, quantity_on_hand, reorder_threshold, unit_price, image_data
     FROM products WHERE is_active = TRUE ORDER BY name`,
  ).then((result) => response.json(result.rows.map(productRow)))
    .catch((error) => {
      console.error('Unable to load products:', error.message);
      response.status(500).json({ error: 'Unable to load products.' });
    });
});

app.post('/api/products', async (request, response) => {
  const session = inventorySession(request, response);
  if (!session) return;
  const product = productPayload(request.body);
  if (!product) return response.status(400).json({ error: 'Enter valid product details.' });
  try {
    const result = await pool.query(
      `INSERT INTO products (name, sku, category, quantity_on_hand, reorder_threshold, unit_price, image_data)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, sku, category, quantity_on_hand, reorder_threshold, unit_price, image_data`,
      [product.name, product.sku, product.category, product.quantity, product.reorder, product.price, product.imageData],
    );
    await audit('product_created', request, session.userId, { productId: result.rows[0].id, sku: product.sku });
    return response.status(201).json(productRow(result.rows[0]));
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'That SKU is already in use.' });
    console.error('Unable to create product:', error.message);
    return response.status(500).json({ error: 'Unable to create product.' });
  }
});

app.put('/api/products/:id', async (request, response) => {
  const session = inventorySession(request, response);
  if (!session) return;
  const product = productPayload(request.body);
  if (!product || !/^\d+$/.test(request.params.id)) return response.status(400).json({ error: 'Enter valid product details.' });
  try {
    const result = await pool.query(
      `UPDATE products
         SET name = $1, sku = $2, category = $3, quantity_on_hand = $4,
           reorder_threshold = $5, unit_price = $6, image_data = $7, updated_at = NOW()
      WHERE id = $8 AND is_active = TRUE
      RETURNING id, name, sku, category, quantity_on_hand, reorder_threshold, unit_price, image_data`,
          [product.name, product.sku, product.category, product.quantity, product.reorder, product.price, product.imageData, request.params.id],
    );
    if (!result.rows.length) return response.status(404).json({ error: 'Product not found.' });
    await audit('product_updated', request, session.userId, { productId: request.params.id, sku: product.sku });
    return response.json(productRow(result.rows[0]));
  } catch (error) {
    if (error.code === '23505') return response.status(409).json({ error: 'That SKU is already in use.' });
    console.error('Unable to update product:', error.message);
    return response.status(500).json({ error: 'Unable to update product.' });
  }
});

app.post('/api/products/:id/stock', async (request, response) => {
  const session = inventorySession(request, response);
  if (!session) return;
  if (!/^\d+$/.test(request.params.id)) return response.status(400).json({ error: 'Invalid product.' });
  const delta = Number(request.body?.delta);
  const reason = typeof request.body?.reason === 'string' ? request.body.reason.trim() : '';
  if (!Number.isInteger(delta) || delta === 0 || !reason || reason.length > 120) {
    return response.status(400).json({ error: 'Enter a non-zero quantity change and reason.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `UPDATE products SET quantity_on_hand = quantity_on_hand + $1, updated_at = NOW()
       WHERE id = $2 AND is_active = TRUE AND quantity_on_hand + $1 >= 0
       RETURNING id, name, sku, category, quantity_on_hand, reorder_threshold, unit_price, image_data`,
      [delta, request.params.id],
    );
    if (!result.rows.length) {
      await client.query('ROLLBACK');
      return response.status(400).json({ error: 'Stock cannot be reduced below zero, or product was not found.' });
    }
    await client.query(
      'INSERT INTO inventory_movements (product_id, quantity_delta, reason, staff_user_id) VALUES ($1, $2, $3, $4)',
      [request.params.id, delta, reason, session.userId],
    );
    await client.query('COMMIT');
    await audit('stock_adjusted', request, session.userId, { productId: request.params.id, delta, reason });
    return response.json(productRow(result.rows[0]));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Unable to adjust stock:', error.message);
    return response.status(500).json({ error: 'Unable to adjust stock.' });
  } finally {
    client.release();
  }
});

app.delete('/api/products/:id', async (request, response) => {
  const session = inventorySession(request, response);
  if (!session) return;
  if (!/^\d+$/.test(request.params.id)) return response.status(400).json({ error: 'Invalid product.' });
  try {
    const result = await pool.query(
      `UPDATE products SET is_active = FALSE, updated_at = NOW()
       WHERE id = $1 AND is_active = TRUE RETURNING id`,
      [request.params.id],
    );
    if (!result.rows.length) return response.status(404).json({ error: 'Product not found.' });
    await audit('product_deleted', request, session.userId, { productId: request.params.id });
    return response.json({ deleted: true });
  } catch (error) {
    console.error('Unable to delete product:', error.message);
    return response.status(500).json({ error: 'Unable to delete product.' });
  }
});

app.use((request, response) => response.sendFile(path.join(__dirname, 'dist', 'index.html')));

async function start() {
  if (!mailer) console.warn('Gmail is not configured. Add EMAIL_USER and EMAIL_APP_PASSWORD to .env before sending codes.');
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL UNIQUE CHECK (email ~* '^[^\\s@]+@gmail\\.com$'),
    username TEXT UNIQUE,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'cashier' CHECK (role IN ('admin', 'manager', 'cashier')),
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT UNIQUE');
  await pool.query('ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL');
  await pool.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
  await pool.query("UPDATE users SET role = 'cashier', updated_at = NOW() WHERE role = 'staff'");
  await pool.query("ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'manager', 'cashier'))");
  await pool.query("UPDATE users SET role = 'admin', updated_at = NOW() WHERE username = 'admin'");
  await pool.query("UPDATE users SET role = 'admin', updated_at = NOW() WHERE lower(email) = 'danny.mixz15@gmail.com'");
  await pool.query("UPDATE users SET role = 'manager', updated_at = NOW() WHERE username = 'manager'");
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    ip_address INET,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS otp_challenges (
    email TEXT PRIMARY KEY,
    purpose TEXT NOT NULL DEFAULT 'login',
    code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0
  )`);
  await pool.query("ALTER TABLE otp_challenges ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'login'");
  await pool.query(fs.readFileSync(path.join(__dirname, 'db', '001_operations_schema.sql'), 'utf8'));
  await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS image_data TEXT');
  app.listen(port, () => console.log(`Tomas Car Accessories is running at http://localhost:${port}`));
}

start().catch((error) => {
  console.error('Unable to start server:', error.message);
  process.exit(1);
});
