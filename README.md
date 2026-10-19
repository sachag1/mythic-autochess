# Auto chess mythologique

Auto chess 3D dans le navigateur, sur le thème de toutes les mythologies.
Voir [ARCHITECTURE.md](ARCHITECTURE.md).

```bash
npm install
npm test          # tous les tests (moteur + serveur)
npm run demo      # un combat d'exemple commenté
npm run balance -w @autochess/sim   # équilibrage unité par unité et synergies
npm run comps -w @autochess/sim     # tournoi de compositions (~1 min)
npm start -w @autochess/server      # serveur de jeu sur ws://localhost:2567
npm run simulate -w @autochess/server -- 100   # 100 parties entre bots
```
