const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

let clockTimer = null;

function formatMoney(value) {
  return new Intl.NumberFormat("fr-FR").format(
    Math.round(value)
  ) + " $";
}

function formatDuration(milliseconds) {
  const totalMinutes = Math.floor(milliseconds / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${hours} h ${String(minutes).padStart(2, "0")}`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toast.timer);

  toast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      data.error || "Une erreur est survenue."
    );
  }

  return data;
}

function getDeviceToken() {
  let token = localStorage.getItem("cayoDeviceToken");

  if (!token) {
    token =
      "device-" +
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2);

    localStorage.setItem("cayoDeviceToken", token);
  }

  return token;
}

function logoMarkup() {
  return `
    <img
      class="logo"
      src="/logo-cayo.png"
      alt="République de Cayo Perico"
    >
  `;
}

function accessPage() {
  clearInterval(clockTimer);

  app.innerHTML = `
    <div class="center-page">
      <section class="panel login-panel">
        ${logoMarkup()}

        <div class="eyebrow">
          Milice de Cayo Perico
        </div>

        <h1>Pointeuse officielle</h1>

        <p class="muted">
          Envoyez une demande depuis cet appareil.
          Une fois acceptée, vous serez reconnu automatiquement.
        </p>

        <div class="field">
          <label>Prénom RP</label>
          <input id="firstName">
        </div>

        <div class="field">
          <label>Nom RP</label>
          <input id="lastName">
        </div>

        <button
          class="button green full"
          id="requestAccessButton"
        >
          Demander un accès
        </button>

        <button
          class="button secondary full"
          id="adminAccessButton"
        >
          Administration
        </button>
      </section>
    </div>
  `;

  document
    .querySelector("#requestAccessButton")
    .addEventListener("click", sendAccessRequest);

  document
    .querySelector("#adminAccessButton")
    .addEventListener("click", adminLoginPage);
}

async function sendAccessRequest() {
  try {
    await api("/api/access/request", {
      method: "POST",
      body: JSON.stringify({
        firstName:
          document.querySelector("#firstName").value,
        lastName:
          document.querySelector("#lastName").value,
        deviceToken: getDeviceToken()
      })
    });

    showToast(
      "Demande envoyée. Rechargez la page après validation."
    );
  } catch (error) {
    showToast(error.message);
  }
}

async function memberPage() {
  const deviceToken =
    localStorage.getItem("cayoDeviceToken");

  if (!deviceToken) {
    accessPage();
    return;
  }

  try {
    const data = await api("/api/member/dashboard", {
      method: "POST",
      body: JSON.stringify({
        deviceToken
      })
    });

    const isActive = Boolean(data.activeEntry);

    app.innerHTML = `
      <div class="shell">
        <header class="topbar">
          <div class="brand">
            MILICE <span>CAYO PERICO</span>
          </div>

          <div class="muted">
            ${escapeHtml(data.member.fullName)}
          </div>
        </header>

        <section class="hero">
          <div class="eyebrow">
            Pointeuse personnelle
          </div>

          <h1>${escapeHtml(data.member.fullName)}</h1>

          <p class="muted">
            Vos heures sont calculées automatiquement
            au tarif de 12 500 $ par heure.
          </p>
        </section>

        <section class="stats">
          <article class="stat-card">
            <small>État actuel</small>
            <strong>
              ${isActive ? "En service" : "Hors service"}
            </strong>
          </article>

          <article class="stat-card">
            <small>Heures à payer</small>
            <strong>
              ${formatDuration(data.unpaidHoursMs)}
            </strong>
          </article>

          <article class="stat-card">
            <small>Montant à payer</small>
            <strong>
              ${formatMoney(data.amountToPay)}
            </strong>
          </article>
        </section>

        <section class="panel service-panel">
          <div class="service-head">
            <div>
              <div class="eyebrow">Service</div>
              <h2>
                ${isActive ? "Service en cours" : "Vous êtes hors service"}
              </h2>
            </div>

            <div class="rate">
              12 500 $ / heure
            </div>
          </div>

          <div id="clock" class="clock">
            ${
              isActive
                ? formatDuration(
                    Date.now() -
                    new Date(data.activeEntry.start).getTime()
                  )
                : "0 h 00"
            }
          </div>

          <button
            class="button ${isActive ? "red" : "green"}"
            id="serviceButton"
          >
            ${
              isActive
                ? "Terminer le service"
                : "Prendre son service"
            }
          </button>
        </section>
      </div>
    `;

    document
      .querySelector("#serviceButton")
      .addEventListener("click", () => {
        toggleService(isActive);
      });

    clearInterval(clockTimer);

    if (isActive) {
      clockTimer = setInterval(() => {
        const clock = document.querySelector("#clock");

        if (clock) {
          clock.textContent = formatDuration(
            Date.now() -
            new Date(data.activeEntry.start).getTime()
          );
        }
      }, 1000);
    }
  } catch (error) {
    accessPage();
  }
}

async function toggleService(isActive) {
  try {
    await api(
      isActive
        ? "/api/member/clock-out"
        : "/api/member/clock-in",
      {
        method: "POST",
        body: JSON.stringify({
          deviceToken:
            localStorage.getItem("cayoDeviceToken")
        })
      }
    );

    memberPage();
  } catch (error) {
    showToast(error.message);
  }
}

function adminLoginPage() {
  clearInterval(clockTimer);

  app.innerHTML = `
    <div class="center-page">
      <section class="panel login-panel">
        ${logoMarkup()}

        <div class="eyebrow">
          Administration
        </div>

        <h1>Accès Général</h1>

        <div class="field">
          <label>Mot de passe</label>
          <input
            id="adminPassword"
            type="password"
          >
        </div>

        <button
          class="button full"
          id="adminLoginButton"
        >
          Se connecter
        </button>

        <button
          class="button secondary full"
          id="backButton"
        >
          Retour
        </button>
      </section>
    </div>
  `;

  document
    .querySelector("#adminLoginButton")
    .addEventListener("click", adminLogin);

  document
    .querySelector("#backButton")
    .addEventListener("click", accessPage);
}

async function adminLogin() {
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        password:
          document.querySelector("#adminPassword").value
      })
    });

    adminPage();
  } catch (error) {
    showToast(error.message);
  }
}

async function adminPage() {
  clearInterval(clockTimer);

  try {
    const data = await api("/api/admin/dashboard");

    const requestsMarkup = data.requests.length
      ? data.requests
          .map((request) => {
            return `
              <article class="request-card">
                <div>
                  <strong>
                    ${escapeHtml(request.fullName)}
                  </strong>

                  <div class="member-meta">
                    <span>
                      Demande en attente
                    </span>
                  </div>
                </div>

                <div class="actions">
                  <button
                    class="button green small approve-request"
                    data-id="${request.id}"
                  >
                    Accepter
                  </button>

                  <button
                    class="button red small reject-request"
                    data-id="${request.id}"
                  >
                    Refuser
                  </button>
                </div>
              </article>
            `;
          })
          .join("")
      : `
        <div class="empty">
          Aucune demande en attente.
        </div>
      `;

    const membersMarkup = data.members.length
      ? data.members
          .map((member) => {
            return `
              <article class="member-card">
                <div>
                  <strong>
                    ${escapeHtml(member.fullName)}
                  </strong>

                  <div class="member-meta">
                    <span>
                      ${
                        member.activeEntry
                          ? "En service"
                          : "Hors service"
                      }
                    </span>

                    <span>
                      ${formatDuration(member.unpaidHoursMs)}
                    </span>

                    <span>
                      ${formatMoney(member.amountToPay)}
                    </span>
                  </div>
                </div>

                <div class="actions">
                  <button
                    class="button green small pay-member"
                    data-id="${member.id}"
                    ${member.amountToPay <= 0 ? "disabled" : ""}
                  >
                    Payer
                  </button>

                  <button
                    class="button secondary small toggle-member"
                    data-id="${member.id}"
                    data-active="${member.active}"
                  >
                    ${
                      member.active
                        ? "Désactiver"
                        : "Réactiver"
                    }
                  </button>
                </div>
              </article>
            `;
          })
          .join("")
      : `
        <div class="empty">
          Aucun milicien enregistré.
        </div>
      `;

    const totalToPay = data.members.reduce(
      (total, member) =>
        total + member.amountToPay,
      0
    );

    const activeCount = data.members.filter(
      (member) => member.activeEntry
    ).length;

    app.innerHTML = `
      <div class="shell">
        <header class="topbar">
          <div class="brand">
            MILICE <span>CAYO PERICO</span>
          </div>

          <button
            class="button red small"
            id="adminLogoutButton"
          >
            Déconnexion
          </button>
        </header>

        <section class="hero">
          <div class="eyebrow">
            Administration
          </div>

          <h1>Tableau de bord</h1>
        </section>

        <section class="stats">
          <article class="stat-card">
            <small>Miliciens</small>
            <strong>${data.members.length}</strong>
          </article>

          <article class="stat-card">
            <small>En service</small>
            <strong>${activeCount}</strong>
          </article>

          <article class="stat-card">
            <small>Total à payer</small>
            <strong>${formatMoney(totalToPay)}</strong>
          </article>
        </section>

        <section class="admin-grid">
          <section class="panel">
            <h2>Demandes d’accès</h2>
            ${requestsMarkup}
          </section>

          <section class="panel">
            <h2>Miliciens et payes</h2>
            ${membersMarkup}
          </section>
        </section>
      </div>
    `;

    bindAdminEvents();
  } catch (error) {
    adminLoginPage();
  }
}

function bindAdminEvents() {
  document
    .querySelector("#adminLogoutButton")
    .addEventListener("click", adminLogout);

  document
    .querySelectorAll(".approve-request")
    .forEach((button) => {
      button.addEventListener("click", () => {
        approveRequest(Number(button.dataset.id));
      });
    });

  document
    .querySelectorAll(".reject-request")
    .forEach((button) => {
      button.addEventListener("click", () => {
        rejectRequest(Number(button.dataset.id));
      });
    });

  document
    .querySelectorAll(".pay-member")
    .forEach((button) => {
      button.addEventListener("click", () => {
        payMember(Number(button.dataset.id));
      });
    });

  document
    .querySelectorAll(".toggle-member")
    .forEach((button) => {
      button.addEventListener("click", () => {
        toggleMember(
          Number(button.dataset.id),
          button.dataset.active === "true"
        );
      });
    });
}

async function approveRequest(id) {
  try {
    await api(`/api/admin/requests/${id}/approve`, {
      method: "POST"
    });

    showToast("Accès accepté.");
    adminPage();
  } catch (error) {
    showToast(error.message);
  }
}

async function rejectRequest(id) {
  try {
    await api(`/api/admin/requests/${id}/reject`, {
      method: "POST"
    });

    showToast("Demande refusée.");
    adminPage();
  } catch (error) {
    showToast(error.message);
  }
}

async function payMember(id) {
  if (
    !confirm(
      "Confirmer le paiement de toutes les heures non payées ?"
    )
  ) {
    return;
  }

  try {
    const result = await api(
      `/api/admin/members/${id}/pay`,
      {
        method: "POST"
      }
    );

    showToast(
      `Paiement enregistré : ${formatMoney(result.totalAmount)}`
    );

    adminPage();
  } catch (error) {
    showToast(error.message);
  }
}

async function toggleMember(id, isActive) {
  try {
    await api(`/api/admin/members/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({
        active: !isActive
      })
    });

    adminPage();
  } catch (error) {
    showToast(error.message);
  }
}

async function adminLogout() {
  await api("/api/admin/logout", {
    method: "POST"
  });

  accessPage();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function startApplication() {
  const deviceToken =
    localStorage.getItem("cayoDeviceToken");

  if (deviceToken) {
    try {
      await api("/api/member/session", {
        method: "POST",
        body: JSON.stringify({
          deviceToken
        })
      });

      memberPage();
      return;
    } catch (error) {
      // L’appareil n’est pas encore validé.
    }
  }

  try {
    const status = await api("/api/admin/status");

    if (status.isAdmin) {
      adminPage();
      return;
    }
  } catch (error) {
    // Le serveur affichera la page normale.
  }

  accessPage();
}

startApplication();
