CREATE TABLE IF NOT EXISTS admins (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS students (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reg_no VARCHAR(50) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  gender ENUM('Female', 'Male', 'Other') NOT NULL,
  phone VARCHAR(40) NOT NULL,
  email VARCHAR(254) NULL UNIQUE,
  address VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rooms (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_number VARCHAR(30) NOT NULL UNIQUE,
  capacity INT UNSIGNED NOT NULL,
  price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  description VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_room_capacity CHECK (capacity > 0),
  CONSTRAINT chk_room_price CHECK (price >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS allocations (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id INT UNSIGNED NOT NULL,
  room_id INT UNSIGNED NOT NULL,
  allocated_at DATE NOT NULL,
  vacated_at DATE NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_allocations_room_active (room_id, vacated_at),
  INDEX idx_allocations_student_active (student_id, vacated_at),
  CONSTRAINT fk_allocations_student FOREIGN KEY (student_id)
    REFERENCES students (id) ON DELETE CASCADE,
  CONSTRAINT fk_allocations_room FOREIGN KEY (room_id)
    REFERENCES rooms (id) ON DELETE RESTRICT,
  CONSTRAINT chk_allocation_dates CHECK (vacated_at IS NULL OR vacated_at >= allocated_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id INT UNSIGNED NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method ENUM('Cash', 'Bank transfer', 'Mobile money', 'Card') NOT NULL,
  paid_at DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_payments_student_date (student_id, paid_at),
  CONSTRAINT fk_payments_student FOREIGN KEY (student_id)
    REFERENCES students (id) ON DELETE CASCADE,
  CONSTRAINT chk_payment_amount CHECK (amount > 0)
) ENGINE=InnoDB;

INSERT IGNORE INTO rooms (room_number, capacity, price, description) VALUES
  ('A-101', 2, 450.00, 'Ground floor, near the common room'),
  ('A-102', 3, 400.00, 'First floor');

INSERT IGNORE INTO students (reg_no, full_name, gender, phone, email, address) VALUES
  ('STU-2026-001', 'Amina Example', 'Female', '+1 555 0101', 'amina@example.edu', '12 Campus Road'),
  ('STU-2026-002', 'Daniel Example', 'Male', '+1 555 0102', 'daniel@example.edu', '8 College Avenue');

INSERT INTO allocations (student_id, room_id, allocated_at)
SELECT s.id, r.id, CURRENT_DATE
  FROM students s
  JOIN rooms r ON r.room_number = 'A-101'
 WHERE s.reg_no = 'STU-2026-001'
   AND NOT EXISTS (
     SELECT 1 FROM allocations a WHERE a.student_id = s.id AND a.vacated_at IS NULL
   );

INSERT INTO payments (student_id, amount, payment_method, paid_at)
SELECT s.id, 150.00, 'Mobile money', CURRENT_DATE
  FROM students s
 WHERE s.reg_no = 'STU-2026-001'
   AND NOT EXISTS (
     SELECT 1 FROM payments p WHERE p.student_id = s.id AND p.paid_at = CURRENT_DATE
   );
