# Architecture

Auto chess 3D jouable dans le navigateur, multijoueur en ligne (8 joueurs).
Le contenu (unités, synergies, sorts) est 100 % en données : la licence ou l'univers
n'est qu'un « skin » qu'on peut changer sans toucher au moteur.

## Vue d'ensemble

```
packages/
  sim/      Simulation pure (TypeScript, zéro dépendance)   ← fait
  server/   Serveur de jeu Colyseus (salons, boutique, rounds) ← à venir
  client/   Rendu Three.js (WebGPU) + interface React        ← à venir
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

## `packages/server` (prochaine étape)

- **Colyseus** : un salon = une partie de 8 joueurs, état synchronisé automatiquement.
- Phases : `shop` (30 s) → `combat` (appel à `sim`) → résultats (PV perdus).
- Économie : or, intérêts, séries, XP/niveau, pool partagé d'unités, fusion 3 → ★2.
- Appariement des adversaires à chaque round, rounds PvE.

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

État au 19 oct. 2026 : archétypes entre 43 et 56 %, 51 unités sur 56 dans la cible,
compos de 2 à 7 synergies actives toutes entre 49 et 54 %.

## Équité : limiter la frustration liée à la chance (à faire côté serveur)

- **Objets normalisés** : chaque joueur reçoit la même valeur totale de composants à
  chaque étape ; seule la forme varie (composants, or, unités), pas la quantité.
- **Carrousel** : tous les joueurs choisissent dans le même ensemble, le plus bas en PV
  choisit en premier.
- **Pool partagé visible** : on voit qui joue quoi, donc on peut éviter une compo
  contestée au lieu de la subir.
- **Protection contre la malchance** : après plusieurs rerolls sans voir une unité
  encore disponible dans le pool, sa probabilité augmente légèrement.
- **Pas de personnage piège** : `npm run comps` avant chaque modification du contenu.
