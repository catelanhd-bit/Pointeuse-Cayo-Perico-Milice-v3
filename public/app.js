const app = document.getElementById("app");

app.innerHTML = `
  <div class="login-container">
    <div class="login-card">
      <h1>🌴 Pointeuse Cayo Perico</h1>

      <p>Bienvenue sur la pointeuse officielle de la Milice.</p>

      <button id="memberButton">Espace Milicien</button>

      <button id="requestButton">Demande d'accès</button>

      <button id="adminButton">Administration</button>
    </div>
  </div>
`;

document.getElementById("memberButton").addEventListener("click", () => {
  app.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <h1>Espace Milicien</h1>

        <label>Nom RP complet</label>
        <input id="memberName" type="text" placeholder="Exemple : Juan Pedro">

        <button id="connectButton">Se connecter</button>

        <button id="backButton">Retour</button>
      </div>
    </div>
  `;

  document.getElementById("connectButton").addEventListener("click", () => {
    const name = document.getElementById("memberName").value.trim();

    if (!name) {
      alert("Entre ton nom RP.");
      return;
    }

    alert(`Connexion demandée pour ${name}`);
  });

  document.getElementById("backButton").addEventListener("click", () => {
    window.location.reload();
  });
});

document.getElementById("requestButton").addEventListener("click", () => {
  app.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <h1>Demande d'accès</h1>

        <label>Prénom RP</label>
        <input id="firstName" type="text">

        <label>Nom RP</label>
        <input id="lastName" type="text">

        <button id="sendRequestButton">Envoyer la demande</button>

        <button id="backButton">Retour</button>
      </div>
    </div>
  `;

  document.getElementById("sendRequestButton").addEventListener("click", () => {
    const firstName = document.getElementById("firstName").value.trim();
    const lastName = document.getElementById("lastName").value.trim();

    if (!firstName || !lastName) {
      alert("Remplis ton prénom et ton nom RP.");
      return;
    }

    alert("Demande envoyée au Général.");
  });

  document.getElementById("backButton").addEventListener("click", () => {
    window.location.reload();
  });
});

document.getElementById("adminButton").addEventListener("click", () => {
  app.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <h1>Administration</h1>

        <label>Mot de passe administrateur</label>
        <input id="adminPassword" type="password">

        <button id="adminLoginButton">Se connecter</button>

        <button id="backButton">Retour</button>
      </div>
    </div>
  `;

  document.getElementById("adminLoginButton").addEventListener("click", () => {
    alert("Connexion administrateur.");
  });

  document.getElementById("backButton").addEventListener("click", () => {
    window.location.reload();
  });
});
