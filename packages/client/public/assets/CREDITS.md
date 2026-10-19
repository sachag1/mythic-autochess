# Crédits des ressources graphiques

Tous les fichiers de ce dossier suivis par git sont sous licence **CC0 1.0** (domaine
public, http://creativecommons.org/publicdomain/zero/1.0/) ou sont des rendus produits par
le jeu lui-même (portraits). Le crédit n'est pas obligatoire, mais mérité.

Le dossier `mixamo/` n'est pas dans le dépôt (voir `.gitignore` et `../../MIXAMO.md`) :
la licence Adobe Mixamo permet d'utiliser les personnages et animations dans un jeu et d'en
diffuser des images, mais pas de redistribuer les fichiers 3D eux-mêmes.

## Modèles KayKit et Quaternius

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

## Poly Haven (https://polyhaven.com, CC0)

Récupérés avec `scripts/fetch-polyhaven.mjs` (textures, ciels) et
`scripts/fetch-polyhaven-models.mjs` (modèles), puis réduits (textures WebP, géométrie
simplifiée et compressée avec meshopt).

### Modèles : `weapons.glb` et `decor.glb`

| Fichier | Modèle Poly Haven | Auteurs | Lien |
|---|---|---|---|
| `weapons.glb` | Antique Katana 01 | Tal Swicegood | https://polyhaven.com/a/antique_katana_01 |
| `weapons.glb` | Ornate Medieval Dagger | Sofia Pahaoja | https://polyhaven.com/a/ornate_medieval_dagger |
| `weapons.glb` | Ornate Medieval Mace | Ulan Cabanilla | https://polyhaven.com/a/ornate_medieval_mace |
| `weapons.glb` | Ornate War Hammer | James Ray Cock, Ulan Cabanilla | https://polyhaven.com/a/ornate_war_hammer |
| `weapons.glb` | Wooden Axe | Ulan Cabanilla | https://polyhaven.com/a/wooden_axe |
| `weapons.glb` | Wooden Axe 02 | Ulan Cabanilla | https://polyhaven.com/a/wooden_axe_02 |
| `decor.glb` | Boulder 01 | Rico Cilliers | https://polyhaven.com/a/boulder_01 |
| `decor.glb` | Namaqualand Boulder 02 | Greg Zaal, Rico Cilliers | https://polyhaven.com/a/namaqualand_boulder_02 |
| `decor.glb` | Namaqualand Boulder 04 | Jenelle van Heerden | https://polyhaven.com/a/namaqualand_boulder_04 |
| `decor.glb` | Rock Moss Set 01 | Kless Gyzen | https://polyhaven.com/a/rock_moss_set_01 |
| `decor.glb` | Gothic Statue | Benny Weimer | https://polyhaven.com/a/gothic_statue |
| `decor.glb` | Horse Statue 01 | Rico Cilliers | https://polyhaven.com/a/horse_statue_01 |
| `decor.glb` | Antique Ceramic Vase 01 | James Ray Cock | https://polyhaven.com/a/antique_ceramic_vase_01 |
| `decor.glb` | Ceramic Vase 02 | James Ray Cock | https://polyhaven.com/a/ceramic_vase_02 |
| `decor.glb` | Brass Vase 01 | Rico Cilliers | https://polyhaven.com/a/brass_vase_01 |
| `decor.glb` | Stone Fire Pit | Sebastian Platen | https://polyhaven.com/a/stone_fire_pit |

### Textures PBR : `pbr/<nom>_diff.webp`, `_nor.webp`, `_arm.webp` (30 fichiers)

`diff` = couleur, `nor` = normales, `arm` = occlusion, rugosité et métal (R, G, B).

| Fichiers | Texture Poly Haven | Auteurs | Lien |
|---|---|---|---|
| `pbr/marble_*` | Marble 01 | Rob Tuytel | https://polyhaven.com/a/marble_01 |
| `pbr/sandstone_*` | Large Sandstone Blocks | Rob Tuytel | https://polyhaven.com/a/large_sandstone_blocks |
| `pbr/floor_*` | Monastery Stone Floor | Amal Kumar | https://polyhaven.com/a/monastery_stone_floor |
| `pbr/sand_*` | Coast Sand 01 | Rob Tuytel | https://polyhaven.com/a/coast_sand_01 |
| `pbr/granite_*` | Granite Tile | Charlotte Baglioni | https://polyhaven.com/a/granite_tile |
| `pbr/metal_*` | Metal Plate | Rob Tuytel | https://polyhaven.com/a/metal_plate |
| `pbr/leather_*` | Brown Leather | Rob Tuytel | https://polyhaven.com/a/brown_leather |
| `pbr/velvet_*` | Velour Velvet | colormass, Rico Cilliers | https://polyhaven.com/a/velour_velvet |
| `pbr/linen_*` | Rough Linen | colormass, Rico Cilliers | https://polyhaven.com/a/rough_linen |
| `pbr/wool_*` | Wool Boucle | colormass, Rico Cilliers | https://polyhaven.com/a/wool_boucle |

### Ciels : `sky/` (4 fichiers)

`<nom>.hdr` : HDRI 1k (éclairage) ; `<nom>.webp` : version 4096 × 2048 (fond affiché).

| Fichiers | HDRI Poly Haven | Auteurs | Lien |
|---|---|---|---|
| `sky/day.hdr`, `sky/day.webp` | Kloofendal 48d Partly Cloudy (Pure Sky) | Greg Zaal, Jarod Guest | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky |
| `sky/sunset.hdr`, `sky/sunset.webp` | Belfast Sunset (Pure Sky) | Greg Zaal, Dimitrios Savva, Jarod Guest | https://polyhaven.com/a/belfast_sunset_puresky |

## Portraits : `portraits/<unité>.webp` (61 fichiers)

Rendus produits par le jeu, pas des images récupérées : la page `?portraits` du client
(`src/scene/Portraits.tsx`) affiche chaque unité seule, en buste (corps entier pour les
créatures), sur fond transparent, et `scripts/portrait-server.mjs` enregistre l'image
en WebP. Ils ont été rendus avec les modèles du jeu tels qu'ils étaient installés :

- les personnages humanoïdes : corps **Mixamo** (Adobe), avec accessoires modélisés en code
  et textures Poly Haven ci-dessus. La licence Mixamo autorise la diffusion d'images rendues ;
  seuls les fichiers 3D Mixamo ne sont pas redistribués (dossier `mixamo/` exclu du dépôt) ;
- les créatures (Fenrir, Xolotl, Orochi, Quetzalcoatl, Tiamat, loup, hydre, Jörmungandr) :
  modèles Quaternius (CC0) listés plus haut.

Sans les fichiers Mixamo, les portraits restent ceux-ci : ils peuvent donc différer un
peu des personnages KayKit de repli affichés en 3D.

## Préparation des modèles KayKit et Quaternius

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
