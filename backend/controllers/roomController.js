const pool = require('../config/db');
const { HttpError } = require('../middleware/errors');
const { requiredText, positiveInteger, nonNegativeNumber } = require('../utils/validation');

function roomFields(body) {
  return [
    requiredText(body.room_number, 'Room number', 30),
    positiveInteger(body.capacity, 'Capacity'),
    nonNegativeNumber(body.price, 'Monthly price'),
    body.description ? requiredText(body.description, 'Description', 500) : null
  ];
}

const roomSelect = `
  SELECT r.id, r.room_number, r.capacity, r.price, r.description, r.created_at,
         COUNT(a.id) AS occupied_beds,
         CASE
           WHEN COUNT(a.id) = 0 THEN 'Available'
           WHEN COUNT(a.id) >= r.capacity THEN 'Full'
           ELSE 'Occupied'
         END AS status
    FROM rooms r
    LEFT JOIN allocations a ON a.room_id = r.id AND a.vacated_at IS NULL`;

async function list(req, res) {
  const [rows] = await pool.query(`${roomSelect} GROUP BY r.id ORDER BY r.room_number`);
  res.json(rows);
}

async function create(req, res) {
  const fields = roomFields(req.body);
  const [result] = await pool.execute(
    'INSERT INTO rooms (room_number, capacity, price, description) VALUES (?, ?, ?, ?)',
    fields
  );
  res.status(201).json({ id: result.insertId, message: 'Room created successfully.' });
}

async function update(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Room ID is invalid.');
  const [roomNumber, capacity, price, description] = roomFields(req.body);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rooms] = await connection.execute('SELECT id FROM rooms WHERE id = ? FOR UPDATE', [id]);
    if (!rooms.length) throw new HttpError(404, 'Room was not found.');
    const [counts] = await connection.execute(
      'SELECT COUNT(*) AS count FROM allocations WHERE room_id = ? AND vacated_at IS NULL',
      [id]
    );
    if (Number(counts[0].count) > capacity) {
      throw new HttpError(409, 'Capacity cannot be lower than the number of allocated students.');
    }
    await connection.execute(
      'UPDATE rooms SET room_number = ?, capacity = ?, price = ?, description = ? WHERE id = ?',
      [roomNumber, capacity, price, description, id]
    );
    await connection.commit();
    res.json({ message: 'Room updated successfully.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function remove(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'Room ID is invalid.');
  const [result] = await pool.execute('DELETE FROM rooms WHERE id = ?', [id]);
  if (!result.affectedRows) throw new HttpError(404, 'Room was not found.');
  res.json({ message: 'Room deleted successfully.' });
}

module.exports = { list, create, update, remove };
