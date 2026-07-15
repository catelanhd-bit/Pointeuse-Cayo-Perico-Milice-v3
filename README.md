# Pointeuse officielle de la Milice de Cayo Perico

## Fonctionnement

### Milicien
1. Le milicien entre son prénom RP et son nom RP.
2. Le navigateur reçoit un identifiant local.
3. L’administrateur accepte la demande.
4. Le milicien recharge le site.
5. Il est reconnu automatiquement sur ce navigateur.
6. Il peut prendre et terminer son service.
7. Le montant à payer est calculé à 12 500 $ par heure.

### Administration
- Accepter ou refuser les demandes.
- Voir les miliciens en service.
- Voir leurs heures non payées.
- Voir le montant à payer.
- Marquer toutes leurs heures non payées comme payées.
- Désactiver ou réactiver un accès.

## Mot de passe administrateur par défaut

CayoAdmin2026!

Sur Railway, ajoutez une variable :

ADMIN_PASSWORD=votre_mot_de_passe

Ajoutez également :

SESSION_SECRET=une_valeur_longue_et_secrete

## Déploiement Railway

1. Décompressez le ZIP.
2. Envoyez tout le dossier avec GitHub Desktop.
3. Déployez le dépôt GitHub sur Railway.
4. Générez un domaine public.
5. Pour conserver les données durablement, montez un volume Railway sur `/app/data`.
