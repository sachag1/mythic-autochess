# Architecture

Auto chess 3D jouable dans le navigateur, multijoueur en ligne (8 joueurs).
Le contenu (unités, synergies, sorts) est 100 % en données : la licence ou l'univers
n'est qu'un « skin » qu'on peut changer sans toucher au moteur.

## Vue d'ensemble

```
packages/
  sim/      Simulation pure (TypeScript, zéro dépendance)    ← fait
  server/   Serveur de jeu Colyseus (salons, boutique, rounds) ← fait
  client/   Rendu Three.js (WebGPU) + interface React         ← à venir
```

```
 ┌────────────┐   actions (acheter, placer…)   ┌──────────────┐
 │  client    │ ─────────────────────────────▶ │   server     │
 │  Three.js  │                                │   Colyseus   │
 │  + React   │ ◀───────────────────────────── │              │
 └────────────┘   état de la partie + journal  └──────┬───────┘
       ▲          d'événements du combat              │ appelle
       │                                              ▼
       │ rejoue les événements                 ┌──────────────┐
       └────────────────────────────────────── │    sim       │
                                               │  (déterministe)│
                                               └──────────────┘
```

### Principe clé : le serveur fait autorité

- Le **combat est calculé entièrement côté serveur**, en une fois, dès que la phase de
  combat démarre. Le résultat est un **journal d'événements horodatés** (déplacement,
  attaque, dégâts, sort, mort…).
- Le client **ne simule rien** : il reçoit le journal et le **rejoue** en 3D
  (animations, effets, barres de vie). Impossible de tricher côté client.
- La simulation est **déterministe** : même plateaux + même graine (`seed`) = même
  combat, à l'événement près. Ça permet les replays, le débogage et les tests.

## `packages/sim`

Code pur, sans réseau ni rendu. Testable en isolation.

| Fichier | Rôle |
|---|---|
| `hex.ts` | Grille hexagonale (coordonnées « offset » ↔ « cube », distance, voisins, chemin) |
| `rng.ts` | Générateur aléatoire à graine (mulberry32) — jamais `Math.random()` |
| `types.ts` | Définitions des unités, sorts, synergies, événements |
| `stats.ts` | Stats selon le niveau d'étoiles, application des bonus de synergies |
| `traits.ts` | Comptage des synergies actives par équipe |
| `battle.ts` | Boucle de combat en ticks (ciblage, déplacement, attaque, mana, sorts) |
| `data/balance.ts` | Gabarits de stats par **rôle** et par **coût** (rareté 1 à 5) |
| `data/units.ts` | Les 56 personnages (7 par panthéon, 12 / 12 / 12 / 12 / 8 par coût) |
| `data/traits.ts` | 8 origines (panthéons) + 7 classes, paliers à 2 / 4 / 6 |
| `data/items.ts` | 8 composants + objets complets (artefacts mythiques) |
| `data/shop.ts` | Taille du pool et probabilités de la boutique par niveau (pour le serveur) |
| `scripts/demo.ts` | Combat d'exemple commenté : `npm run demo` |
| `scripts/balance.ts` | Équilibrage unité par unité et synergie par synergie : `npm run balance` |
| `scripts/comps.ts` | Tournoi de compositions complètes : `npm run comps` |

### Le plateau

Comme TFT : 7 colonnes × 8 rangées. Chaque joueur place ses unités sur ses 4 rangées
(0–3). Pour le combat, le plateau de l'adversaire est **retourné** et placé en
rangées 4–7.

### Boucle de combat

- 20 ticks par seconde (`TICK_MS = 50`), combat limité à `MAX_BATTLE_MS`.
- À chaque tick, chaque unité vivante (ordre stable par id) :
  1. gère ses statuts (étourdissement…) ;
  2. vérifie sa mana : si pleine → lance son sort ;
  3. vérifie sa cible : morte ou hors de portée → cherche l'ennemi le plus proche ;
  4. à portée → attaque quand son temps de recharge est écoulé ;
  5. sinon → avance d'une case vers la cible (case réservée pour éviter les collisions).
- Mana : +10 par attaque, et une part des dégâts reçus.
- Réduction des dégâts : `dégâts × 100 / (100 + armure)` (physique) ou résistance
  magique (magique). Les dégâts bruts ignorent les deux.
- Les sorts sont composés d'**effets primitifs** (dégâts, soin, bouclier, étourdissement,
  bonus de stat, mana, saut) avec une **zone** (cible, rayon autour de la cible, soi…).
  On crée un nouveau sort en données, sans écrire de code.
- Les **assassins** sautent à côté de l'ennemi le plus éloigné au début du combat, comme
  dans TFT : le placement de la ligne arrière compte.

## `packages/server`

Deux couches bien séparées :

| Fichier | Rôle |
|---|---|
| `game/game.ts` | **Toute la logique d'une partie**, sans réseau : boutique, pool partagé, or, niveaux, fusions ★, objets, armurerie, appariement, combats, éliminations |
| `game/rules.ts` | Économie et calendrier (XP par niveau, revenus, intérêts, séries, dégâts par étape, minuteurs) |
| `game/omens.ts` | Les **Présages** (voir plus bas) |
| `game/bot.ts` | Bots (reroll / montée rapide / équilibré) : remplacent un joueur absent ou déconnecté |
| `room/GameRoom.ts` | Salon Colyseus : reçoit les messages, appelle `Game`, recopie l'état |
| `room/schema.ts` | État synchronisé vers les clients (binaire, différences seulement) |
| `scripts/simulate.ts` | Parties complètes entre 8 bots : `npm run simulate -w @autochess/server -- 100` |

### Déroulé d'une partie

```
Lobby ─▶ Présage (vote, 20 s) ─▶ Étape 1 : armurerie, PvE, PvE, PvE
                                 Étape 2+ : PvP, PvP, PvP, armurerie, PvP, PvP, PvE
Chaque round PvP/PvE : préparation (30 s) ─▶ combat (durée du combat + 3 s) ─▶ résultats
```

- **Lobby** : le premier joueur est l'hôte et lance la partie ; les places vides sont
  prises par des bots (démarrage automatique au bout de 60 s).
- **Préparation** : revenu (base + intérêts jusqu'à 5 + série), +2 XP, nouvelle boutique
  (sauf si verrouillée).
- **Combat** : tous les combats sont calculés d'un coup par `sim` ; chaque joueur reçoit
  le journal d'événements de **son** combat (message `battle`) pour le rejouer en 3D.
  Nombre impair de joueurs : le dernier affronte une **copie** d'un autre joueur.
- **Dégâts** : base de l'étape + 1 par étoile des unités adverses survivantes.
- **Déconnexion** : un bot joue à la place du joueur jusqu'à son retour (60 s pour revenir
  dans la même partie).

### Messages client → serveur

`start`, `vote {omen}`, `pick {offer}`, `buy {slot}`, `sell {at}`, `reroll`, `buyXp`,
`lock`, `move {from, to}`, `arrange {layout}`, `equip {item, at}` — où une position vaut
`{ zone: "bench", index }` ou `{ zone: "board", col, row }`. En cas de refus, le serveur
répond `error {action, error}`.

### Présages : chaque partie est différente

Comme les rencontres et les portails de TFT. Au début de la partie, 3 présages sont
proposés, chacun annoncé par une figure du roster ; les joueurs votent, et le résultat
est tiré au sort **pondéré par les votes**. Le présage change les règles pour tous :

| Présage | Héraut | Effet |
|---|---|---|
| Hermes' Bargain | Hades | Premier reroll gratuit à chaque round |
| Hoard of the Nibelungs | Fenrir | +1 or par round |
| Odin's Wisdom | Valkyrie | L'XP coûte 3 au lieu de 4 |
| Treasury of Babylon | Gilgamesh | Intérêts plafonnés à 7 au lieu de 5 |
| Forge of Hephaestus | Cyclops | Un objet complet pour tous au début de l'étape 2 |
| Bounty of Isis | Isis | Un composant de plus à chaque round PvE |
| Armory of the Gods | Athena | Objets complets à l'armurerie dès l'étape 3 |
| Thor's Storm | Thor | +15 % de vitesse d'attaque pour toutes les unités |
| Zenith of Ra | Ra | +20 puissance et +10 mana de départ pour toutes les unités |
| Favor of the Pantheon | Zeus | Un panthéon tiré au sort : +200 PV et +15 puissance |
| Thread of the Fates | Morrigan | Les 5 pièces apparaissent dès le niveau 6 |
| Ragnarök | Orochi | +50 % de dégâts aux joueurs dès l'étape 4 |

Ajouter un présage = ajouter une entrée dans `omens.ts`.

### Augments : 3 choix par partie

Comme dans TFT : aux rounds **2-1, 3-2 et 4-2**, chaque joueur voit 3 augments d'une même
rareté (**argent**, **or** ou **prismatique**) et peut relancer la proposition une fois.
Sans choix à la fin de la préparation, un augment est pris au hasard.

- **Équité** : la suite de raretés (par exemple argent → or → prismatique) est tirée au
  début de la partie et **identique pour tous les joueurs**.
- **40 augments** (`game/augments.ts`) : économie (or, XP, rerolls gratuits, intérêts),
  butin (composants, objets complets, unités), bonus de combat (stats, boucliers, soins,
  éclairs…). Certains servent des styles précis : *Village Heroes* et *Legion of Heroes*
  pour le reroll de petits persos, *Favor of Olympus* pour les compos de gros persos (3 à 5 pièces),
  *Hoplite Drill* pour la ligne de front.
- Messages : `augment {index}`, `rerollAugments`. État : `augments` (public),
  `augmentChoices` et `augmentRerolls` (privés).
- **Équilibrage** : `npm run augments -w @autochess/server -- 800` joue 800 parties entre
  bots qui prennent leurs augments au hasard et donne la place moyenne de chaque augment
  (4,5 = neutre ; cible entre 4,1 et 4,9 dans sa rareté).

## `packages/client` (après)

- **Vite + Three.js** (moteur WebGPU avec repli WebGL), **React** pour l'interface.
- Modèles 3D en **glTF/GLB** compressés (Draco/Meshopt + textures KTX2), animations
  `idle / walk / attack / cast / death`.
- Un « lecteur » qui rejoue le journal d'événements de `sim` avec interpolation.

## Contenu : toutes les mythologies

Thème du domaine public, donc publiable sans problème de licence.

- **Origines (panthéons)** : Grec (Olympian), Nordique (Einherjar), Égyptien (Sun Court),
  Japonais (Kami), Chinois (Celestial), Celtique (Fae), Aztèque (Fifth Sun),
  Mésopotamien (Ziggurat).
- **Classes** : Guardian, Warrior, Beast, Hunter, Sorcerer, Trickster, Oracle.
- **Raretés** comme TFT : coût 1 à 5, pool partagé (30 / 25 / 18 / 10 / 9 exemplaires),
  probabilités de boutique qui évoluent avec le niveau.
- **56 personnages** : 7 par panthéon (dont un à 5 pièces), 12 / 12 / 12 / 12 / 8 par coût,
  8 à 10 par classe. Chaque panthéon mélange tanks, dégâts physiques, dégâts magiques et
  soutien : une origine se complète toujours avec des classes d'autres panthéons.

Rester respectueux avec les religions encore pratiquées (shintoïsme, hindouisme,
religions yoruba…) : privilégier héros, créatures et figures de récits plutôt que des
divinités vénérées aujourd'hui, ou les traiter avec soin.

## Équilibrage

Objectif : **un maximum de compositions viables**, aucun personnage « piège », et des
parties qui se jouent sur le choix des unités, le placement et la répartition des objets
plutôt que sur la chance.

1. Chaque unité part d'un **gabarit** (rôle × coût) : même budget pour un même coût.
2. `npm run balance` — tests isolés :
   - chaque unité ★2 dans une équipe standard neutre contre toutes les autres
     (échelle des coûts + unités trop fortes ou trop faibles dans leur coût) ;
   - chaque synergie à 2 / 4 / 6 contre les mêmes unités sans synergie (écart de PV).
3. `npm run comps` — **la référence** : des centaines d'équipes construites comme par un
   joueur (noyau de synergies, ligne de front, carry protégé, mêmes objets pour tous)
   s'affrontent. Cibles :
   - archétypes (reroll 1 / 2 / 3 pièces, niveau 8 classique, gros persos) : ~50 % ;
   - chaque unité : entre 42 et 58 % de victoires quand elle est jouée ;
   - chaque palier de synergie : entre 40 et 60 % ;
   - compos mono-synergie et compos mixtes : même taux de victoire.
4. On corrige d'abord le gabarit si tout un rôle est décalé, puis les sorts un par un.

État au 19 oct. 2026 (tournoi de 1 500 équipes, `TEAMS=300 GAMES=30 npm run comps`) :
archétypes entre 43 et 57 %, 55 unités sur 56 dans la cible (Ra à 59 %), tous les paliers
de synergie dans la cible sauf Oracle 6 (64 %, peu joué), compos de 3 à 7 synergies
actives entre 46 et 54 %.

## Équité : limiter la frustration liée à la chance

En place dans le serveur :

- **Butin PvE normalisé** : chaque joueur reçoit le même nombre de composants à chaque
  round PvE, qu'il gagne ou non ; seul le type varie.
- **Armurerie équitable** (l'équivalent du carrousel) : un choix par joueur, le plus bas
  en PV choisit en premier.
- **Pool partagé** : acheter une unité la retire du pool de tout le monde ; on voit les
  plateaux des autres, donc on peut éviter une compo contestée.
- **Protection contre la malchance** : une unité qu'on possède et qu'on n'a pas vue depuis
  plusieurs boutiques gagne jusqu'à ×2 de chances d'apparaître (+15 % par boutique ratée).
- **Appariement** : on évite de rejouer contre ses derniers adversaires.
- **Pas de personnage piège** : `npm run comps` avant chaque modification du contenu.

À faire : boutique toujours privée côté rendu (déjà privée côté réseau), et plus de
recettes d'objets (6 objets complets sur les 36 combinaisons possibles pour l'instant).
