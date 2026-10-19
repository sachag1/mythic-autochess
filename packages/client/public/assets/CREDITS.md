# Crédits des modèles 3D

Tous les modèles de ce dossier viennent de packs publiés sous licence **CC0 1.0**
(domaine public, http://creativecommons.org/publicdomain/zero/1.0/). Le crédit n'est pas
obligatoire, mais mérité.

| Fichiers | Pack | Auteur | Source | Licence |
|---|---|---|---|---|
| `chars/barbarian, knight, mage, rogue, rogue_hooded.glb`, armes et boucliers de `props.glb` (sans préfixe) | KayKit Character Pack : Adventurers 1.0 | Kay Lousberg (www.kaylousberg.com) | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 | CC0 (LICENSE.txt du pack) |
| `chars/skeleton_*.glb`, `anims/humanoid.glb`, `props.glb` (`skel_*`) | KayKit Character Pack : Skeletons 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 | CC0 (LICENSE.txt du pack) |
| `env.glb` (hexagones, nature, accessoires sans préfixe) | KayKit Medieval Hexagon Pack 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 | CC0 (LICENSE.txt du pack) |
| `env.glb` (`d_*` : colonnes, torches, bannières…) | KayKit Dungeon Remastered 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 | CC0 (LICENSE.txt du pack) |
| `creatures/bull, fox, husky, stag, wolf.glb` | Ultimate Animated Animal Pack | Quaternius (quaternius.com) | https://quaternius.com/packs/ultimateanimatedanimals.html | CC0 |
| `creatures/snake, snake_angry, spider.glb` | Easy Enemy Pack | Quaternius | https://quaternius.com/packs/easyenemy.html | CC0 |
| `creatures/trex.glb` | Animated Dinosaur Pack | Quaternius | https://quaternius.com/packs/animateddinosaurs.html | CC0 |
| `props.glb` (`q_*` sauf casques et katana) | Modular Weapons Pack | Quaternius | https://quaternius.com/packs/medievalweapons.html | CC0 |
| `props.glb` (`q_helmet*`, `q_katana`) | Animated Knight Pack | Quaternius | https://quaternius.com/packs/knightcharacter.html | CC0 |

Les fichiers Quaternius ont été récupérés sur le miroir https://github.com/trebeljahr/quaternius-showcase
(dossier `public/glb/`), dont le fichier `LICENSES.md` indique la licence CC0 et la page
d'origine de chaque pack (vérifiée le 10 oct. 2026 par l'auteur du miroir).

## Préparation

Les packs bruts ne sont pas dans le dépôt. Pour régénérer ce dossier :

1. télécharger les fichiers des packs ci-dessus dans un dossier à part, avec les
   sous-dossiers `adventurers/`, `skeletons/`, `hexagon/`, `dungeon/`, `quaternius/` ;
2. `node scripts/optimize-assets.mjs <ce dossier>` depuis `packages/client`.

Le script sépare les animations des personnages (une bibliothèque partagée par les neuf
corps KayKit, qui ont le même squelette), garde seulement les animations utiles, supprime
les pistes immobiles, réduit les textures en WebP, puis compresse la géométrie et les
animations avec meshopt (`EXT_meshopt_compression`).

Tout ce qui manque aux modèles (casques, ailes, cornes, couronnes, têtes d'animaux, queues,
auras…) est modélisé en code dans `src/scene/characters/`.
