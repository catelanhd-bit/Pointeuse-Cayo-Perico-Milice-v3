const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;
const RATE = 12500;

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD || "CayoAdmin2026!";

const SESSION_SECRET =
  process.env.SESSION_SECRET || "change-this-secret-cayo";

const DATABASE_PATH = path.join(__dirname, "db.json");

/* =========================================================
   BASE DE DONNÉES
========================================================= */

function createDefaultDatabase() {
  return {
    requests: [],
    members: [],
    entries: [],
    payments: []
  };
}

function loadDatabase() {
  if (!fs.existsSync(DATABASE_PATH)) {
    fs.writeFileSync(
      DATABASE_PATH,
      JSON.stringify(createDefaultDatabase(), null, 2),
      "utf8"
    );
  }

  try {
    return JSON.parse(
      fs.readFileSync(DATABASE_PATH, "utf8")
    );
  } catch (error) {
    console.error("Erreur de lecture de la base :", error);

    const database = createDefaultDatabase();

    fs.writeFileSync(
      DATABASE_PATH,
      JSON.stringify(database, null, 2),
      "utf8"
    );

    return database;
  }
}

function saveDatabase(database) {
  fs.writeFileSync(
    DATABASE_PATH,
    JSON.stringify(database, null, 2),
    "utf8"
  );
}

/* =========================================================
   OUTILS
========================================================= */

function createDeviceToken() {
  return crypto
    .randomBytes(32)
    .toString("hex");
}

function normalizeName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function getEntryDuration(entry) {
  const start = new Date(entry.start).getTime();

  const end = entry.end
    ? new Date(entry.end).getTime()
    : Date.now();

  return Math.max(0, end - start);
}

function calculateBonus(durationMs) {
  return Math.round(
    (durationMs / 3600000) * RATE
  );
}

function findMemberByToken(database, token) {
  return database.members.find(
    (member) =>
      member.active &&
      Array.isArray(member.tokens) &&
      member.tokens.includes(token)
  );
}

function requireAdmin(request, response, next) {
  if (!request.session.admin) {
    return response.status(403).json({
      error: "Accès administrateur requis."
    });
  }

  next();
}

/* =========================================================
   CONFIGURATION EXPRESS
========================================================= */

app.use(express.json());

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 12
    }
  })
);

/* =========================================================
   ROUTES PUBLIQUES
========================================================= */

app.get("/health", (request, response) => {
  response.json({
    ok: true,
    version: "finale"
  });
});

/* =========================================================
   DEMANDE D’ACCÈS
========================================================= */

app.post("/api/request", (request, response) => {
  const {
    firstName,
    lastName,
    phone = "",
    message = "",
    deviceToken = ""
  } = request.body || {};

  if (!firstName || !lastName) {
    return response.status(400).json({
      error: "Le prénom et le nom RP sont obligatoires."
    });
  }

  const database = loadDatabase();

  const fullName = `${firstName} ${lastName}`
    .trim()
    .replace(/\s+/g, " ");

  const normalizedFullName =
    normalizeName(fullName);

  const pendingRequest =
    database.requests.find(
      (item) =>
        item.status === "pending" &&
        normalizeName(item.fullName) ===
          normalizedFullName
    );

  if (pendingRequest) {
    return response.status(400).json({
      error:
        "Une demande est déjà en attente pour ce nom."
    });
  }

  const existingMember =
    database.members.find(
      (member) =>
        member.active &&
        normalizeName(member.fullName) ===
          normalizedFullName
    );

  if (existingMember) {
    return response.status(400).json({
      error:
        "Ce membre possède déjà un accès validé."
    });
  }

  const requestItem = {
    id: Date.now(),
    fullName,
    firstName: String(firstName).trim(),
    lastName: String(lastName).trim(),
    phone: String(phone).trim(),
    message: String(message).trim(),
    deviceToken: String(deviceToken).trim(),
    status: "pending",
    createdAt: new Date().toISOString()
  };

  database.requests.push(requestItem);

  saveDatabase(database);

  response.json({
    ok: true,
    message:
      "Votre demande a été envoyée au Général."
  });
});

/* =========================================================
   CONNEXION AUTOMATIQUE PAR APPAREIL
========================================================= */

app.post(
  "/api/member/automatic-connect",
  (request, response) => {
    const { deviceToken } =
      request.body || {};

    if (!deviceToken) {
      return response.status(401).json({
        error: "Aucun appareil reconnu."
      });
    }

    const database = loadDatabase();

    const member = findMemberByToken(
      database,
      deviceToken
    );

    if (!member) {
      return response.status(401).json({
        error:
          "Cet appareil n'est pas encore autorisé."
      });
    }

    response.json({
      member: {
        id: member.id,
        fullName: member.fullName,
        grade: member.grade,
        division: member.division
      }
    });
  }
);

/* =========================================================
   CONNEXION MANUELLE PAR NOM
========================================================= */

app.post("/api/connect", (request, response) => {
  const {
    fullName,
    deviceToken = ""
  } = request.body || {};

  if (!fullName) {
    return response.status(400).json({
      error: "Indiquez votre nom RP complet."
    });
  }

  const database = loadDatabase();

  const normalizedFullName =
    normalizeName(fullName);

  const member = database.members.find(
    (item) =>
      item.active &&
      normalizeName(item.fullName) ===
        normalizedFullName
  );

  if (!member) {
    return response.status(404).json({
      error:
        "Aucun accès validé pour ce nom."
    });
  }

  if (!Array.isArray(member.tokens)) {
    member.tokens = [];
  }

  let finalToken = deviceToken;

  if (
    !finalToken ||
    !member.tokens.includes(finalToken)
  ) {
    finalToken = createDeviceToken();
    member.tokens.push(finalToken);
  }

  member.lastConnectionAt =
    new Date().toISOString();

  saveDatabase(database);

  response.json({
    member: {
      id: member.id,
      fullName: member.fullName,
      grade: member.grade,
      division: member.division
    },
    deviceToken: finalToken
  });
});

/* =========================================================
   TABLEAU DE BORD MILICIEN
========================================================= */

app.post(
  "/api/member/dashboard",
  (request, response) => {
    const { deviceToken } =
      request.body || {};

    const database = loadDatabase();

    const member = findMemberByToken(
      database,
      deviceToken
    );

    if (!member) {
      return response.status(401).json({
        error:
          "Accès invalide ou désactivé."
      });
    }

    const entries = database.entries
      .filter(
        (entry) =>
          entry.memberId === member.id
      )
      .sort(
        (a, b) =>
          new Date(b.start) -
          new Date(a.start)
      );

    const activeEntry =
      entries.find((entry) => !entry.end) ||
      null;

    const completedEntries =
      entries.filter((entry) => entry.end);

    const now = new Date();

    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    const startOfWeek =
      new Date(startOfToday);

    startOfWeek.setDate(
      startOfToday.getDate() -
        ((startOfToday.getDay() + 6) % 7)
    );

    const startOfMonth = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    function sumSince(date) {
      return completedEntries
        .filter(
          (entry) =>
            new Date(entry.start) >= date
        )
        .reduce(
          (total, entry) =>
            total +
            getEntryDuration(entry),
          0
        );
    }

    response.json({
      member: {
        id: member.id,
        fullName: member.fullName,
        grade: member.grade,
        division: member.division
      },

      active: activeEntry,

      rate: RATE,

      stats: {
        today: sumSince(startOfToday),
        week: sumSince(startOfWeek),
        month: sumSince(startOfMonth),

        totalBonus:
          completedEntries.reduce(
            (total, entry) =>
              total +
              calculateBonus(
                getEntryDuration(entry)
              ),
            0
          )
      },

      entries: entries.map((entry) => {
        const duration =
          getEntryDuration(entry);

        return {
          ...entry,
          duration,
          bonus:
            calculateBonus(duration),
          paid:
            database.payments.some(
              (payment) =>
                payment.entryId ===
                entry.id
            )
        };
      })
    });
  }
);

/* =========================================================
   DÉBUT DE SERVICE
========================================================= */

app.post(
  "/api/member/in",
  (request, response) => {
    const { deviceToken } =
      request.body || {};

    const database = loadDatabase();

    const member = findMemberByToken(
      database,
      deviceToken
    );

    if (!member) {
      return response.status(401).json({
        error: "Accès invalide."
      });
    }

    const activeEntry =
      database.entries.find(
        (entry) =>
          entry.memberId === member.id &&
          !entry.end
      );

    if (activeEntry) {
      return response.status(400).json({
        error:
          "Un service est déjà en cours."
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
  }
);

/* =========================================================
   FIN DE SERVICE
========================================================= */

app.post(
  "/api/member/out",
  (request, response) => {
    const { deviceToken } =
      request.body || {};

    const database = loadDatabase();

    const member = findMemberByToken(
      database,
      deviceToken
    );

    if (!member) {
      return response.status(401).json({
        error: "Accès invalide."
      });
    }

    const activeEntry =
      database.entries.find(
        (entry) =>
          entry.memberId === member.id &&
          !entry.end
      );

    if (!activeEntry) {
      return response.status(400).json({
        error:
          "Aucun service n'est actuellement en cours."
      });
    }

    activeEntry.end =
      new Date().toISOString();

    saveDatabase(database);

    response.json({
      ok: true,
      duration:
        getEntryDuration(activeEntry),
      bonus:
        calculateBonus(
          getEntryDuration(activeEntry)
        )
    });
  }
);

/* =========================================================
   CONNEXION ADMIN
========================================================= */

app.post(
  "/api/admin/login",
  (request, response) => {
    const { password } =
      request.body || {};

    if (password !== ADMIN_PASSWORD) {
      return response.status(401).json({
        error:
          "Mot de passe administrateur incorrect."
      });
    }

    request.session.admin = true;

    response.json({
      ok: true
    });
  }
);

app.post(
  "/api/admin/logout",
  (request, response) => {
    request.session.admin = false;

    response.json({
      ok: true
    });
  }
);

app.get(
  "/api/admin/status",
  (request, response) => {
    response.json({
      admin:
        Boolean(request.session.admin)
    });
  }
);

/* =========================================================
   DONNÉES ADMIN
========================================================= */

app.get(
  "/api/admin/data",
  requireAdmin,
  (request, response) => {
    const database = loadDatabase();

    const entries =
      database.entries
        .map((entry) => {
          const member =
            database.members.find(
              (item) =>
                item.id ===
                entry.memberId
            );

          const duration =
            getEntryDuration(entry);

          return {
            ...entry,

            memberName:
              member?.fullName ||
              "Membre supprimé",

            grade:
              member?.grade || "",

            duration,

            bonus:
              calculateBonus(duration),

            paid:
              database.payments.some(
                (payment) =>
                  payment.entryId ===
                  entry.id
              )
          };
        })
        .sort(
          (a, b) =>
            new Date(b.start) -
            new Date(a.start)
        );

    response.json({
      requests:
        database.requests
          .filter(
            (item) =>
              item.status === "pending"
          )
          .sort(
            (a, b) =>
              new Date(b.createdAt) -
              new Date(a.createdAt)
          ),

      members:
        database.members,

      entries
    });
  }
);

/* =========================================================
   ACCEPTER UNE DEMANDE
========================================================= */

app.post(
  "/api/admin/request/:id/approve",
  requireAdmin,
  (request, response) => {
    const database = loadDatabase();

    const accessRequest =
      database.requests.find(
        (item) =>
          item.id ===
            Number(request.params.id) &&
          item.status === "pending"
      );

    if (!accessRequest) {
      return response.status(404).json({
        error: "Demande introuvable."
      });
    }

    const tokens = [];

    if (accessRequest.deviceToken) {
      tokens.push(
        accessRequest.deviceToken
      );
    }

    const member = {
      id: Date.now(),

      fullName:
        accessRequest.fullName,

      grade:
        request.body?.grade ||
        "Milicien",

      division:
        request.body?.division ||
        "Générale",

      active: true,

      tokens,

      createdAt:
        new Date().toISOString()
    };

    database.members.push(member);

    accessRequest.status =
      "approved";

    accessRequest.reviewedAt =
      new Date().toISOString();

    saveDatabase(database);

    response.json({
      ok: true,
      member
    });
  }
);

/* =========================================================
   REFUSER UNE DEMANDE
========================================================= */

app.post(
  "/api/admin/request/:id/reject",
  requireAdmin,
  (request, response) => {
    const database = loadDatabase();

    const accessRequest =
      database.requests.find(
        (item) =>
          item.id ===
          Number(request.params.id)
      );

    if (!accessRequest) {
      return response.status(404).json({
        error: "Demande introuvable."
      });
    }

    accessRequest.status =
      "rejected";

    accessRequest.reviewedAt =
      new Date().toISOString();

    saveDatabase(database);

    response.json({
      ok: true
    });
  }
);

/* =========================================================
   ACTIVER / DÉSACTIVER UN MEMBRE
========================================================= */

app.put(
  "/api/admin/member/:id",
  requireAdmin,
  (request, response) => {
    const database = loadDatabase();

    const member =
      database.members.find(
        (item) =>
          item.id ===
          Number(request.params.id)
      );

    if (!member) {
      return response.status(404).json({
        error: "Membre introuvable."
      });
    }

    if (
      typeof request.body.active ===
      "boolean"
    ) {
      member.active =
        request.body.active;
    }

    if (request.body.grade) {
      member.grade =
        String(
          request.body.grade
        ).trim();
    }

    if (request.body.division) {
      member.division =
        String(
          request.body.division
        ).trim();
    }

    saveDatabase(database);

    response.json({
      ok: true
    });
  }
);

/* =========================================================
   SUPPRIMER UN MEMBRE
========================================================= */

app.delete(
  "/api/admin/member/:id",
  requireAdmin,
  (request, response) => {
    const database = loadDatabase();

    const memberId =
      Number(request.params.id);

    const entryIds =
      database.entries
        .filter(
          (entry) =>
            entry.memberId ===
            memberId
        )
        .map((entry) => entry.id);

    database.members =
      database.members.filter(
        (member) =>
          member.id !== memberId
      );

    database.entries =
      database.entries.filter(
        (entry) =>
          entry.memberId !==
          memberId
      );

    database.payments =
      database.payments.filter(
        (payment) =>
          !entryIds.includes(
            payment.entryId
          )
      );

    saveDatabase(database);

    response.json({
      ok: true
    });
  }
);

/* =========================================================
   PAYER / ANNULER LE PAIEMENT
========================================================= */

app.post(
  "/api/admin/pay/:id",
  requireAdmin,
  (request, response) => {
    const database = loadDatabase();

    const entryId =
      Number(request.params.id);

    const entry =
      database.entries.find(
        (item) =>
          item.id === entryId &&
          item.end
      );

    if (!entry) {
      return response.status(404).json({
        error:
          "Pointage introuvable ou toujours en cours."
      });
    }

    const existingPayment =
      database.payments.find(
        (payment) =>
          payment.entryId ===
          entryId
      );

    if (existingPayment) {
      database.payments =
        database.payments.filter(
          (payment) =>
            payment.entryId !==
            entryId
        );
    } else {
      database.payments.push({
        id: Date.now(),
        entryId,
        amount:
          calculateBonus(
            getEntryDuration(entry)
          ),
        paidAt:
          new Date().toISOString()
      });
    }

    saveDatabase(database);

    response.json({
      ok: true,
      paid: !existingPayment
    });
  }
);

/* =========================================================
   SUPPRIMER UN POINTAGE
========================================================= */

app.delete(
  "/api/admin/entry/:id",
  requireAdmin,
  (request, response) => {
    const database = loadDatabase();

    const entryId =
      Number(request.params.id);

    database.entries =
      database.entries.filter(
        (entry) =>
          entry.id !== entryId
      );

    database.payments =
      database.payments.filter(
        (payment) =>
          payment.entryId !==
          entryId
      );

    saveDatabase(database);

    response.json({
      ok: true
    });
  }
);

/* =========================================================
   INTERFACE HTML
========================================================= */

const html = String.raw`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>Pointeuse Cayo Perico</title>

  <style>
    :root {
      --gold: #d8b55f;
      --gold-light: #f2d891;
      --panel: rgba(10, 31, 24, 0.94);
      --text: #f6f2e8;
      --muted: #9eb0a3;
      --green: #3ca36f;
      --red: #d96c65;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;

      color: var(--text);

      font-family:
        Arial,
        sans-serif;

      background:
        linear-gradient(
          rgba(4, 14, 10, 0.82),
          rgba(4, 14, 10, 0.94)
        ),
        url(
          "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1800&q=80"
        );

      background-position: center;
      background-size: cover;
      background-attachment: fixed;
    }

    button,
    input,
    textarea,
    select {
      font: inherit;
    }

    .container {
      width: min(
        1100px,
        calc(100% - 28px)
      );

      margin: auto;
      padding: 30px 0 70px;
    }

    .center-page {
      min-height: 100vh;

      display: flex;
      align-items: center;
      justify-content: center;

      padding: 20px;
    }

    .panel,
    .card {
      border:
        1px solid
        rgba(216, 181, 95, 0.25);

      border-radius: 18px;

      background: var(--panel);

      box-shadow:
        0 25px 80px
        rgba(0, 0, 0, 0.4);
    }

    .panel {
      padding: 25px;
      margin-top: 16px;
    }

    .login-panel {
      width: min(
        600px,
        100%
      );

      padding: 32px;
    }

    .eyebrow {
      color: var(--gold);

      font-size: 12px;
      font-weight: 900;
      letter-spacing: 2px;

      text-transform: uppercase;
    }

    h1 {
      margin: 8px 0 12px;

      color: var(--gold-light);

      font-size: clamp(
        38px,
        7vw,
        68px
      );

      line-height: 1;
    }

    h2 {
      margin-top: 0;
    }

    .muted {
      color: var(--muted);
    }

    .buttons {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;

      margin-top: 18px;
    }

    .button {
      border: none;
      border-radius: 10px;

      padding: 12px 16px;

      cursor: pointer;

      color: #142017;
      background: var(--gold);

      font-weight: 800;
    }

    .button.green {
      color: white;
      background: var(--green);
    }

    .button.red {
      color: white;
      background: var(--red);
    }

    .button.secondary {
      color: white;

      background:
        rgba(255, 255, 255, 0.08);

      border:
        1px solid
        rgba(255, 255, 255, 0.12);
    }

    .button.full {
      width: 100%;
      margin-top: 12px;
    }

    .field {
      display: grid;
      gap: 7px;

      margin-top: 13px;
    }

    .field label {
      color: var(--muted);
      font-size: 13px;
      font-weight: 700;
    }

    .field input,
    .field textarea,
    .field select {
      width: 100%;

      padding: 12px;

      color: white;
      background: #081510;

      border:
        1px solid
        rgba(255, 255, 255, 0.15);

      border-radius: 10px;

      outline: none;
    }

    .field textarea {
      min-height: 90px;
      resize: vertical;
    }

    .hidden {
      display: none;
    }

    .statistics {
      display: grid;
      grid-template-columns:
        repeat(4, 1fr);

      gap: 12px;

      margin-top: 20px;
    }

    .card {
      padding: 20px;
    }

    .card small {
      color: var(--muted);

      font-size: 11px;
      font-weight: 800;

      text-transform: uppercase;
    }

    .card strong {
      display: block;

      margin-top: 9px;

      color: var(--gold-light);

      font-size: 28px;
    }

    .clock {
      color: var(--gold-light);

      font-size: 42px;
      font-weight: 900;

      margin: 10px 0;
    }

    .table-wrapper {
      overflow-x: auto;
    }

    table {
      width: 100%;
      min-width: 760px;

      border-collapse: collapse;
    }

    th,
    td {
      padding: 12px;

      text-align: left;

      border-bottom:
        1px solid
        rgba(255, 255, 255, 0.08);
    }

    th {
      color: var(--muted);

      font-size: 11px;

      text-transform: uppercase;
    }

    .request-card {
      display: flex;
      justify-content: space-between;
      gap: 15px;

      margin-top: 10px;
      padding: 15px;

      border:
        1px solid
        rgba(255, 255, 255, 0.1);

      border-radius: 12px;
    }

    @media (max-width: 800px) {
      .statistics {
        grid-template-columns:
          repeat(2, 1fr);
      }

      .request-card {
        flex-direction: column;
      }
    }
  </style>
</head>

<body>

  <main id="app"></main>

  <script>
    const app =
      document.getElementById("app");

    let timer = null;

    function formatMoney(value) {
      return new Intl.NumberFormat(
        "fr-FR"
      ).format(
        Math.round(value)
      ) + " $";
    }

    function formatDuration(ms) {
      const totalMinutes =
        Math.floor(ms / 60000);

      const hours =
        Math.floor(
          totalMinutes / 60
        );

      const minutes =
        totalMinutes % 60;

      return (
        hours +
        " h " +
        String(minutes).padStart(
          2,
          "0"
        )
      );
    }

    function formatDate(value) {
      return new Date(
        value
      ).toLocaleString(
        "fr-FR"
      );
    }

    async function api(
      url,
      options = {}
    ) {
      const response =
        await fetch(url, {
          headers: {
            "Content-Type":
              "application/json"
          },

          ...options
        });

      const data =
        await response
          .json()
          .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Une erreur est survenue."
        );
      }

      return data;
    }

    function alertMessage(message) {
      alert(message);
    }

    function createLocalDeviceToken() {
      let token =
        localStorage.getItem(
          "cayoPendingDeviceToken"
        );

      if (!token) {
        token =
          "device-" +
          Date.now() +
          "-" +
          Math.random()
            .toString(36)
            .slice(2);

        localStorage.setItem(
          "cayoPendingDeviceToken",
          token
        );
      }

      return token;
    }

    function home() {
      app.innerHTML = \`
        <div class="center-page">
          <section class="panel login-panel">

            <div class="eyebrow">
              Milice de Cayo Perico
            </div>

            <h1>
              Pointeuse officielle
            </h1>

            <p class="muted">
              Accédez à votre espace ou envoyez une demande d'accès.
            </p>

            <div class="buttons">

              <button
                class="button green"
                onclick="showHomeSection('connect')"
              >
                Entrer
              </button>

              <button
                class="button secondary"
                onclick="showHomeSection('request')"
              >
                Demande d'accès
              </button>

              <button
                class="button secondary"
                onclick="adminLoginPage()"
              >
                Administration
              </button>

            </div>

            <div
              id="connectSection"
              class="panel"
            >
              <div class="field">

                <label>
                  Nom RP complet
                </label>

                <input
                  id="memberName"
                  placeholder="Exemple : Juan Pedro"
                >

              </div>

              <button
                class="button full"
                onclick="manualConnect()"
              >
                Se connecter
              </button>
            </div>

            <div
              id="requestSection"
              class="panel hidden"
            >

              <div class="field">

                <label>
                  Prénom RP
                </label>

                <input id="firstName">

              </div>

              <div class="field">

                <label>
                  Nom RP
                </label>

                <input id="lastName">

              </div>

              <div class="field">

                <label>
                  Téléphone RP
                </label>

                <input id="phone">

              </div>

              <div class="field">

                <label>
                  Message
                </label>

                <textarea id="message"></textarea>

              </div>

              <button
                class="button full"
                onclick="sendAccessRequest()"
              >
                Envoyer la demande
              </button>

            </div>

          </section>
        </div>
      \`;
    }

    window.showHomeSection =
      function (section) {
        document
          .getElementById(
            "connectSection"
          )
          .classList.toggle(
            "hidden",
            section !== "connect"
          );

        document
          .getElementById(
            "requestSection"
          )
          .classList.toggle(
            "hidden",
            section !== "request"
          );
      };

    window.sendAccessRequest =
      async function () {
        try {
          const deviceToken =
            createLocalDeviceToken();

          await api(
            "/api/request",
            {
              method: "POST",

              body: JSON.stringify({
                firstName:
                  document.getElementById(
                    "firstName"
                  ).value,

                lastName:
                  document.getElementById(
                    "lastName"
                  ).value,

                phone:
                  document.getElementById(
                    "phone"
                  ).value,

                message:
                  document.getElementById(
                    "message"
                  ).value,

                deviceToken
              })
            }
          );

          alertMessage(
            "Demande envoyée. Une fois acceptée, recharge simplement le site."
          );
        } catch (error) {
          alertMessage(
            error.message
          );
        }
      };

    window.manualConnect =
      async function () {
        try {
          const oldToken =
            localStorage.getItem(
              "cayoToken"
            ) || "";

          const response =
            await api(
              "/api/connect",
              {
                method: "POST",

                body:
                  JSON.stringify({
                    fullName:
                      document
                        .getElementById(
                          "memberName"
                        )
                        .value
                        .trim(),

                    deviceToken:
                      oldToken
                  })
              }
            );

          localStorage.setItem(
            "cayoToken",
            response.deviceToken
          );

          localStorage.removeItem(
            "cayoPendingDeviceToken"
          );

          memberPage();
        } catch (error) {
          alertMessage(
            error.message
          );
        }
      };

    async function tryAutomaticLogin() {
      const token =
        localStorage.getItem(
          "cayoToken"
        ) ||
        localStorage.getItem(
          "cayoPendingDeviceToken"
        );

      if (!token) {
        return false;
      }

      try {
        const response =
          await api(
            "/api/member/automatic-connect",
            {
              method: "POST",

              body:
                JSON.stringify({
                  deviceToken: token
                })
            }
          );

        localStorage.setItem(
          "cayoToken",
          token
        );

        localStorage.removeItem(
          "cayoPendingDeviceToken"
        );

        return true;
      } catch {
        return false;
      }
    }

    async function memberPage() {
      const token =
        localStorage.getItem(
          "cayoToken"
        );

      if (!token) {
        home();
        return;
      }

      try {
        const data =
          await api(
            "/api/member/dashboard",
            {
              method: "POST",

              body:
                JSON.stringify({
                  deviceToken: token
                })
            }
          );

        const active =
          data.active;

        const rows =
          data.entries
            .filter(
              (entry) =>
                entry.end
            )
            .map(
              (entry) => \`
                <tr>
                  <td>
                    \${formatDate(
                      entry.start
                    )}
                  </td>

                  <td>
                    \${formatDate(
                      entry.end
                    )}
                  </td>

                  <td>
                    \${formatDuration(
                      entry.duration
                    )}
                  </td>

                  <td>
                    \${formatMoney(
                      entry.bonus
                    )}
                  </td>

                  <td>
                    \${entry.paid
                      ? "Payé"
                      : "En attente"}
                  </td>
                </tr>
              \`
            )
            .join("");

        app.innerHTML = \`
          <div class="container">

            <div class="eyebrow">
              Pointeuse officielle
            </div>

            <h1>
              \${data.member.fullName}
            </h1>

            <p class="muted">
              \${data.member.grade}
              ·
              \${data.member.division}
            </p>

            <section class="statistics">

              <article class="card">
                <small>
                  Aujourd'hui
                </small>

                <strong>
                  \${formatDuration(
                    data.stats.today
                  )}
                </strong>
              </article>

              <article class="card">
                <small>
                  Cette semaine
                </small>

                <strong>
                  \${formatDuration(
                    data.stats.week
                  )}
                </strong>
              </article>

              <article class="card">
                <small>
                  Ce mois
                </small>

                <strong>
                  \${formatDuration(
                    data.stats.month
                  )}
                </strong>
              </article>

              <article class="card">
                <small>
                  Prime totale
                </small>

                <strong>
                  \${formatMoney(
                    data.stats.totalBonus
                  )}
                </strong>
              </article>

            </section>

            <section class="panel">

              <h2>
                \${active
                  ? "Service en cours"
                  : "Hors service"}
              </h2>

              <div
                id="clock"
                class="clock"
              >
                \${active
                  ? formatDuration(
                      Date.now() -
                      new Date(
                        active.start
                      )
                    )
                  : "0 h 00"}
              </div>

              <p class="muted">
                Prime fixe :
                12 500 $ / heure
              </p>

              <button
                class="button
                \${active
                  ? "red"
                  : "green"}"
                onclick="toggleService(
                  \${Boolean(active)}
                )"
              >
                \${active
                  ? "Terminer le service"
                  : "Commencer le service"}
              </button>

              <button
                class="button secondary"
                onclick="logoutMember()"
              >
                Déconnexion
              </button>

            </section>

            <section class="panel">

              <h2>
                Historique
              </h2>

              <div class="table-wrapper">

                <table>

                  <thead>

                    <tr>
                      <th>Arrivée</th>
                      <th>Départ</th>
                      <th>Durée</th>
                      <th>Prime</th>
                      <th>Paiement</th>
                    </tr>

                  </thead>

                  <tbody>
                    \${rows}
                  </tbody>

                </table>

              </div>

            </section>

          </div>
        \`;

        clearInterval(timer);

        if (active) {
          timer = setInterval(
            () => {
              const clock =
                document.getElementById(
                  "clock"
                );

              if (clock) {
                clock.textContent =
                  formatDuration(
                    Date.now() -
                    new Date(
                      active.start
                    )
                  );
              }
            },
            1000
          );
        }
      } catch (error) {
        localStorage.removeItem(
          "cayoToken"
        );

        home();
      }
    }

    window.toggleService =
      async function (active) {
        try {
          await api(
            active
              ? "/api/member/out"
              : "/api/member/in",
            {
              method: "POST",

              body:
                JSON.stringify({
                  deviceToken:
                    localStorage.getItem(
                      "cayoToken"
                    )
                })
            }
          );

          memberPage();
        } catch (error) {
          alertMessage(
            error.message
          );
        }
      };

    window.logoutMember =
      function () {
        localStorage.removeItem(
          "cayoToken"
        );

        home();
      };

    function adminLoginPage() {
      app.innerHTML = \`
        <div class="center-page">

          <section class="panel login-panel">

            <div class="eyebrow">
              Administration
            </div>

            <h1>
              Accès Général
            </h1>

            <div class="field">

              <label>
                Mot de passe
              </label>

              <input
                id="adminPassword"
                type="password"
              >

            </div>

            <button
              class="button full"
              onclick="adminLogin()"
            >
              Se connecter
            </button>

            <button
              class="button secondary full"
              onclick="home()"
            >
              Retour
            </button>

          </section>

        </div>
      \`;
    }

    window.adminLogin =
      async function () {
        try {
          await api(
            "/api/admin/login",
            {
              method: "POST",

              body:
                JSON.stringify({
                  password:
                    document.getElementById(
                      "adminPassword"
                    ).value
                })
            }
          );

          adminPage();
        } catch (error) {
          alertMessage(
            error.message
          );
        }
      };

    async function adminPage(
      tab = "dashboard"
    ) {
      try {
        const data =
          await api(
            "/api/admin/data"
          );

        const activeEntries =
          data.entries.filter(
            (entry) =>
              !entry.end
          );

        const unpaidTotal =
          data.entries
            .filter(
              (entry) =>
                entry.end &&
                !entry.paid
            )
            .reduce(
              (total, entry) =>
                total +
                entry.bonus,
              0
            );

        let content = "";

        if (tab === "dashboard") {
          content = \`
            <section class="statistics">

              <article class="card">
                <small>
                  Miliciens
                </small>

                <strong>
                  \${data.members.filter(
                    (member) =>
                      member.active
                  ).length}
                </strong>
              </article>

              <article class="card">
                <small>
                  En service
                </small>

                <strong>
                  \${activeEntries.length}
                </strong>
              </article>

              <article class="card">
                <small>
                  Demandes
                </small>

                <strong>
                  \${data.requests.length}
                </strong>
              </article>

              <article class="card">
                <small>
                  À payer
                </small>

                <strong>
                  \${formatMoney(
                    unpaidTotal
                  )}
                </strong>
              </article>

            </section>

            <section class="panel">

              <h2>
                Miliciens en service
              </h2>

              \${activeEntries.length
                ? activeEntries
                    .map(
                      (entry) => \`
                        <div class="request-card">

                          <strong>
                            \${entry.memberName}
                          </strong>

                          <span>
                            \${formatDuration(
                              entry.duration
                            )}
                          </span>

                        </div>
                      \`
                    )
                    .join("")
                : '<p class="muted">Aucun milicien en service.</p>'}

            </section>
          \`;
        }

        if (tab === "requests") {
          content = \`
            <section class="panel">

              <h2>
                Demandes en attente
              </h2>

              \${data.requests.length
                ? data.requests
                    .map(
                      (request) => \`
                        <div class="request-card">

                          <div>

                            <strong>
                              \${request.fullName}
                            </strong>

                            <div class="muted">
                              \${formatDate(
                                request.createdAt
                              )}
                            </div>

                            <p>
                              \${request.message || ""}
                            </p>

                          </div>

                          <div class="buttons">

                            <button
                              class="button green"
                              onclick="approveRequest(
                                \${request.id}
                              )"
                            >
                              Accepter
                            </button>

                            <button
                              class="button red"
                              onclick="rejectRequest(
                                \${request.id}
                              )"
                            >
                              Refuser
                            </button>

                          </div>

                        </div>
                      \`
                    )
                    .join("")
                : '<p class="muted">Aucune demande en attente.</p>'}

            </section>
          \`;
        }

        if (tab === "members") {
          content = \`
            <section class="panel">

              <div class="table-wrapper">

                <table>

                  <thead>

                    <tr>
                      <th>Nom</th>
                      <th>Grade</th>
                      <th>Division</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>

                  </thead>

                  <tbody>

                    \${data.members
                      .map(
                        (member) => \`
                          <tr>

                            <td>
                              \${member.fullName}
                            </td>

                            <td>
                              \${member.grade}
                            </td>

                            <td>
                              \${member.division}
                            </td>

                            <td>
                              \${member.active
                                ? "Actif"
                                : "Désactivé"}
                            </td>

                            <td>

                              <button
                                class="button secondary"
                                onclick="toggleMember(
                                  \${member.id},
                                  \${member.active}
                                )"
                              >
                                \${member.active
                                  ? "Désactiver"
                                  : "Réactiver"}
                              </button>

                              <button
                                class="button red"
                                onclick="deleteMember(
                                  \${member.id}
                                )"
                              >
                                Supprimer
                              </button>

                            </td>

                          </tr>
                        \`
                      )
                      .join("")}

                  </tbody>

                </table>

              </div>

            </section>
          \`;
        }

        if (tab === "entries") {
          content = \`
            <section class="panel">

              <div class="table-wrapper">

                <table>

                  <thead>

                    <tr>
                      <th>Milicien</th>
                      <th>Début</th>
                      <th>Fin</th>
                      <th>Durée</th>
                      <th>Prime</th>
                      <th>Paiement</th>
                      <th>Actions</th>
                    </tr>

                  </thead>

                  <tbody>

                    \${data.entries
                      .map(
                        (entry) => \`
                          <tr>

                            <td>
                              \${entry.memberName}
                            </td>

                            <td>
                              \${formatDate(
                                entry.start
                              )}
                            </td>

                            <td>
                              \${entry.end
                                ? formatDate(
                                    entry.end
                                  )
                                : "En cours"}
                            </td>

                            <td>
                              \${formatDuration(
                                entry.duration
                              )}
                            </td>

                            <td>
                              \${entry.end
                                ? formatMoney(
                                    entry.bonus
                                  )
                                : "-"}
                            </td>

                            <td>

                              \${entry.end
                                ? \`
                                  <button
                                    class="button
                                    \${entry.paid
                                      ? "green"
                                      : "secondary"}"
                                    onclick="togglePayment(
                                      \${entry.id}
                                    )"
                                  >
                                    \${entry.paid
                                      ? "Payé"
                                      : "Marquer payé"}
                                  </button>
                                \`
                                : "-"}

                            </td>

                            <td>

                              <button
                                class="button red"
                                onclick="deleteEntry(
                                  \${entry.id}
                                )"
                              >
                                Supprimer
                              </button>

                            </td>

                          </tr>
                        \`
                      )
                      .join("")}

                  </tbody>

                </table>

              </div>

            </section>
          \`;
        }

        app.innerHTML = \`
          <div class="container">

            <div class="eyebrow">
              Milice de Cayo Perico
            </div>

            <h1>
              Administration
            </h1>

            <div class="buttons">

              <button
                class="button secondary"
                onclick="adminPage(
                  'dashboard'
                )"
              >
                Vue générale
              </button>

              <button
                class="button secondary"
                onclick="adminPage(
                  'requests'
                )"
              >
                Demandes
              </button>

              <button
                class="button secondary"
                onclick="adminPage(
                  'members'
                )"
              >
                Miliciens
              </button>

              <button
                class="button secondary"
                onclick="adminPage(
                  'entries'
                )"
              >
                Pointages
              </button>

              <button
                class="button red"
                onclick="adminLogout()"
              >
                Déconnexion
              </button>

            </div>

            \${content}

          </div>
        \`;
      } catch {
        adminLoginPage();
      }
    }

    window.adminPage =
      adminPage;

    window.approveRequest =
      async function (id) {
        const grade =
          prompt(
            "Grade du milicien :",
            "Milicien"
          ) || "Milicien";

        const division =
          prompt(
            "Division :",
            "Générale"
          ) || "Générale";

        await api(
          "/api/admin/request/" +
            id +
            "/approve",
          {
            method: "POST",

            body:
              JSON.stringify({
                grade,
                division
              })
          }
        );

        adminPage("requests");
      };

    window.rejectRequest =
      async function (id) {
        await api(
          "/api/admin/request/" +
            id +
            "/reject",
          {
            method: "POST"
          }
        );

        adminPage("requests");
      };

    window.toggleMember =
      async function (
        id,
        active
      ) {
        await api(
          "/api/admin/member/" +
            id,
          {
            method: "PUT",

            body:
              JSON.stringify({
                active: !active
              })
          }
        );

        adminPage("members");
      };

    window.deleteMember =
      async function (id) {
        if (
          !confirm(
            "Supprimer ce membre et tous ses pointages ?"
          )
        ) {
          return;
        }

        await api(
          "/api/admin/member/" +
            id,
          {
            method: "DELETE"
          }
        );

        adminPage("members");
      };

    window.togglePayment =
      async function (id) {
        await api(
          "/api/admin/pay/" +
            id,
          {
            method: "POST"
          }
        );

        adminPage("entries");
      };

    window.deleteEntry =
      async function (id) {
        if (
          !confirm(
            "Supprimer ce pointage ?"
          )
        ) {
          return;
        }

        await api(
          "/api/admin/entry/" +
            id,
          {
            method: "DELETE"
          }
        );

        adminPage("entries");
      };

    window.adminLogout =
      async function () {
        await api(
          "/api/admin/logout",
          {
            method: "POST"
          }
        );

        home();
      };

    async function startApplication() {
      const automaticallyConnected =
        await tryAutomaticLogin();

      if (automaticallyConnected) {
        memberPage();
        return;
      }

      try {
        const adminStatus =
          await api(
            "/api/admin/status"
          );

        if (adminStatus.admin) {
          adminPage();
          return;
        }
      } catch {
        // Aucun problème.
      }

      home();
    }

    startApplication();
  </script>

</body>
</html>
`;

/* =========================================================
   AFFICHAGE DU SITE
========================================================= */

app.get("*", (request, response) => {
  response
    .type("html")
    .send(html);
});

/* =========================================================
   DÉMARRAGE
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "Pointeuse Cayo Perico lancée sur le port " +
        PORT
    );
  }
);
