const fs = require('fs');
const path = require('path');
const backendEnvPath = path.join(__dirname, '.env');
const rootEnvPath = path.resolve(__dirname, '..', '.env');
require('dotenv').config({ path: fs.existsSync(backendEnvPath) ? backendEnvPath : rootEnvPath });
const bcrypt = require('bcryptjs');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const pool = require('./config/db');
const requireAuth = require('./middleware/auth');
const { errorHandler } = require('./middleware/errors');

const app = express();
const port = Number(process.env.PORT || 5000);

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET must be set.');
}
if (process.env.DB_PASSWORD === undefined) {
  throw new Error('DB_PASSWORD must be set; it may be blank only for a passwordless MySQL account.');
}

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (error) {
    next(error);
  }
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/students', requireAuth, require('./routes/studentRoutes'));
app.use('/api/rooms', requireAuth, require('./routes/roomRoutes'));
app.use('/api/allocations', requireAuth, require('./routes/allocationRoutes'));
app.use('/api/payments', requireAuth, require('./routes/paymentRoutes'));
app.use('/api/dashboard', requireAuth, require('./routes/dashboardRoutes'));

app.use((req, res) => res.status(404).json({ message: 'Route not found.' }));
app.use(errorHandler);

async function initialize() {
  let databaseReady = false;

  for (let attempt = 1; attempt <= 30; attempt += 1) {
    try {
      await pool.query('SELECT 1');
      databaseReady = true;
      break;
    } catch (error) {
      if (attempt === 30) {
        console.warn('Database is unavailable; continuing without startup initialization.');
        return;
      }
      console.log(`Database is not ready (attempt ${attempt}/30); retrying in 2 seconds.`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  if (!databaseReady) return;

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set.');
  const [admins] = await pool.execute('SELECT id FROM admins WHERE email = ?', [email]);
  if (!admins.length) {
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      await pool.execute(
        'INSERT INTO admins (email, password_hash) VALUES (?, ?)',
        [email, passwordHash]
      );
      console.log(`Created initial administrator account: ${email}`);
    } catch (error) {
      if (error.code !== 'ER_DUP_ENTRY') throw error;
      const [adminsAfterRace] = await pool.execute('SELECT id FROM admins WHERE email = ?', [email]);
      if (!adminsAfterRace.length) throw error;
    }
  }
}

if (require.main === module) {
  initialize()
    .then(() => {
      app.listen(port, '0.0.0.0', () => console.log(`API listening on port ${port}`));
    })
    .catch((error) => {
      console.error('Initialization failed:', error);
      app.listen(port, '0.0.0.0', () => console.log(`API listening on port ${port} without a completed database initialization.`));
    });
}

module.exports = { app, initialize };
