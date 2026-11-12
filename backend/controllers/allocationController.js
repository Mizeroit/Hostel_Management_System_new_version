const pool = require('../config/db');
const { HttpError } = require('../middleware/errors');
const { positiveInteger, validDate } = require('../utils/validation');

async function list(req, res) {
  const [rows] = await pool.query(
    `SELECT a.id, a.student_id, s.full_name, s.reg_no, a.room_id, r.room_number,
            a.allocated_at, a.vacated_at,
            IF(a.vacated_at IS NULL, 'Active', 'Completed') AS status
       FROM allocations a
       JOIN students s ON s.id = a.student_id
       JOIN rooms r ON r.id = a.room_id
      ORDER BY a.allocated_at DESC, a.id DESC`
  );
  res.json(rows);
}

async function create(req, res) {
  const studentId = positiveInteger(req.body.student_id, 'Student');
  const roomId = positiveInteger(req.body.room_id, 'Room');
  const allocatedAt = validDate(req.body.allocated_at, 'Allocation date') || new Date().toISOString().slice(0, 10);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [students] = await connection.execute('SELECT id FROM students WHERE id = ? FOR UPDATE', [studentId]);
    if (!students.length) throw new HttpError(404, 'Student was not found.');
    const [active] = await connection.execute(
      'SELECT id FROM allocations WHERE student_id = ? AND vacated_at IS NULL FOR UPDATE',
      [studentId]
    );
    if (active.length) throw new HttpError(409, 'Student already has an active room. Move or vacate that allocation first.');

    const [rooms] = await connection.execute('SELECT capacity FROM rooms WHERE id = ? FOR UPDATE', [roomId]);
    if (!rooms.length) throw new HttpError(404, 'Room was not found.');
    const [counts] = await connection.execute(
      'SELECT COUNT(*) AS count FROM allocations WHERE room_id = ? AND vacated_at IS NULL',
      [roomId]
    );
    if (Number(counts[0].count) >= rooms[0].capacity) throw new HttpError(409, 'This room is full.');

    const [result] = await connection.execute(
      'INSERT INTO allocations (student_id, room_id, allocated_at) VALUES (?, ?, ?)',
      [studentId, roomId, allocatedAt]
    );
    await connection.commit();
    res.status(201).json({ id: result.insertId, message: 'Room allocated successfully.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function move(req, res) {
  const allocationId = positiveInteger(req.params.id, 'Allocation');
  const roomId = positiveInteger(req.body.room_id, 'Room');
  const allocatedAt = validDate(req.body.allocated_at, 'Allocation date') || new Date().toISOString().slice(0, 10);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [allocations] = await connection.execute(
      'SELECT id, student_id, room_id FROM allocations WHERE id = ? AND vacated_at IS NULL FOR UPDATE',
      [allocationId]
    );
    if (!allocations.length) throw new HttpError(404, 'Active allocation was not found.');
    const allocation = allocations[0];
    if (Number(allocation.room_id) === roomId) throw new HttpError(400, 'Student is already in that room.');

    const [rooms] = await connection.execute('SELECT capacity FROM rooms WHERE id = ? FOR UPDATE', [roomId]);
    if (!rooms.length) throw new HttpError(404, 'Destination room was not found.');
    const [counts] = await connection.execute(
      'SELECT COUNT(*) AS count FROM allocations WHERE room_id = ? AND vacated_at IS NULL',
      [roomId]
    );
    if (Number(counts[0].count) >= rooms[0].capacity) throw new HttpError(409, 'Destination room is full.');

    await connection.execute('UPDATE allocations SET vacated_at = CURRENT_DATE WHERE id = ?', [allocationId]);
    await connection.execute(
      'INSERT INTO allocations (student_id, room_id, allocated_at) VALUES (?, ?, ?)',
      [allocation.student_id, roomId, allocatedAt]
    );
    await connection.commit();
    res.json({ message: 'Student moved successfully.' });
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function vacate(req, res) {
  const allocationId = positiveInteger(req.params.id, 'Allocation');
  const [result] = await pool.execute(
    'UPDATE allocations SET vacated_at = CURRENT_DATE WHERE id = ? AND vacated_at IS NULL',
    [allocationId]
  );
  if (!result.affectedRows) throw new HttpError(404, 'Active allocation was not found.');
  res.json({ message: 'Room allocation ended successfully.' });
}

module.exports = { list, create, move, vacate };
