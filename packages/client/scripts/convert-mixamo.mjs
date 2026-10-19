// Convertit les personnages et animations Mixamo (FBX) pour le jeu : FBX → glTF avec
// FBX2glTF, une bibliothèque d'animations commune (toutes les animations Mixamo partagent
// le même squelette « mixamorig »), textures WebP, compression meshopt.
//
// Usage : node scripts/convert-mixamo.mjs <dossier> (voir MIXAMO.md)
// <dossier>/characters/*.fbx et <dossier>/animations/*.fbx → public/assets/mixamo/
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, meshopt, prune, resample, textureCompress, unpartition } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const SRC = process.argv[2];
if (!SRC) {
  console.error("Usage : node scripts/convert-mixamo.mjs <dossier contenant characters/ et animations/>");
  process.exit(1);
}
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "mixamo");
const require = createRequire(import.meta.url);
const FBX2GLTF = join(dirname(require.resolve("fbx2gltf/package.json")), "bin", process.platform === "win32" ? "Windows_NT" : process.platform === "darwin" ? "Darwin" : "Linux", process.platform === "win32" ? "FBX2glTF.exe" : "FBX2glTF");

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });
const tmp = await mkdtemp(join(tmpdir(), "mixamo-"));

/** FBX → GLB (textures intégrées). */
async function fbxToDoc(file) {
  const out = join(tmp, basename(file, ".fbx"));
  execFileSync(FBX2GLTF, ["--binary", "--input", file, "--output", out], { stdio: "pipe" });
  return io.read(`${out}.glb`);
}

function disposeAnimation(a) {
  for (const s of a.listSamplers()) s.dispose();
  for (const c of a.listChannels()) c.dispose();
  a.dispose();
}

function dropOrphans() {
  return (doc) => {
    for (const a of doc.getRoot().listAccessors()) if (a.listParents().every((p) => p.propertyType === "Root")) a.dispose();
  };
}

async function write(doc, name, textureSize) {
  await doc.transform(
    dedup(),
    prune(),
    resample({ tolerance: 1e-4 }),
    dropOrphans(),
    unpartition(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [textureSize, textureSize], quality: 85 }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  const file = join(OUT, name);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, await io.writeBinary(doc));
  const size = (await stat(file)).size;
  console.log(`${name.padEnd(28)} ${(size / 1024).toFixed(0).padStart(6)} Ko`);
  return size;
}

const list = async (dir) => (existsSync(dir) ? (await readdir(dir)).filter((f) => f.toLowerCase().endsWith(".fbx")).sort().map((f) => join(dir, f)) : []);
let total = 0;

// ---------------------------------------------------------------- personnages
const characters = await list(join(SRC, "characters"));
for (const file of characters) {
  try {
    const doc = await fbxToDoc(file);
    for (const a of doc.getRoot().listAnimations()) disposeAnimation(a);
    total += await write(doc, `${basename(file, ".fbx").toLowerCase()}.glb`, 1024);
  } catch (e) {
    console.error(`échec ${basename(file)} : ${e.message}`);
  }
}

// ---------------------------------------------------------------- animations
const animations = await list(join(SRC, "animations"));
if (animations.length) {
  const lib = new Document();
  lib.createBuffer();
  let skeleton = null; // nœuds du premier fichier, par nom
  for (const file of animations) {
    try {
      const doc = await fbxToDoc(file);
      const name = basename(file, ".fbx").toLowerCase();
      const anims = doc.getRoot().listAnimations();
      if (!anims.length) {
        console.error(`aucune animation dans ${basename(file)}`);
        continue;
      }
      // Garde la plus longue (Mixamo n'en exporte qu'une), renommée d'après le fichier.
      const keep = anims.reduce((a, b) => (b.listChannels().length > a.listChannels().length ? b : a));
      for (const a of anims) if (a !== keep) disposeAnimation(a);
      keep.setName(name);
      for (const n of doc.getRoot().listNodes()) n.setMesh(null);
      for (const m of doc.getRoot().listMeshes()) m.dispose();
      for (const s of doc.getRoot().listSkins()) s.dispose();
      const before = new Set(lib.getRoot().listNodes());
      const merged = mergeDocuments(lib, doc);
      void merged;
      const added = lib.getRoot().listNodes().filter((n) => !before.has(n));
      if (!skeleton) {
        skeleton = new Map(added.map((n) => [n.getName(), n]));
      } else {
        // Recible les pistes sur le squelette du premier fichier, puis supprime le doublon.
        const anim = lib.getRoot().listAnimations().at(-1);
        for (const ch of anim.listChannels()) {
          const target = skeleton.get(ch.getTargetNode()?.getName());
          if (target) ch.setTargetNode(target);
          else ch.getSampler()?.dispose(), ch.dispose();
        }
        for (const n of added) n.dispose();
        for (const s of lib.getRoot().listScenes()) if (!s.listChildren().length) s.dispose();
      }
    } catch (e) {
      console.error(`échec ${basename(file)} : ${e.message}`);
    }
  }
  const buffer = lib.getRoot().listBuffers()[0];
  for (const a of lib.getRoot().listAccessors()) a.setBuffer(buffer);
  for (const b of lib.getRoot().listBuffers()) if (b !== buffer) b.dispose();
  total += await write(lib, "animations.glb", 64);
}

await rm(tmp, { recursive: true, force: true });
console.log(`${characters.length} personnages, ${animations.length} animations — total ${(total / 1024 / 1024).toFixed(2)} Mo`);
