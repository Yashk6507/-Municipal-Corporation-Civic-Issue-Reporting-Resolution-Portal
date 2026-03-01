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

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname || "");
    cb(null, uniqueSuffix + ext);
  },
});

const upload = multer({ storage });

app.use(
  cors({
    origin: "*",
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(uploadDir));
app.use(express.static(path.join(__dirname, "public")));

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}

function createNotification(userId, complaintId, type, message) {
  db.run(
    `
    INSERT INTO notifications (user_id, complaint_id, type, message)
    VALUES (?, ?, ?, ?)
  `,
    [userId, complaintId || null, type, message],
    (err) => {
      if (err) {
        console.error("Failed to create notification", err);
      }
    }
  );
}

app.post("/api/auth/register", (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email and password are required" });
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  db.run(
    `
    INSERT INTO users (name, email, password_hash)
    VALUES (?, ?, ?)
  `,
    [name, email.toLowerCase(), passwordHash],
    function (err) {
      if (err) {
        if (err.message && err.message.includes("UNIQUE")) {
          return res.status(409).json({ error: "Email already registered" });
        }
        console.error(err);
        return res.status(500).json({ error: "Failed to register user" });
      }
      const user = {
        id: this.lastID,
        name,
        email: email.toLowerCase(),
        role: "user",
      };
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
      res.json({ token, user });
    }
  );
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  db.get(
    `
    SELECT id, name, email, password_hash, role
    FROM users
    WHERE email = ?
  `,
    [email.toLowerCase()],
    (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Login failed" });
      }
      if (!row) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const matches = bcrypt.compareSync(password, row.password_hash);
      if (!matches) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
      const user = {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
      };
      const token = jwt.sign(user, JWT_SECRET, { expiresIn: "7d" });
      res.json({ token, user });
    }
  );
});

app.get("/api/auth/me", authMiddleware, (req, res) => {
  db.get(
    `
    SELECT id, name, email, role, created_at
    FROM users
    WHERE id = ?
  `,
    [req.user.id],
    (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to load profile" });
      }
      res.json({ user: row });
    }
  );
});

app.post(
  "/api/complaints",
  authMiddleware,
  upload.single("image"),
  (req, res) => {
    const {
      category,
      description,
      latitude,
      longitude,
      location_text,
    } = req.body;

    if (!category || !description) {
      return res
        .status(400)
        .json({ error: "Category and description are required" });
    }

    const imagePath = req.file ? `/uploads/${req.file.filename}` : null;

    db.run(
      `
      INSERT INTO complaints (
        user_id,
        category,
        description,
        image_path,
        latitude,
        longitude,
        location_text
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      [
        req.user.id,
        category,
        description,
        imagePath,
        latitude ? Number(latitude) : null,
        longitude ? Number(longitude) : null,
        location_text || null,
      ],
      function (err) {
        if (err) {
          console.error(err);
          return res.status(500).json({ error: "Failed to submit complaint" });
        }

        const complaintId = this.lastID;
        createNotification(
          req.user.id,
          complaintId,
          "complaint_submitted",
          "Your complaint has been submitted."
        );

        db.get(
          `
          SELECT *
          FROM complaints
          WHERE id = ?
        `,
          [complaintId],
          (err2, row) => {
            if (err2) {
              console.error(err2);
              return res
                .status(201)
                .json({ id: complaintId, status: "Pending" });
            }
            res.status(201).json(row);
          }
        );
      }
    );
  }
);

app.get("/api/complaints", authMiddleware, (req, res) => {
  const { status, category } = req.query;
  const isAdmin = req.user.role === "admin";

  const conditions = [];
  const params = [];

  if (!isAdmin) {
    conditions.push("c.user_id = ?");
    params.push(req.user.id);
  }

  if (status) {
    conditions.push("c.status = ?");
    params.push(status);
  }

  if (category) {
    conditions.push("c.category = ?");
    params.push(category);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  db.all(
    `
    SELECT
      c.*,
      u.name as user_name,
      u.email as user_email
    FROM complaints c
    JOIN users u ON u.id = c.user_id
    ${whereClause}
    ORDER BY c.created_at DESC
  `,
    params,
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to load complaints" });
      }
      res.json(rows);
    }
  );
});

app.get("/api/complaints/:id", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid complaint id" });
  }
  const isAdmin = req.user.role === "admin";

  const params = [id];
  let whereClause = "WHERE c.id = ?";
  if (!isAdmin) {
    whereClause += " AND c.user_id = ?";
    params.push(req.user.id);
  }

  db.get(
    `
    SELECT
      c.*,
      u.name as user_name,
      u.email as user_email
    FROM complaints c
    JOIN users u ON u.id = c.user_id
    ${whereClause}
  `,
    params,
    (err, row) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to load complaint" });
      }
      if (!row) {
        return res.status(404).json({ error: "Complaint not found" });
      }
      res.json(row);
    }
  );
});

app.patch("/api/complaints/:id", authMiddleware, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid complaint id" });
  }

  const { status, assigned_to, admin_remarks } = req.body;

  db.get(
    `
    SELECT *
    FROM complaints
    WHERE id = ?
  `,
    [id],
    (err, existing) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to load complaint" });
      }
      if (!existing) {
        return res.status(404).json({ error: "Complaint not found" });
      }

      const newStatus = status || existing.status;
      const newAssignedTo = assigned_to || existing.assigned_to;
      const newRemarks = admin_remarks || existing.admin_remarks;

      db.run(
        `
        UPDATE complaints
        SET
          status = ?,
          assigned_to = ?,
          admin_remarks = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
        [newStatus, newAssignedTo, newRemarks, id],
        function (err2) {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ error: "Failed to update complaint" });
          }

          if (existing.status !== newStatus) {
            db.run(
              `
              INSERT INTO complaint_status_history (
                complaint_id,
                old_status,
                new_status,
                changed_by
              )
              VALUES (?, ?, ?, ?)
            `,
              [id, existing.status, newStatus, req.user.email],
              (err3) => {
                if (err3) {
                  console.error("Failed to insert status history", err3);
                }
              }
            );

            createNotification(
              existing.user_id,
              id,
              "status_changed",
              `Status updated to ${newStatus}`
            );
          }

          db.get(
            `
            SELECT *
            FROM complaints
            WHERE id = ?
          `,
            [id],
            (err4, row) => {
              if (err4) {
                console.error(err4);
                return res.status(200).json({ id, status: newStatus });
              }
              res.json(row);
            }
          );
        }
      );
    }
  );
});

app.get("/api/complaints/stats", authMiddleware, requireAdmin, (req, res) => {
  db.all(
    `
    SELECT status, COUNT(*) as count
    FROM complaints
    GROUP BY status
  `,
    [],
    (err, statusRows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to load stats" });
      }

      db.all(
        `
        SELECT category, COUNT(*) as count
        FROM complaints
        GROUP BY category
      `,
        [],
        (err2, categoryRows) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ error: "Failed to load stats" });
          }

          db.all(
            `
            SELECT
              strftime('%Y-%m', created_at) as month,
              COUNT(*) as count
            FROM complaints
            GROUP BY month
            ORDER BY month ASC
          `,
            [],
            (err3, trendRows) => {
              if (err3) {
                console.error(err3);
                return res.status(500).json({ error: "Failed to load stats" });
              }

              res.json({
                byStatus: statusRows,
                byCategory: categoryRows,
                byMonth: trendRows,
              });
            }
          );
        }
      );
    }
  );
});

app.get("/api/public/overview", (req, res) => {
  db.all(
    `
    SELECT status, COUNT(*) as count
    FROM complaints
    GROUP BY status
  `,
    [],
    (err, byStatus) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to load public stats" });
      }
      db.all(
        `
        SELECT
          strftime('%Y-%m', created_at) as month,
          COUNT(*) as count
        FROM complaints
        GROUP BY month
        ORDER BY month ASC
      `,
        [],
        (err2, byMonthTotal) => {
          if (err2) {
            console.error(err2);
            return res.status(500).json({ error: "Failed to load public stats" });
          }
          db.all(
            `
            SELECT
              strftime('%Y-%m', updated_at) as month,
              COUNT(*) as count
            FROM complaints
            WHERE status = 'Resolved'
            GROUP BY month
            ORDER BY month ASC
          `,
            [],
            (err3, byMonthResolved) => {
              if (err3) {
                console.error(err3);
                return res
                  .status(500)
                  .json({ error: "Failed to load public stats" });
              }
              db.all(
                `
                SELECT
                  id,
                  category,
                  description,
                  location_text,
                  image_path,
                  latitude,
                  longitude,
                  updated_at
                FROM complaints
                WHERE status = 'Resolved'
                ORDER BY updated_at DESC
                LIMIT 12
              `,
                [],
                (err4, recentResolved) => {
                  if (err4) {
                    console.error(err4);
                    return res
                      .status(500)
                      .json({ error: "Failed to load public history" });
                  }
                  res.json({
                    byStatus,
                    byMonthTotal,
                    byMonthResolved,
                    recentResolved,
                  });
                }
              );
            }
          );
        }
      );
    }
  );
});

app.get("/api/users", authMiddleware, requireAdmin, (req, res) => {
  db.all(
    `
    SELECT id, name, email, role, created_at
    FROM users
    ORDER BY created_at DESC
  `,
    [],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to load users" });
      }
      res.json(rows);
    }
  );
});

app.patch("/api/users/:id", authMiddleware, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid user id" });
  }
  const { role } = req.body;
  if (!role) {
    return res.status(400).json({ error: "Role is required" });
  }

  db.run(
    `
    UPDATE users
    SET role = ?
    WHERE id = ?
  `,
    [role, id],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to update user" });
      }
      res.json({ id, role });
    }
  );
});

app.get("/api/notifications", authMiddleware, (req, res) => {
  db.all(
    `
    SELECT *
    FROM notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
  `,
    [req.user.id],
    (err, rows) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to load notifications" });
      }
      res.json(rows);
    }
  );
});

app.post("/api/notifications/:id/read", authMiddleware, (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "Invalid notification id" });
  }
  db.run(
    `
    UPDATE notifications
    SET is_read = 1
    WHERE id = ? AND user_id = ?
  `,
    [id, req.user.id],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "Failed to update notification" });
      }
      res.json({ id, is_read: true });
    }
  );
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Municipal portal server listening on http://localhost:${PORT}`);
  console.log("Default admin login: admin@municipal.local / Admin@123");
});