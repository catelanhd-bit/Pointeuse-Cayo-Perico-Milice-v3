
const express = require("express");
const session = require("express-session");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const RATE = 12500;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = stored.split(":");
  const actual = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(expected, "hex"));
}

function initialDb() {
  return {
    users: [
      {
        id: 1,
        username: "admin",
        displayName: "Général T. Barbosa",
        role: "admin",
        passwordHash: hashPassword("Cayo123!")
      },
      {
        id: 2,
        username: "milicien",
        displayName: "Milicien Démo",
        role: "member",
        passwordHash: hashPassword("Cayo123!")
      }
    ],
    entries: [],
    payments: []
  };
}

function ensureDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialDb(), null, 2));
  }
}

function loadDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveDb(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role
  };
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: "Vous devez être connecté." });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "admin") {
    return res.status(403).json({ error: "Accès administrateur requis." });
  }
  next();
}

function getDurationMs(entry) {
  const end = entry.end ? new Date(entry.end).getTime() : Date.now();
  return Math.max(0, end - new Date(entry.start).getTime());
}

function getBonus(ms) {
  return Math.round((ms / 3600000) * RATE);
}

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || "cayo-perico-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 1000 * 60 * 60 * 12
  }
}));

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => res.json({ ok: true }));

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null, rate: RATE });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const db = loadDb();
  const user = db.users.find(
    (u) => u.username.toLowerCase() === String(username || "").toLowerCase()
  );

  if (!user || !verifyPassword(String(password || ""), user.passwordHash)) {
    return res.status(401).json({ error: "Identifiant ou mot de passe incorrect." });
  }

  req.session.user = publicUser(user);
  res.json({ user: req.session.user, rate: RATE });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/member/dashboard", requireAuth, (req, res) => {
  const db = loadDb();
  const userId = req.session.user.id;
  const entries = db.entries
    .filter((entry) => entry.userId === userId)
    .sort((a, b) => new Date(b.start) - new Date(a.start));

  const completed = entries.filter((entry) => entry.end);
  const active = entries.find((entry) => !entry.end) || null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week = new Date(today);
  week.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const month = new Date(now.getFullYear(), now.getMonth(), 1);

  const sumSince = (date) =>
    completed
      .filter((entry) => new Date(entry.start) >= date)
      .reduce((total, entry) => total + getDurationMs(entry), 0);

  res.json({
    active,
    rate: RATE,
    stats: {
      todayMs: sumSince(today),
      weekMs: sumSince(week),
      monthMs: sumSince(month),
      totalMs: completed.reduce((total, entry) => total + getDurationMs(entry), 0),
      totalBonus: completed.reduce((total, entry) => total + getBonus(getDurationMs(entry)), 0)
    },
    entries: entries.map((entry) => ({
      ...entry,
      durationMs: getDurationMs(entry),
      bonus: getBonus(getDurationMs(entry))
    }))
  });
});

app.post("/api/member/clock-in", requireAuth, (req, res) => {
  const db = loadDb();
  const existing = db.entries.find(
    (entry) => entry.userId === req.session.user.id && !entry.end
  );
  if (existing) return res.status(400).json({ error: "Un service est déjà en cours." });

  const entry = {
    id: Date.now(),
    userId: req.session.user.id,
    start: new Date().toISOString(),
    end: null,
    createdBy: req.session.user.id
  };

  db.entries.push(entry);
  saveDb(db);
  res.json(entry);
});

app.post("/api/member/clock-out", requireAuth, (req, res) => {
  const db = loadDb();
  const entry = db.entries.find(
    (item) => item.userId === req.session.user.id && !item.end
  );

  if (!entry) return res.status(400).json({ error: "Aucun service en cours." });

  entry.end = new Date().toISOString();
  saveDb(db);

  res.json({
    ...entry,
    durationMs: getDurationMs(entry),
    bonus: getBonus(getDurationMs(entry))
  });
});

app.get("/api/admin/dashboard", requireAdmin, (req, res) => {
  const db = loadDb();
  const completed = db.entries.filter((entry) => entry.end);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const week = new Date(today);
  week.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  const entries = db.entries
    .map((entry) => {
      const user = db.users.find((u) => u.id === entry.userId);
      const paid = db.payments.some((payment) => payment.entryId === entry.id);
      return {
        ...entry,
        member: user?.displayName || "Membre supprimé",
        username: user?.username || "",
        durationMs: getDurationMs(entry),
        bonus: getBonus(getDurationMs(entry)),
        paid
      };
    })
    .sort((a, b) => new Date(b.start) - new Date(a.start));

  const unpaidEntries = completed.filter(
    (entry) => !db.payments.some((payment) => payment.entryId === entry.id)
  );

  res.json({
    rate: RATE,
    users: db.users.map(publicUser),
    entries,
    stats: {
      members: db.users.filter((u) => u.role === "member").length,
      active: db.entries.filter((entry) => !entry.end).length,
      todayMs: completed
        .filter((entry) => new Date(entry.start) >= today)
        .reduce((total, entry) => total + getDurationMs(entry), 0),
      weekMs: completed
        .filter((entry) => new Date(entry.start) >= week)
        .reduce((total, entry) => total + getDurationMs(entry), 0),
      unpaidTotal: unpaidEntries.reduce(
        (total, entry) => total + getBonus(getDurationMs(entry)),
        0
      )
    }
  });
});

app.post("/api/admin/users", requireAdmin, (req, res) => {
  const { username, displayName, password, role = "member" } = req.body || {};
  if (!username || !displayName || !password) {
    return res.status(400).json({ error: "Tous les champs sont obligatoires." });
  }

  const db = loadDb();
  if (db.users.some((u) => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: "Cet identifiant est déjà utilisé." });
  }

  const user = {
    id: Date.now(),
    username,
    displayName,
    role: role === "admin" ? "admin" : "member",
    passwordHash: hashPassword(password)
  };

  db.users.push(user);
  saveDb(db);
  res.json(publicUser(user));
});

app.put("/api/admin/users/:id", requireAdmin, (req, res) => {
  const db = loadDb();
  const user = db.users.find((u) => u.id === Number(req.params.id));
  if (!user) return res.status(404).json({ error: "Membre introuvable." });

  const { displayName, password, role } = req.body || {};
  if (displayName) user.displayName = displayName;
  if (password) user.passwordHash = hashPassword(password);
  if (role && user.id !== req.session.user.id) {
    user.role = role === "admin" ? "admin" : "member";
  }

  saveDb(db);
  res.json(publicUser(user));
});

app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.session.user.id) {
    return res.status(400).json({ error: "Vous ne pouvez pas supprimer votre propre compte." });
  }

  const db = loadDb();
  const entryIds = db.entries.filter((e) => e.userId === id).map((e) => e.id);
  db.users = db.users.filter((u) => u.id !== id);
  db.entries = db.entries.filter((e) => e.userId !== id);
  db.payments = db.payments.filter((p) => !entryIds.includes(p.entryId));
  saveDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/entries", requireAdmin, (req, res) => {
  const { userId, start, end } = req.body || {};
  if (!userId || !start || !end || new Date(end) <= new Date(start)) {
    return res.status(400).json({ error: "Les horaires sont invalides." });
  }

  const db = loadDb();
  const entry = {
    id: Date.now(),
    userId: Number(userId),
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    createdBy: req.session.user.id
  };

  db.entries.push(entry);
  saveDb(db);
  res.json(entry);
});

app.put("/api/admin/entries/:id", requireAdmin, (req, res) => {
  const db = loadDb();
  const entry = db.entries.find((e) => e.id === Number(req.params.id));
  if (!entry) return res.status(404).json({ error: "Pointage introuvable." });

  const { start, end } = req.body || {};
  if (start) entry.start = new Date(start).toISOString();
  if (end) entry.end = new Date(end).toISOString();

  if (entry.end && new Date(entry.end) <= new Date(entry.start)) {
    return res.status(400).json({ error: "L'heure de fin doit être après l'heure de début." });
  }

  saveDb(db);
  res.json(entry);
});

app.delete("/api/admin/entries/:id", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const db = loadDb();
  db.entries = db.entries.filter((e) => e.id !== id);
  db.payments = db.payments.filter((p) => p.entryId !== id);
  saveDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/entries/:id/pay", requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const db = loadDb();
  const entry = db.entries.find((e) => e.id === id && e.end);
  if (!entry) {
    return res.status(404).json({ error: "Ce pointage n'existe pas ou est encore actif." });
  }

  const existing = db.payments.find((p) => p.entryId === id);
  if (existing) {
    db.payments = db.payments.filter((p) => p.entryId !== id);
  } else {
    db.payments.push({
      id: Date.now(),
      entryId: id,
      paidAt: new Date().toISOString(),
      paidBy: req.session.user.id,
      amount: getBonus(getDurationMs(entry))
    });
  }

  saveDb(db);
  res.json({ paid: !existing });
});

app.get("/api/admin/export.csv", requireAdmin, (req, res) => {
  const db = loadDb();
  const rows = [["Nom", "Identifiant", "Début", "Fin", "Durée (heures)", "Prime", "Payé"]];

  db.entries.filter((entry) => entry.end).forEach((entry) => {
    const user = db.users.find((u) => u.id === entry.userId);
    const duration = getDurationMs(entry);
    const paid = db.payments.some((p) => p.entryId === entry.id);

    rows.push([
      user?.displayName || "Membre supprimé",
      user?.username || "",
      entry.start,
      entry.end,
      (duration / 3600000).toFixed(2),
      getBonus(duration),
      paid ? "Oui" : "Non"
    ]);
  });

  const csv = rows
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";"))
    .join("\n");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="pointages-cayo.csv"');
  res.send("\uFEFF" + csv);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

ensureDb();
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Pointeuse Cayo Perico lancée sur le port ${PORT}`);
});
