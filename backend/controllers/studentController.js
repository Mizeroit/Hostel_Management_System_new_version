const pool = require('../config/db');
const { HttpError } = require('../middleware/errors');
const {
  genders,
  requiredText,
  validEmail
} = require('../utils/validation');

function studentFields(body) {
  const gender = requiredText(body.gender, 'Gender', 20);
  if (!genders.includes(gender)) throw new HttpError(400, 'Gender must be Female, Male, or Other.');

  return [
    requiredText(body.reg_no, 'Registration number', 50),
    requiredText(body.full_name, 'Student name', 150),
    gender,
    requiredText(body.phone, 'Phone number', 40),
    validEmail(body.email),
    requiredText(body.address, 'Address', 500)
  ];
}

async function list(req, res) {
  const search = String(req.query.search || '').trim();
  const term = `%${search}%`;
  const [rows] = await pool.execute(
    `SELECT s.id, s.reg_no, s.full_name, s.gender, s.phone, s.email, s.address,
            s.created_at, a.room_id, r.room_number
       FROM students s
       LEFT JOIN allocations a ON a.student_id = s.id AND a.vacated_at IS NULL
       LEFT JOIN rooms r ON r.id = a.room_id
      WHERE ? = '' OR s.reg_no LIKE ? OR s.full_name LIKE ? OR s.phone LIKE ? OR s.email LIKE ?
      ORDER BY s.full_name`,
    [search, term, term, term, term]
  );
  res.json(rows);
}

async function create(req, res) {
  const [regNo, fullName, gender, phone, email, address] = studentFields(req.body);
  const [result] = await pool.execute(
    `INSERT INTO students (reg_no, full_name, gender, phone, email, address)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [regNo, fullName, gender, phone, email, address]
  );
  const [rows] = await pool.execute(
    'SELECT id, reg_no, full_name, gender, phone, email, address, created_at FROM students WHERE id = ?',
    [result.insertId]
  );
  res.status(201).json(rows[0]);
}

async function update(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Student ID is invalid.');
  const [regNo, fullName, gender, phone, email, address] = studentFields(req.body);
  const [result] = await pool.execute(
    `UPDATE students SET reg_no = ?, full_name = ?, gender = ?, phone = ?, email = ?, address = ?
     WHERE id = ?`,
    [regNo, fullName, gender, phone, email, address, id]
  );
  if (!result.affectedRows) throw new HttpError(404, 'Student was not found.');
  res.json({ message: 'Student updated successfully.' });
}

async function remove(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Student ID is invalid.');
  const [result] = await pool.execute('DELETE FROM students WHERE id = ?', [id]);
  if (!result.affectedRows) throw new HttpError(404, 'Student was not found.');
  res.json({ message: 'Student deleted successfully.' });
}

module.exports = { list, create, update, remove };
