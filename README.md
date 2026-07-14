# Pointeuse Cayo Perico V2

Application prête pour Railway.

## Fonctions

- Connexion milicien et administrateur
- Prime fixe de 12 500 $ par heure
- Début et fin de service
- Chronomètre en direct
- Historique des pointages
- Tableau de bord administrateur
- Création et suppression de membres
- Ajout et suppression de pointages
- Statut payé / non payé
- Export CSV

## Comptes de démonstration

Administrateur :
- Identifiant : admin
- Mot de passe : Cayo123!

Milicien :
- Identifiant : milicien
- Mot de passe : Cayo123!

## Installation locale

```bash
npm install
npm start
```

Puis ouvrez http://localhost:3000

## Déploiement Railway

Envoyez directement les fichiers et dossiers extraits dans GitHub :

- package.json
- server.js
- public/
- data/
- README.md

Ne mettez pas seulement le ZIP dans GitHub.

Railway détectera automatiquement Node.js et exécutera `npm start`.

Une fois le déploiement terminé :
Settings → Networking → Generate Domain.

## Important

Les données sont enregistrées dans `data/db.json`.
Pour éviter toute perte de données sur Railway, ajoutez ensuite un volume persistant monté sur `/app/data`.
