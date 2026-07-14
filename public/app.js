console.log("Pointeuse Cayo Perico chargée.");

document.addEventListener("DOMContentLoaded", async () => {
    try {
        const res = await fetch("/health");
        const data = await res.json();

        document.querySelector("#app").innerHTML = `
            <h1>🌴 Pointeuse Cayo Perico</h1>
            <p>Le serveur fonctionne correctement.</p>
            <p><strong>Health :</strong> ${JSON.stringify(data)}</p>
        `;
    } catch (e) {
        document.querySelector("#app").innerHTML = `
            <h1>❌ Erreur</h1>
            <p>Impossible de contacter le serveur.</p>
        `;
        console.error(e);
    }
});
