const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const path = require("path");

const dbPath = path.join(__dirname, "data", "municipal_portal.db");

function createDatabase() {
  const fs = require("fs");
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new sqlite3.Database(dbPath);

  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS complaints (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        image_path TEXT,
        latitude REAL,
        longitude REAL,
        location_text TEXT,
        status TEXT NOT NULL DEFAULT 'Pending',
        assigned_to TEXT,
        admin_remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        complaint_id INTEGER,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (complaint_id) REFERENCES complaints(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS complaint_status_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        complaint_id INTEGER NOT NULL,
        old_status TEXT,
        new_status TEXT NOT NULL,
        changed_by TEXT,
        changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (complaint_id) REFERENCES complaints(id)
      )
    `);

    db.run(
      `
      INSERT OR IGNORE INTO users (id, name, email, password_hash, role)
      VALUES (
        1,
        'System Administrator',
        'admin@municipal.local',
        ?,
        'admin'
      )
    `
    , [bcrypt.hashSync("Admin@123", 10)]);

    db.run(
      `
      UPDATE users
      SET password_hash = ?
      WHERE email = 'admin@municipal.local' AND role = 'admin'
    `,
      [bcrypt.hashSync("Admin@123", 10)]
    );
  });

  return db;
}

const db = createDatabase();

module.exports = db;
