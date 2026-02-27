try { require("dotenv").config(); } catch (e) {}

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const db = require("./db");

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || "development-secret-change-me";

/* ===================== UPLOAD FOLDER ===================== */
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname || ""));
  },
});
const upload = multer({ storage });

/* ===================== MIDDLEWARE ===================== */
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(uploadDir));

/* ⭐ SERVE FRONTEND FROM ROOT (IMPORTANT FOR YOUR REPO) */
app.use(express.static(__dirname));

/* ===================== AUTH HELPERS ===================== */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer "))
    return res.status(401).json({ error: "Unauthorized" });

  try {
    req.user = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin")
    return res.status(403).json({ error: "Admin access required" });
  next();
}

function createNotification(userId, complaintId, type, message) {
  db.run(
    `INSERT INTO notifications (user_id, complaint_id, type, message)
     VALUES (?, ?, ?, ?)`,
    [userId, complaintId || null, type, message]
  );
}

/* ===================== AUTH ROUTES ===================== */
app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: "All fields required" });

  const hash = bcrypt.hashSync(password, 10);

  db.run(
    `INSERT INTO users (name,email,password_hash) VALUES (?,?,?)`,
    [name, email.toLowerCase(), hash],
    function (err) {
      if (err) return res.status(500).json({ error: "Registration failed" });

      const user = { id: this.lastID, name, email, role: "user" };
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
      res.json({ token, user });
    }
  );
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;

  db.get(
    `SELECT * FROM users WHERE email=?`,
    [email.toLowerCase()],
    (err, row) => {
      if (!row || !bcrypt.compareSync(password, row.password_hash))
        return res.status(401).json({ error: "Invalid credentials" });

      const user = { id: row.id, name: row.name, email: row.email, role: row.role };
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
      res.json({ token, user });
    }
  );
});

/* ===================== COMPLAINT ROUTES ===================== */
app.post("/api/complaints", authMiddleware, upload.single("image"), (req, res) => {
  const { category, description } = req.body;
  const image = req.file ? `/uploads/${req.file.filename}` : null;

  db.run(
    `INSERT INTO complaints (user_id,category,description,image_path)
     VALUES (?,?,?,?)`,
    [req.user.id, category, description, image],
    function (err) {
      if (err) return res.status(500).json({ error: "Failed to submit complaint" });

      createNotification(req.user.id, this.lastID, "complaint_submitted", "Complaint submitted");
      res.json({ id: this.lastID });
    }
  );
});

app.get("/api/complaints", authMiddleware, (req, res) => {
  db.all(`SELECT * FROM complaints WHERE user_id=?`, [req.user.id], (err, rows) => {
    if (err) return res.status(500).json({ error: "Failed to load complaints" });
    res.json(rows);
  });
});

/* ===================== FALLBACK TO INDEX ===================== */
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* ===================== START SERVER ===================== */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
