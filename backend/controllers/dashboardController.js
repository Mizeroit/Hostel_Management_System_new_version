const pool = require('../config/db');

async function summary(req, res) {
  const [[students]] = await pool.query('SELECT COUNT(*) AS total FROM students');
  const [[rooms]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(occupied_beds = 0), 0) AS available,
            COALESCE(SUM(occupied_beds > 0), 0) AS occupied
       FROM (
         SELECT r.id, COUNT(a.id) AS occupied_beds
           FROM rooms r
           LEFT JOIN allocations a ON a.room_id = r.id AND a.vacated_at IS NULL
          GROUP BY r.id
       ) room_counts`
  );
  const [[payments]] = await pool.query('SELECT COALESCE(SUM(amount), 0) AS total FROM payments');
  const [recent] = await pool.query(
    `SELECT activity, details, created_at FROM (
       SELECT 'Payment' AS activity, CONCAT('Payment recorded for ', s.full_name) AS details,
              p.paid_at AS created_at
         FROM payments p JOIN students s ON s.id = p.student_id
       UNION ALL
       SELECT 'Allocation' AS activity, CONCAT(s.full_name, ' allocated to room ', r.room_number) AS details,
              a.allocated_at AS created_at
         FROM allocations a JOIN students s ON s.id = a.student_id JOIN rooms r ON r.id = a.room_id
       UNION ALL
       SELECT 'Student' AS activity, CONCAT('Student registered: ', full_name) AS details,
              DATE(created_at) AS created_at
         FROM students
     ) activities
     ORDER BY created_at DESC LIMIT 8`
  );
  res.json({
    totalStudents: Number(students.total),
    totalRooms: Number(rooms.total),
    availableRooms: Number(rooms.available),
    occupiedRooms: Number(rooms.occupied),
    totalPayments: Number(payments.total),
    recentActivities: recent
  });
}

module.exports = { summary };
