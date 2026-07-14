
const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
let currentUser = null;
let liveTimer = null;

const money = (value) => new Intl.NumberFormat("fr-FR").format(Math.round(value)) + " $";
const duration = (ms) => {
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, "0")}`;
};
const dateTime = (value) =>
  new Date(value).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Une erreur est survenue.");
  return data;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), 2200);
}

function loginView() {
  app.innerHTML = `
    <div class="login-wrap">
      <section class="login">
        <div class="eyebrow">MILICE DE CAYO PERICO</div>
        <h1>Pointeuse</h1>
        <p class="muted">Connectez-vous pour accéder à votre espace de service.</p>

        <div class="field">
          <label>Identifiant</label>
          <input id="username" autocomplete="username">
        </div>

        <div class="field">
          <label>Mot de passe</label>
          <input id="password" type="password" autocomplete="current-password">
        </div>

        <button class="btn" id="loginButton">Se connecter</button>

        <div class="hint">
          <b>Comptes de démonstration</b><br>
          Admin : admin / Cayo123!<br>
          Milicien : milicien / Cayo123!
        </div>
      </section>
    </div>
  `;

  document.querySelector("#loginButton").onclick = async () => {
    try {
      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({
          username: document.querySelector("#username").value,
          password: document.querySelector("#password").value
        })
      });
      currentUser = data.user;
      boot();
    } catch (error) {
      showToast(error.message);
    }
  };
}

function pageLayout(title, subtitle, content) {
  app.innerHTML = `
    <div class="shell">
      <nav class="nav">
        <div class="brand">MILICE <span>CAYO PERICO</span></div>
        <div class="nav-right">
          <span class="user-pill">${currentUser.displayName} · ${currentUser.role === "admin" ? "Administration" : "Milicien"}</span>
          <button class="btn secondary small" id="logoutButton">Déconnexion</button>
        </div>
      </nav>

      <header class="hero">
        <div class="eyebrow">POINTEUSE OFFICIELLE</div>
        <h1>${title}</h1>
        <p class="muted">${subtitle}</p>
      </header>

      ${content}
    </div>
  `;

  document.querySelector("#logoutButton").onclick = async () => {
    await api("/api/logout", { method: "POST" });
    currentUser = null;
    loginView();
  };
}

async function memberView() {
  const data = await api("/api/member/dashboard");
  const active = data.active;

  const rows = data.entries
    .filter((entry) => entry.end)
    .map((entry) => `
      <tr>
        <td>${dateTime(entry.start)}</td>
        <td>${dateTime(entry.end)}</td>
        <td>${duration(entry.durationMs)}</td>
        <td>${money(entry.bonus)}</td>
      </tr>
    `)
    .join("");

  pageLayout(
    "Mon service",
    "Comptez vos heures et consultez automatiquement votre prime.",
    `
      <section class="grid stats">
        <div class="card"><small>Aujourd'hui</small><strong>${duration(data.stats.todayMs)}</strong></div>
        <div class="card"><small>Cette semaine</small><strong>${duration(data.stats.weekMs)}</strong></div>
        <div class="card"><small>Ce mois</small><strong>${duration(data.stats.monthMs)}</strong></div>
        <div class="card"><small>Prime totale</small><strong>${money(data.stats.totalBonus)}</strong></div>
      </section>

      <section class="panel">
        <div class="panel-head">
          <div>
            <div class="eyebrow">SERVICE</div>
            <h2>${active ? "Service en cours" : "Hors service"}</h2>
          </div>
          <span class="rate">12 500 $ / heure</span>
        </div>

        <div class="clock-box">
          <div>
            <div class="muted">${active ? "Début : " + dateTime(active.start) : "Cliquez pour commencer votre service."}</div>
            <div class="live" id="liveDuration">${active ? duration(Date.now() - new Date(active.start)) : "0 h 00"}</div>
          </div>

          <button class="btn ${active ? "danger" : "green"}" id="clockButton">
            ${active ? "Terminer le service" : "Commencer le service"}
          </button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Historique</h2></div>
        <div class="table-wrap">
          ${rows ? `
            <table>
              <thead>
                <tr><th>Arrivée</th><th>Départ</th><th>Durée</th><th>Prime</th></tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          ` : `<div class="empty">Aucun service terminé.</div>`}
        </div>
      </section>
    `
  );

  document.querySelector("#clockButton").onclick = async () => {
    try {
      await api(active ? "/api/member/clock-out" : "/api/member/clock-in", { method: "POST" });
      showToast(active ? "Service terminé et enregistré." : "Service commencé.");
      memberView();
    } catch (error) {
      showToast(error.message);
    }
  };

  clearInterval(liveTimer);
  if (active) {
    liveTimer = setInterval(() => {
      const element = document.querySelector("#liveDuration");
      if (element) element.textContent = duration(Date.now() - new Date(active.start));
    }, 1000);
  }
}

async function adminView(tab = "dashboard") {
  const data = await api("/api/admin/dashboard");

  const tabs = `
    <div class="tabs">
      <button class="tab ${tab === "dashboard" ? "active" : ""}" data-tab="dashboard">Vue générale</button>
      <button class="tab ${tab === "members" ? "active" : ""}" data-tab="members">Membres</button>
      <button class="tab ${tab === "entries" ? "active" : ""}" data-tab="entries">Pointages</button>
      <a class="tab" href="/api/admin/export.csv">Exporter CSV</a>
    </div>
  `;

  let content = "";

  if (tab === "dashboard") {
    const activeMembers = data.entries.filter((entry) => !entry.end);
    content = `
      <section class="grid stats">
        <div class="card"><small>Miliciens</small><strong>${data.stats.members}</strong></div>
        <div class="card"><small>En service</small><strong>${data.stats.active}</strong></div>
        <div class="card"><small>Heures semaine</small><strong>${duration(data.stats.weekMs)}</strong></div>
        <div class="card"><small>À payer</small><strong>${money(data.stats.unpaidTotal)}</strong></div>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Actuellement en service</h2></div>
        ${
          activeMembers.length
            ? activeMembers.map((entry) => `
                <div class="card" style="margin-top:10px">
                  <b>${entry.member}</b>
                  <div class="muted">Depuis ${dateTime(entry.start)} · ${duration(entry.durationMs)}</div>
                </div>
              `).join("")
            : `<div class="empty">Aucun milicien en service.</div>`
        }
      </section>
    `;
  }

  if (tab === "members") {
    content = `
      <section class="panel">
        <div class="panel-head"><h2>Créer un membre</h2></div>

        <div class="form-grid">
          <div class="field"><label>Identifiant</label><input id="newUsername"></div>
          <div class="field"><label>Nom RP</label><input id="newDisplayName"></div>
          <div class="field"><label>Mot de passe</label><input id="newPassword" type="password"></div>
          <div class="field">
            <label>Rôle</label>
            <select id="newRole">
              <option value="member">Milicien</option>
              <option value="admin">Administrateur</option>
            </select>
          </div>
        </div>

        <button class="btn" id="createUser" style="margin-top:14px">Créer le compte</button>
      </section>

      <section class="panel">
        <div class="table-wrap">
          <table>
            <thead><tr><th>Nom RP</th><th>Identifiant</th><th>Rôle</th><th>Actions</th></tr></thead>
            <tbody>
              ${data.users.map((user) => `
                <tr>
                  <td>${user.displayName}</td>
                  <td>${user.username}</td>
                  <td>${user.role}</td>
                  <td>
                    <button class="btn danger small delete-user" data-id="${user.id}">Supprimer</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  if (tab === "entries") {
    content = `
      <section class="panel">
        <div class="panel-head"><h2>Ajouter un pointage</h2></div>

        <div class="form-grid">
          <div class="field">
            <label>Milicien</label>
            <select id="entryUser">
              ${data.users.filter((user) => user.role === "member").map((user) => `
                <option value="${user.id}">${user.displayName}</option>
              `).join("")}
            </select>
          </div>

          <div class="field"><label>Début</label><input id="entryStart" type="datetime-local"></div>
          <div class="field"><label>Fin</label><input id="entryEnd" type="datetime-local"></div>
          <div class="field"><label>Taux</label><input value="12 500 $ / heure" disabled></div>
        </div>

        <button class="btn" id="addEntry" style="margin-top:14px">Ajouter le pointage</button>
      </section>

      <section class="panel">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Milicien</th><th>Début</th><th>Fin</th><th>Durée</th>
                <th>Prime</th><th>Paiement</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${data.entries.map((entry) => `
                <tr>
                  <td>${entry.member}</td>
                  <td>${dateTime(entry.start)}</td>
                  <td>${entry.end ? dateTime(entry.end) : "En cours"}</td>
                  <td>${duration(entry.durationMs)}</td>
                  <td>${entry.end ? money(entry.bonus) : "—"}</td>
                  <td>
                    ${entry.end ? `
                      <button class="btn small ${entry.paid ? "green" : "secondary"} toggle-pay" data-id="${entry.id}">
                        ${entry.paid ? "Payé" : "Marquer payé"}
                      </button>
                    ` : "—"}
                  </td>
                  <td>
                    <button class="btn danger small delete-entry" data-id="${entry.id}">Supprimer</button>
                  </td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  pageLayout(
    "Administration",
    "Gestion des membres, des heures et des paiements.",
    tabs + content
  );

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.onclick = () => adminView(button.dataset.tab);
  });

  if (tab === "members") {
    document.querySelector("#createUser").onclick = async () => {
      try {
        await api("/api/admin/users", {
          method: "POST",
          body: JSON.stringify({
            username: document.querySelector("#newUsername").value,
            displayName: document.querySelector("#newDisplayName").value,
            password: document.querySelector("#newPassword").value,
            role: document.querySelector("#newRole").value
          })
        });
        showToast("Compte créé.");
        adminView("members");
      } catch (error) {
        showToast(error.message);
      }
    };

    document.querySelectorAll(".delete-user").forEach((button) => {
      button.onclick = async () => {
        if (!confirm("Supprimer ce membre et tous ses pointages ?")) return;
        try {
          await api(`/api/admin/users/${button.dataset.id}`, { method: "DELETE" });
          adminView("members");
        } catch (error) {
          showToast(error.message);
        }
      };
    });
  }

  if (tab === "entries") {
    document.querySelector("#addEntry").onclick = async () => {
      try {
        await api("/api/admin/entries", {
          method: "POST",
          body: JSON.stringify({
            userId: document.querySelector("#entryUser").value,
            start: document.querySelector("#entryStart").value,
            end: document.querySelector("#entryEnd").value
          })
        });
        showToast("Pointage ajouté.");
        adminView("entries");
      } catch (error) {
        showToast(error.message);
      }
    };

    document.querySelectorAll(".toggle-pay").forEach((button) => {
      button.onclick = async () => {
        await api(`/api/admin/entries/${button.dataset.id}/pay`, { method: "POST" });
        adminView("entries");
      };
    });

    document.querySelectorAll(".delete-entry").forEach((button) => {
      button.onclick = async () => {
        if (!confirm("Supprimer ce pointage ?")) return;
        await api(`/api/admin/entries/${button.dataset.id}`, { method: "DELETE" });
        adminView("entries");
      };
    });
  }
}

async function boot() {
  try {
    const data = await api("/api/me");
    currentUser = data.user;
    if (!currentUser) return loginView();
    if (currentUser.role === "admin") return adminView();
    return memberView();
  } catch (error) {
    loginView();
    showToast("Impossible de joindre le serveur.");
  }
}

boot();
