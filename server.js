const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const RATE = 12500;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "CayoAdmin2026!";
const SESSION_SECRET =
  process.env.SESSION_SECRET || "change-this-secret-on-railway";

const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");

function createEmptyDatabase() {
  return {
    requests: [],
    members: [],
    entries: [],
    payments: []
  };
}

function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(createEmptyDatabase(), null, 2),
      "utf8"
    );
  }
}

function loadDatabase() {
  ensureDatabase();

  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));

    if (!Array.isArray(data.requests)) data.requests = [];
    if (!Array.isArray(data.members)) data.members = [];
    if (!Array.isArray(data.entries)) data.entries = [];
    if (!Array.isArray(data.payments)) data.payments = [];

    return data;
  } catch (error) {
    console.error("Base illisible, réinitialisation :", error);

    const data = createEmptyDatabase();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");

    return data;
  }
}

function saveDatabase(database) {
  ensureDatabase();
  fs.writeFileSync(DB_FILE, JSON.stringify(database, null, 2), "utf8");
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getEntryDuration(entry) {
  const start = new Date(entry.start).getTime();
  const end = entry.end ? new Date(entry.end).getTime() : Date.now();

  return Math.max(0, end - start);
}

function calculatePay(durationMs) {
  return Math.round((durationMs / 3600000) * RATE);
}

function getMemberByDevice(database, deviceToken) {
  return database.members.find((member) => {
    return (
      member.active &&
      Array.isArray(member.deviceTokens) &&
      member.deviceTokens.includes(deviceToken)
    );
  });
}

function requireAdmin(request, response, next) {
  if (!request.session.isAdmin) {
    return response.status(403).json({
      error: "Accès administrateur requis."
    });
  }

  next();
}

app.use(express.json());

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 12
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (request, response) => {
  response.json({
    ok: true,
    rate: RATE,
    version: "1.0.0"
  });
});

app.post("/api/access/request", (request, response) => {
  const body = request.body || {};

  const firstName = String(body.firstName || "").trim();
  const lastName = String(body.lastName || "").trim();
  const deviceToken = String(body.deviceToken || "").trim();

  if (!firstName || !lastName || !deviceToken) {
    return response.status(400).json({
      error: "Le prénom RP, le nom RP et l’appareil sont obligatoires."
    });
  }

  const database = loadDatabase();
  const fullName = `${firstName} ${lastName}`.replace(/\s+/g, " ").trim();
  const normalizedName = normalizeName(fullName);

  const existingMember = database.members.find((member) => {
    const sameName = normalizeName(member.fullName) === normalizedName;
    const sameDevice =
      Array.isArray(member.deviceTokens) &&
      member.deviceTokens.includes(deviceToken);

    return sameName || sameDevice;
  });

  if (existingMember) {
    if (existingMember.active && existingMember.deviceTokens.includes(deviceToken)) {
      return response.status(400).json({
        error: "Cet appareil possède déjà un accès."
      });
    }

    return response.status(400).json({
      error: "Ce nom ou cet appareil est déjà enregistré."
    });
  }

  const pendingRequest = database.requests.find((item) => {
    return (
      item.status === "pending" &&
      (
        normalizeName(item.fullName) === normalizedName ||
        item.deviceToken === deviceToken
      )
    );
  });

  if (pendingRequest) {
    return response.status(400).json({
      error: "Une demande est déjà en attente."
    });
  }

  database.requests.push({
    id: Date.now(),
    firstName,
    lastName,
    fullName,
    deviceToken,
    status: "pending",
    createdAt: new Date().toISOString()
  });

  saveDatabase(database);

  response.json({
    ok: true,
    message: "Demande envoyée au Général."
  });
});

app.post("/api/member/session", (request, response) => {
  const deviceToken = String(request.body?.deviceToken || "").trim();
  const database = loadDatabase();
  const member = getMemberByDevice(database, deviceToken);

  if (!member) {
    return response.status(401).json({
      error: "Cet appareil n’est pas autorisé."
    });
  }

  response.json({
    member: {
      id: member.id,
      fullName: member.fullName
    }
  });
});

app.post("/api/member/dashboard", (request, response) => {
  const deviceToken = String(request.body?.deviceToken || "").trim();
  const database = loadDatabase();
  const member = getMemberByDevice(database, deviceToken);

  if (!member) {
    return response.status(401).json({
      error: "Accès invalide ou désactivé."
    });
  }

  const entries = database.entries
    .filter((entry) => entry.memberId === member.id)
    .sort((a, b) => new Date(b.start) - new Date(a.start));

  const activeEntry = entries.find((entry) => !entry.end) || null;

  const unpaidEntries = entries.filter((entry) => {
    if (!entry.end) return false;

    return !database.payments.some(
      (payment) => payment.entryId === entry.id
    );
  });

  const unpaidHoursMs = unpaidEntries.reduce(
    (total, entry) => total + getEntryDuration(entry),
    0
  );

  const amountToPay = unpaidEntries.reduce(
    (total, entry) => total + calculatePay(getEntryDuration(entry)),
    0
  );

  response.json({
    rate: RATE,
    member: {
      id: member.id,
      fullName: member.fullName
    },
    activeEntry,
    unpaidHoursMs,
    amountToPay,
    entries: entries.map((entry) => {
      const durationMs = getEntryDuration(entry);
      const paid = database.payments.some(
        (payment) => payment.entryId === entry.id
      );

      return {
        id: entry.id,
        start: entry.start,
        end: entry.end,
        durationMs,
        amount: calculatePay(durationMs),
        paid
      };
    })
  });
});

app.post("/api/member/clock-in", (request, response) => {
  const deviceToken = String(request.body?.deviceToken || "").trim();
  const database = loadDatabase();
  const member = getMemberByDevice(database, deviceToken);

  if (!member) {
    return response.status(401).json({
      error: "Accès invalide."
    });
  }

  const alreadyActive = database.entries.some(
    (entry) => entry.memberId === member.id && !entry.end
  );

  if (alreadyActive) {
    return response.status(400).json({
      error: "Vous êtes déjà en service."
    });
  }

  database.entries.push({
    id: Date.now(),
    memberId: member.id,
    start: new Date().toISOString(),
    end: null
  });

  saveDatabase(database);

  response.json({
    ok: true
  });
});

app.post("/api/member/clock-out", (request, response) => {
  const deviceToken = String(request.body?.deviceToken || "").trim();
  const database = loadDatabase();
  const member = getMemberByDevice(database, deviceToken);

  if (!member) {
    return response.status(401).json({
      error: "Accès invalide."
    });
  }

  const activeEntry = database.entries.find(
    (entry) => entry.memberId === member.id && !entry.end
  );

  if (!activeEntry) {
    return response.status(400).json({
      error: "Vous n’êtes pas en service."
    });
  }

  activeEntry.end = new Date().toISOString();
  saveDatabase(database);

  const durationMs = getEntryDuration(activeEntry);

  response.json({
    ok: true,
    durationMs,
    amount: calculatePay(durationMs)
  });
});

app.post("/api/admin/login", (request, response) => {
  const password = String(request.body?.password || "");

  if (password !== ADMIN_PASSWORD) {
    return response.status(401).json({
      error: "Mot de passe administrateur incorrect."
    });
  }

  request.session.isAdmin = true;

  response.json({
    ok: true
  });
});

app.post("/api/admin/logout", (request, response) => {
  request.session.isAdmin = false;

  response.json({
    ok: true
  });
});

app.get("/api/admin/status", (request, response) => {
  response.json({
    isAdmin: Boolean(request.session.isAdmin)
  });
});

app.get("/api/admin/dashboard", requireAdmin, (request, response) => {
  const database = loadDatabase();

  const members = database.members.map((member) => {
    const entries = database.entries.filter(
      (entry) => entry.memberId === member.id
    );

    const activeEntry = entries.find((entry) => !entry.end) || null;

    const unpaidEntries = entries.filter((entry) => {
      if (!entry.end) return false;

      return !database.payments.some(
        (payment) => payment.entryId === entry.id
      );
    });

    const unpaidHoursMs = unpaidEntries.reduce(
      (total, entry) => total + getEntryDuration(entry),
      0
    );

    const amountToPay = unpaidEntries.reduce(
      (total, entry) => total + calculatePay(getEntryDuration(entry)),
      0
    );

    return {
      id: member.id,
      fullName: member.fullName,
      active: member.active,
      activeEntry,
      unpaidHoursMs,
      amountToPay
    };
  });

  response.json({
    rate: RATE,
    requests: database.requests
      .filter((item) => item.status === "pending")
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    members
  });
});

app.post(
  "/api/admin/requests/:id/approve",
  requireAdmin,
  (request, response) => {
    const database = loadDatabase();
    const accessRequest = database.requests.find(
      (item) =>
        item.id === Number(request.params.id) &&
        item.status === "pending"
    );

    if (!accessRequest) {
      return response.status(404).json({
        error: "Demande introuvable."
      });
    }

    database.members.push({
      id: Date.now(),
      fullName: accessRequest.fullName,
      active: true,
      deviceTokens: [accessRequest.deviceToken],
      createdAt: new Date().toISOString()
    });

    accessRequest.status = "approved";
    accessRequest.reviewedAt = new Date().toISOString();

    saveDatabase(database);

    response.json({
      ok: true
    });
  }
);

app.post(
  "/api/admin/requests/:id/reject",
  requireAdmin,
  (request, response) => {
    const database = loadDatabase();
    const accessRequest = database.requests.find(
      (item) =>
        item.id === Number(request.params.id) &&
        item.status === "pending"
    );

    if (!accessRequest) {
      return response.status(404).json({
        error: "Demande introuvable."
      });
    }

    accessRequest.status = "rejected";
    accessRequest.reviewedAt = new Date().toISOString();

    saveDatabase(database);

    response.json({
      ok: true
    });
  }
);

app.post(
  "/api/admin/members/:id/pay",
  requireAdmin,
  (request, response) => {
    const database = loadDatabase();
    const memberId = Number(request.params.id);

    const member = database.members.find((item) => item.id === memberId);

    if (!member) {
      return response.status(404).json({
        error: "Milicien introuvable."
      });
    }

    const entriesToPay = database.entries.filter((entry) => {
      if (entry.memberId !== memberId || !entry.end) return false;

      return !database.payments.some(
        (payment) => payment.entryId === entry.id
      );
    });

    const totalAmount = entriesToPay.reduce(
      (total, entry) => total + calculatePay(getEntryDuration(entry)),
      0
    );

    const paidAt = new Date().toISOString();

    entriesToPay.forEach((entry, index) => {
      database.payments.push({
        id: Date.now() + index,
        memberId,
        entryId: entry.id,
        amount: calculatePay(getEntryDuration(entry)),
        paidAt
      });
    });

    saveDatabase(database);

    response.json({
      ok: true,
      totalAmount,
      entriesPaid: entriesToPay.length
    });
  }
);

app.put(
  "/api/admin/members/:id/status",
  requireAdmin,
  (request, response) => {
    const database = loadDatabase();
    const member = database.members.find(
      (item) => item.id === Number(request.params.id)
    );

    if (!member) {
      return response.status(404).json({
        error: "Milicien introuvable."
      });
    }

    member.active = Boolean(request.body?.active);
    saveDatabase(database);

    response.json({
      ok: true
    });
  }
);

app.get("*", (request, response) => {
  response.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Pointeuse Cayo Perico lancée sur le port ${PORT}`
  );
});
