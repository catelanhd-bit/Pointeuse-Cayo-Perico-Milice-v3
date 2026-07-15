# Pointeuse Cayo Perico

Cette version n'utilise aucun dossier `public` : seulement `server.js` et `package.json`.

## Railway

1. Envoie les fichiers `server.js`, `package.json` et `README.md` à la racine du dépôt GitHub.
2. Railway redéploie automatiquement.
3. Ajoute dans Railway > Variables :
   - `ADMIN_PASSWORD` : ton mot de passe admin
   - `SESSION_SECRET` : une longue valeur secrète

Mot de passe admin par défaut : `CayoAdmin2026!`

Les données sont créées automatiquement dans `db.json`.
