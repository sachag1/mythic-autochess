# Mythic Autochess

Auto chess 3D dans le navigateur, façon TFT, sur le thème de **toutes les mythologies** :
56 personnages répartis en 8 panthéons (grec, nordique, égyptien, japonais, chinois,
celtique, aztèque, mésopotamien), 7 classes, 36 objets mythiques, des augments argent, or
et prismatique, et des Présages qui changent les règles à chaque partie. Multijoueur en
ligne jusqu'à 8 joueurs, complété par des bots.

*An open-source, TFT-like 3D browser auto battler themed on world mythologies —
TypeScript, Three.js (WebGPU), React and Colyseus, with a deterministic server-side
combat simulation.*

## Jouer en local

Il faut [Node.js](https://nodejs.org) 22 ou plus.

```bash
npm install
npm start -w @autochess/server      # serveur de jeu sur ws://localhost:2567
npm run dev -w @autochess/client    # dans un autre terminal : http://localhost:5173
```

Ouvre http://localhost:5173, choisis un pseudo et lance la partie : les places vides sont
prises par des bots.

## Développement

```bash
npm test          # tous les tests (moteur + serveur)
npm run typecheck
npm run demo      # un combat d'exemple commenté
npm run balance -w @autochess/sim   # équilibrage unité par unité et synergies
npm run comps -w @autochess/sim     # tournoi de compositions (~1 min)
npm run simulate -w @autochess/server -- 100   # 100 parties entre bots
npm run augments -w @autochess/server -- 800   # équilibrage des augments (~3 min)
```

L'architecture (simulation déterministe, serveur qui fait autorité, protocole réseau,
équilibrage) est décrite dans [ARCHITECTURE.md](ARCHITECTURE.md).

| Paquet | Contenu |
|---|---|
| `packages/sim` | Simulation de combat déterministe et tout le contenu du jeu (unités, synergies, objets, PvE) |
| `packages/server` | Logique de partie et salon Colyseus (boutique, économie, Présages, augments, bots) |
| `packages/client` | Client 3D : Vite, React, Three.js (WebGPU avec repli WebGL2) |

## Licence

Le code est sous licence [MIT](LICENSE).

Les modèles 3D de `packages/client/public/assets` viennent de packs **CC0** (domaine
public) de Kay Lousberg (KayKit) et de Quaternius : voir
[CREDITS.md](packages/client/public/assets/CREDITS.md). Les personnages et récits
mythologiques sont du domaine public.
