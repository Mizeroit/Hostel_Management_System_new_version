const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { HttpError } = require('../middleware/errors');
const { requiredText, validEmail } = require('../utils/validation');

async function login(req, res) {
  const email = validEmail(req.body.email);
  const password = requiredText(req.body.password, 'Password', 200);
  if (!email) throw new HttpError(400, 'Email is required.');

  const [admins] = await pool.execute(
    'SELECT id, email, password_hash FROM admins WHERE email = ? LIMIT 1',
    [email]
  );
  const admin = admins[0];
  if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
    throw new HttpError(401, 'Email or password is incorrect.');
  }

  const token = jwt.sign(
    { id: admin.id, email: admin.email },
    process.env.JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.json({ token, admin: { id: admin.id, email: admin.email } });
}

function me(req, res) {
  res.json({ admin: req.admin });
}

module.exports = { login, me };
