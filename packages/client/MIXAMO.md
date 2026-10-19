# Personnages Mixamo : ce qu'il faut télécharger

Mixamo (https://www.mixamo.com, gratuit avec un compte Adobe) fournit des personnages
réalistes et des centaines d'animations sur un même squelette. Je ne peux pas me connecter
à ta place : télécharge les fichiers ci-dessous, puis lance la conversion (en bas).

**Licence** : les personnages et animations Mixamo sont libres d'usage dans ton jeu, même
commercial, mais on ne doit pas redistribuer les fichiers seuls. Les fichiers convertis
(`public/assets/mixamo/`) sont donc exclus de git par défaut (`.gitignore`).

Range tout dans un dossier hors du dépôt, par exemple :

```
C:\autochess-assets\mixamo\characters\   ← personnages
C:\autochess-assets\mixamo\animations\   ← animations
```

## 1. Personnages (onglet « Characters »)

Bouton **Download** → Format **FBX Binary (.fbx)**, Pose **T-pose**. Renomme le fichier
comme indiqué (si un nom n'existe plus, prends un personnage proche et garde le nom de fichier).

| Fichier | Personnage Mixamo (recherche) | Servira pour |
|---|---|---|
| `paladin.fbx` | Paladin J Nordstrom | Achille, Marduk, Gilgamesh, Erlang Shen, Lugh |
| `knight.fbx` | Knight D Pelegrini | Valkyrie, Thor, Hou Yi, Anubis |
| `archer.fbx` | Erika Archer | Skadi, Freyja, Ishtar, Satyre |
| `samurai.fbx` | Kachujin G Rosales | Susanoo, Tengu, Nezha |
| `warrior_woman.fbx` | Maria W/Prop J J Ong | Athéna, Sekhmet |
| `sorceress.fbx` | une magicienne (ex. « Medea ») | Méduse, Isis, Yuki-onna, Selkie |
| `wizard.fbx` | un magicien (tape « wizard » ou « mage ») | Zeus, Ra, Cernunnos, Tlaloc |
| `brute.fbx` | Brute | Cú Chulainn, The Dagda, Zhu Bajie |
| `mutant.fbx` | Mutant | Cyclope, Enkidu |
| `orc.fbx` | Warrok W Kurniawan | Minotaure, Sobek, Set |
| `assassin.fbx` | Nightshade J Friedrich | Bastet, Jaguar, Tezcatlipoca |
| `rogue.fbx` | Arissa | Morrigan, Banshee, Loki, Kappa |
| `undead.fbx` | Skeletonzombie T Avelange | Draugr, Mictlantecuhtli, Jiangshi |
| `vampire.fbx` | Vampire A Lusth | Hadès |
| `demon.fbx` | un démon (ex. « Demon », « Ganfaul ») | Raijin, Sun Wukong |
| `creature.fbx` | Mremireh O Desbiens | Harpie, Girtablilu |

## 2. Animations (onglet « Animations »)

Choisis n'importe quel personnage (ex. « Y Bot »), cherche l'animation, puis **Download** →
Format **FBX Binary**, Skin **Without Skin**, Frames per Second **30**. Coche **In Place**
quand l'option existe (course, sauts). Renomme comme indiqué.

| Fichier | Animation Mixamo (recherche) |
|---|---|
| `idle.fbx` | Breathing Idle |
| `combat_idle.fbx` | Sword And Shield Idle |
| `run.fbx` | Running (In Place) |
| `slash.fbx` | Sword And Shield Slash |
| `slash2.fbx` | Sword And Shield Attack |
| `great_slash.fbx` | Great Sword Slash |
| `spin.fbx` | une attaque tournoyante (ex. « Great Sword High Spin Attack ») |
| `punch.fbx` | Punching |
| `kick.fbx` | Mma Kick |
| `bow.fbx` | Standing Draw Arrow |
| `magic_shot.fbx` | Standing 1H Magic Attack 01 |
| `cast.fbx` | Standing 2H Magic Area Attack 01 |
| `cast2.fbx` | Standing 1H Cast Spell 01 |
| `throw.fbx` | Throw |
| `jump_attack.fbx` | Jump Attack |
| `block.fbx` | Sword And Shield Block |
| `hit.fbx` | Hit Reaction |
| `stun.fbx` | Dizzy Idle |
| `death.fbx` | Dying |
| `death2.fbx` | Falling Back Death |
| `victory.fbx` | Victory |
| `dance.fbx` | Hip Hop Dancing |
| `taunt.fbx` | Taunt |
| `leap.fbx` | Jumping (In Place) |

## 3. Conversion

Depuis `packages/client` :

```
node scripts/convert-mixamo.mjs C:\autochess-assets\mixamo
```

Le script convertit les FBX en glTF, regroupe les animations dans un seul fichier partagé,
compresse le tout (meshopt, textures WebP) et écrit `public/assets/mixamo/`. Le jeu utilise
alors ces modèles ; tant qu'ils sont absents, il garde les modèles KayKit.
