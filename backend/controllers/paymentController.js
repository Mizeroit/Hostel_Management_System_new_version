const pool = require('../config/db');
const { HttpError } = require('../middleware/errors');
const {
  paymentMethods,
  positiveInteger,
  nonNegativeNumber,
  validDate
} = require('../utils/validation');

function paymentFields(body) {
  const amount = nonNegativeNumber(body.amount, 'Payment amount');
  if (amount <= 0) throw new HttpError(400, 'Payment amount must be greater than zero.');
  const method = body.payment_method;
  if (!paymentMethods.includes(method)) {
    throw new HttpError(400, `Payment method must be one of: ${paymentMethods.join(', ')}.`);
  }
  return {
    studentId: positiveInteger(body.student_id, 'Student'),
    amount,
    method,
    paidAt: validDate(body.paid_at, 'Payment date') || new Date().toISOString().slice(0, 10)
  };
}

const paymentSelect = `
  SELECT p.id, p.student_id, s.full_name, s.reg_no, p.amount, p.payment_method, p.paid_at,
         r.price AS monthly_fee,
         (SELECT COALESCE(SUM(p2.amount), 0)
            FROM payments p2
           WHERE p2.student_id = p.student_id
             AND YEAR(p2.paid_at) = YEAR(p.paid_at)
             AND MONTH(p2.paid_at) = MONTH(p.paid_at)) AS period_total,
         CASE
           WHEN COALESCE(r.price, 0) = 0 THEN
             CASE WHEN (SELECT COALESCE(SUM(p3.amount), 0) FROM payments p3
                         WHERE p3.student_id = p.student_id
                           AND YEAR(p3.paid_at) = YEAR(p.paid_at)
                           AND MONTH(p3.paid_at) = MONTH(p.paid_at)) > 0
                  THEN 'Paid' ELSE 'Unpaid' END
           WHEN (SELECT COALESCE(SUM(p4.amount), 0) FROM payments p4
                  WHERE p4.student_id = p.student_id
                    AND YEAR(p4.paid_at) = YEAR(p.paid_at)
                    AND MONTH(p4.paid_at) = MONTH(p.paid_at)) >= r.price THEN 'Paid'
           WHEN (SELECT COALESCE(SUM(p5.amount), 0) FROM payments p5
                  WHERE p5.student_id = p.student_id
                    AND YEAR(p5.paid_at) = YEAR(p.paid_at)
                    AND MONTH(p5.paid_at) = MONTH(p.paid_at)) > 0 THEN 'Partial'
           ELSE 'Unpaid'
         END AS status
    FROM payments p
    JOIN students s ON s.id = p.student_id
    LEFT JOIN allocations a ON a.student_id = s.id AND a.vacated_at IS NULL
    LEFT JOIN rooms r ON r.id = a.room_id`;

async function list(req, res) {
  const [rows] = await pool.query(`${paymentSelect} ORDER BY p.paid_at DESC, p.id DESC`);
  res.json(rows);
}

async function create(req, res) {
  const payment = paymentFields(req.body);
  const [students] = await pool.execute('SELECT id FROM students WHERE id = ?', [payment.studentId]);
  if (!students.length) throw new HttpError(404, 'Student was not found.');
  const [result] = await pool.execute(
    'INSERT INTO payments (student_id, amount, payment_method, paid_at) VALUES (?, ?, ?, ?)',
    [payment.studentId, payment.amount, payment.method, payment.paidAt]
  );
  res.status(201).json({ id: result.insertId, message: 'Payment recorded successfully.' });
}

async function update(req, res) {
  const id = positiveInteger(req.params.id, 'Payment');
  const payment = paymentFields(req.body);
  const [result] = await pool.execute(
    `UPDATE payments SET student_id = ?, amount = ?, payment_method = ?, paid_at = ?
     WHERE id = ?`,
    [payment.studentId, payment.amount, payment.method, payment.paidAt, id]
  );
  if (!result.affectedRows) throw new HttpError(404, 'Payment was not found.');
  res.json({ message: 'Payment updated successfully.' });
}

async function remove(req, res) {
  const id = positiveInteger(req.params.id, 'Payment');
  const [result] = await pool.execute('DELETE FROM payments WHERE id = ?', [id]);
  if (!result.affectedRows) throw new HttpError(404, 'Payment was not found.');
  res.json({ message: 'Payment deleted successfully.' });
}

module.exports = { list, create, update, remove };
