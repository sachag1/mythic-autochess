// Prépare les modèles 3D du jeu à partir des packs CC0 téléchargés (KayKit, Quaternius) :
// sépare les animations des personnages, fusionne accessoires et décor en un fichier
// chacun, réduit les textures (WebP) et compresse la géométrie et les animations (meshopt).
//
// Usage : node scripts/optimize-assets.mjs <dossier des packs téléchargés>
// Le dossier doit contenir adventurers/, skeletons/, hexagon/, dungeon/, quaternius/
// (voir public/assets/CREDITS.md). Les fichiers sont lus comme des données : aucun script
// des packs n'est exécuté.
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, meshopt, prune, resample, textureCompress, unpartition } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const SRC = process.argv[2];
if (!SRC) {
  console.error("Usage : node scripts/optimize-assets.mjs <dossier des packs>");
  process.exit(1);
}
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets");

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

/** Animations gardées pour les humanoïdes (squelette commun KayKit « Rig_Medium »). */
const HUMANOID_CLIPS = new Set([
  "Idle", "Idle_Combat", "2H_Melee_Idle", "Running_A", "Running_B", "Walking_A",
  "1H_Melee_Attack_Chop", "1H_Melee_Attack_Slice_Diagonal", "1H_Melee_Attack_Slice_Horizontal", "1H_Melee_Attack_Stab", "1H_Melee_Attack_Jump_Chop",
  "2H_Melee_Attack_Chop", "2H_Melee_Attack_Slice", "2H_Melee_Attack_Stab", "2H_Melee_Attack_Spin", "2H_Melee_Attack_Spinning",
  "Dualwield_Melee_Attack_Chop", "Dualwield_Melee_Attack_Slice", "Dualwield_Melee_Attack_Stab",
  "Unarmed_Melee_Attack_Punch_A", "Unarmed_Melee_Attack_Punch_B", "Unarmed_Melee_Attack_Kick",
  "1H_Ranged_Shoot", "2H_Ranged_Shoot",
  "Spellcast_Shoot", "Spellcast_Long", "Spellcast_Raise", "Spellcast_Summon",
  "Throw", "Block", "Block_Hit", "Hit_A", "Hit_B", "Death_A", "Death_B",
  "Cheer", "Taunt", "Taunt_Longer", "Jump_Full_Long", "Jump_Full_Short", "Dodge_Forward", "Spawn_Ground", "Use_Item",
]);

/** Supprime une animation avec ses échantillonneurs (sinon leurs données restent dans le fichier). */
function disposeAnimation(a) {
  for (const sampler of a.listSamplers()) sampler.dispose();
  for (const channel of a.listChannels()) channel.dispose();
  a.dispose();
}

/**
 * Supprime les pistes d'animation inutiles : pour un os et une propriété donnés, si toutes
 * les animations gardent la valeur de repos, aucune piste n'est nécessaire. (Si une seule
 * animation la modifie, on garde les pistes de toutes, sinon le fondu ne reviendrait pas.)
 */
function dropStaticTracks() {
  return (doc) => {
    const groups = new Map();
    for (const anim of doc.getRoot().listAnimations()) {
      for (const channel of anim.listChannels()) {
        const key = `${channel.getTargetNode()?.getName()}|${channel.getTargetPath()}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(channel);
      }
    }
    let removed = 0;
    for (const channels of groups.values()) {
      const node = channels[0].getTargetNode();
      const path = channels[0].getTargetPath();
      if (!node || path === "weights") continue;
      const rest = path === "translation" ? node.getTranslation() : path === "rotation" ? node.getRotation() : node.getScale();
      const isStatic = channels.every((c) => {
        const out = c.getSampler()?.getOutput();
        if (!out) return true;
        const v = [];
        for (let i = 0; i < out.getCount(); i++) {
          out.getElement(i, v);
          for (let k = 0; k < rest.length; k++) if (Math.abs(v[k] - rest[k]) > 1e-4) return false;
        }
        return true;
      });
      if (!isStatic) continue;
      for (const c of channels) {
        c.getSampler()?.dispose();
        c.dispose();
        removed++;
      }
    }
    if (removed) console.log(`  pistes statiques supprimées : ${removed}`);
  };
}

/** Supprime les accesseurs que plus rien n'utilise (prune les laisse parfois après la suppression d'animations). */
function dropOrphans() {
  return (doc) => {
    for (const a of doc.getRoot().listAccessors()) {
      if (a.listParents().every((p) => p.propertyType === "Root")) a.dispose();
    }
  };
}

async function finish(doc, file, { textureSize = 256, keepAnimations = true } = {}) {
  const root = doc.getRoot();
  if (!keepAnimations) for (const a of root.listAnimations()) disposeAnimation(a);
  await doc.transform(
    dedup(),
    prune({ keepLeaves: false, keepAttributes: false }),
    resample({ tolerance: 1e-4 }),
    dropStaticTracks(),
    dropOrphans(),
    unpartition(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [textureSize, textureSize], quality: 92 }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, await io.writeBinary(doc));
  const size = (await stat(file)).size;
  console.log(`${file.slice(OUT.length + 1).padEnd(34)} ${(size / 1024).toFixed(0).padStart(6)} Ko`);
  return size;
}

/** Fusionne plusieurs fichiers en un seul : chaque fichier devient un nœud racine nommé. */
async function mergeNamed(entries) {
  const out = new Document();
  const scene = out.createScene("props");
  for (const { id, file } of entries) {
    const src = await io.read(file);
    const before = new Set(out.getRoot().listScenes());
    mergeDocuments(out, src);
    const group = out.createNode(id);
    scene.addChild(group);
    for (const s of out.getRoot().listScenes()) {
      if (before.has(s) || s === scene) continue;
      for (const child of s.listChildren()) group.addChild(child);
      s.dispose();
    }
  }
  // Un seul tampon binaire pour tout le fichier.
  const buffer = out.getRoot().listBuffers()[0];
  for (const accessor of out.getRoot().listAccessors()) accessor.setBuffer(buffer);
  for (const b of out.getRoot().listBuffers()) if (b !== buffer) b.dispose();
  return out;
}

async function listFiles(dir, exts) {
  const out = [];
  for (const name of await readdir(dir)) if (exts.includes(extname(name).toLowerCase())) out.push(join(dir, name));
  return out.sort();
}

const id = (file) => basename(file).replace(/\.gltf\.glb$|\.glb$|\.gltf$/i, "");
let total = 0;

// ---------------------------------------------------------------- humanoïdes KayKit
{
  // La bibliothèque d'animations vient du guerrier squelette (95 animations, sur-ensemble).
  const doc = await io.read(join(SRC, "skeletons/chars/Skeleton_Warrior.glb"));
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!HUMANOID_CLIPS.has(a.getName())) disposeAnimation(a);
  for (const node of root.listNodes()) node.setMesh(null);
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) prim.dispose();
    mesh.dispose();
  }
  for (const skin of root.listSkins()) skin.dispose();
  for (const material of root.listMaterials()) material.dispose();
  total += await finish(doc, join(OUT, "anims/humanoid.glb"));

  const bodies = [
    ...(await listFiles(join(SRC, "adventurers/chars"), [".glb"])),
    ...(await listFiles(join(SRC, "skeletons/chars"), [".glb"])),
  ];
  for (const file of bodies) {
    const doc = await io.read(file);
    total += await finish(doc, join(OUT, `chars/${id(file).toLowerCase()}.glb`), { keepAnimations: false, textureSize: 256 });
  }
}

// ---------------------------------------------------------------- créatures Quaternius
for (const file of [
  ...(await listFiles(join(SRC, "quaternius/animals_pack"), [".glb"])),
  ...(await listFiles(join(SRC, "quaternius/easy_enemies_pack"), [".glb"])),
  ...(await listFiles(join(SRC, "quaternius/dinosaurs_pack"), [".glb"])),
]) {
  const doc = await io.read(file);
  // Animations inutiles en combat (manger, variantes d'attente…).
  for (const a of doc.getRoot().listAnimations()) if (/Eating|Idle_2|Headlow|HeadLow|HitReact_Right|Attack_Kick/.test(a.getName())) disposeAnimation(a);
  total += await finish(doc, join(OUT, `creatures/${id(file).toLowerCase()}.glb`));
}

// ---------------------------------------------------------------- accessoires (armes, boucliers, casques)
{
  const entries = [
    ...(await listFiles(join(SRC, "adventurers/props"), [".gltf"])).map((f) => ({ id: id(f), file: f })),
    ...(await listFiles(join(SRC, "skeletons/props"), [".gltf"])).map((f) => ({ id: id(f).replace(/^Skeleton_/, "skel_").toLowerCase(), file: f })),
    ...(await listFiles(join(SRC, "quaternius/medieval_weapons_pack"), [".glb"])).map((f) => ({ id: `q_${id(f).toLowerCase()}`, file: f })),
    ...(await listFiles(join(SRC, "quaternius/single_knight_pack"), [".glb"])).map((f) => ({ id: `q_${id(f).toLowerCase()}`, file: f })),
  ];
  total += await finish(await mergeNamed(entries), join(OUT, "props.glb"), { textureSize: 128 });
}

// ---------------------------------------------------------------- décor (hexagones, nature, donjon)
{
  const entries = [];
  for (const sub of ["base", "coast", "nature", "props"]) {
    for (const f of await listFiles(join(SRC, "hexagon", sub), [".gltf"])) entries.push({ id: id(f), file: f });
  }
  for (const f of await listFiles(join(SRC, "dungeon"), [".glb"])) entries.push({ id: `d_${id(f)}`, file: f });
  total += await finish(await mergeNamed(entries), join(OUT, "env.glb"), { textureSize: 512 });
}

console.log(`Total : ${(total / 1024 / 1024).toFixed(2)} Mo`);
