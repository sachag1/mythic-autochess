// Télécharge des modèles 3D réalistes de Poly Haven (CC0) — armes et décor de l'arène —
// et les regroupe en deux fichiers optimisés : public/assets/weapons.glb et decor.glb.
// Chaque modèle devient un nœud racine nommé d'après son identifiant Poly Haven.
// Usage : node scripts/fetch-polyhaven-models.mjs
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, meshopt, prune, simplify, textureCompress, unpartition, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";
import sharp from "sharp";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets");
const API = "https://api.polyhaven.com";
const SETS = {
  weapons: ["antique_katana_01", "ornate_medieval_dagger", "ornate_medieval_mace", "ornate_war_hammer", "wooden_axe", "wooden_axe_02"],
  decor: ["boulder_01", "namaqualand_boulder_02", "namaqualand_boulder_04", "rock_moss_set_01", "gothic_statue", "horse_statue_01", "antique_ceramic_vase_01", "ceramic_vase_02", "brass_vase_01", "stone_fire_pit"],
};

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

async function get(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`${r.status} ${url}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((res) => setTimeout(res, 1500 * i));
    }
  }
}

/**
 * Oriente une arme pour la main : axe long → +x (vers la lame ou la tête), poignée à
 * l'origine. La tête (hache, marteau, masse) ou la garde (épée, dague) est repérée comme la
 * tranche la plus large le long de l'axe.
 */
function orientWeapon(root) {
  const pts = [];
  root.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute("POSITION");
      const v = [];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        pts.push([0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r]));
      }
    }
  });
  if (!pts.length) return;
  const min = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])));
  const max = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
  const ext = max.map((x, k) => x - min[k]);
  const axis = ext.indexOf(Math.max(...ext));
  const others = [0, 1, 2].filter((k) => k !== axis);
  const center = others.map((k) => (min[k] + max[k]) / 2);
  const bins = new Array(24).fill(0);
  for (const p of pts) {
    const t = Math.min(23, Math.floor(((p[axis] - min[axis]) / ext[axis]) * 24));
    const r = Math.hypot(p[others[0]] - center[0], p[others[1]] - center[1]);
    bins[t] = Math.max(bins[t], r);
  }
  const widest = (bins.indexOf(Math.max(...bins)) + 0.5) / 24;
  // Tête près d'un bout : poignée à 15 % de l'autre bout. Garde : poignée entre le bout et la garde.
  const fromA = widest < 0.5;
  const m = fromA ? widest : 1 - widest;
  const gripFromHeavyEnd = m < 0.25 ? 0.85 : m * 0.45;
  const gripT = fromA ? gripFromHeavyEnd : 1 - gripFromHeavyEnd;
  // Sens : de la poignée vers la partie large (tête) ou vers la pointe (épée).
  const towardHeavy = m < 0.25;
  const dir = (fromA ? -1 : 1) * (towardHeavy ? -1 : 1);
  const grip = [0, 1, 2].map((k) => (k === axis ? min[axis] + gripT * ext[axis] : (min[k] + max[k]) / 2));
  // Rotation qui envoie l'axe long sur +x (dir) : base orthonormée.
  const ex = [0, 0, 0]; ex[axis] = dir;
  const ey = [0, 0, 0]; ey[others[0]] = 1;
  const ez = [ex[1] * ey[2] - ex[2] * ey[1], ex[2] * ey[0] - ex[0] * ey[2], ex[0] * ey[1] - ex[1] * ey[0]];
  // Matrice monde → arme : lignes = ex, ey, ez ; translation = −R·grip.
  const R = [ex, ey, ez];
  const t = R.map((row) => -(row[0] * grip[0] + row[1] * grip[1] + row[2] * grip[2]));
  const mat = [R[0][0], R[1][0], R[2][0], 0, R[0][1], R[1][1], R[2][1], 0, R[0][2], R[1][2], R[2][2], 0, t[0], t[1], t[2], 1];
  // Les enfants gardent leur transformation ; la correction s'applique au nœud racine.
  root.setMatrix(mat);
  console.log(`  ${root.getName()} : axe ${"xyz"[axis]}, garde/tête à ${widest.toFixed(2)}, poignée à ${gripT.toFixed(2)}`);
}

const tmp = await mkdtemp(join(tmpdir(), "polyhaven-"));
for (const [set, ids] of Object.entries(SETS)) {
  const out = new Document();
  const scene = out.createScene(set);
  for (const id of ids) {
    try {
      const files = JSON.parse((await get(`${API}/files/${id}`)).toString());
      const g = files.gltf?.["1k"]?.gltf;
      if (!g) {
        console.warn(`${id} : pas de glTF 1k`);
        continue;
      }
      const dir = join(tmp, id);
      await mkdir(dir, { recursive: true });
      const main = join(dir, `${id}.gltf`);
      await writeFile(main, await get(g.url));
      for (const [path, inc] of Object.entries(g.include ?? {})) {
        const file = join(dir, path);
        await mkdir(dirname(file), { recursive: true });
        await writeFile(file, await get(inc.url));
      }
      const src = await io.read(main);
      const before = new Set(out.getRoot().listScenes());
      mergeDocuments(out, src);
      const group = out.createNode(id);
      scene.addChild(group);
      for (const s of out.getRoot().listScenes()) {
        if (before.has(s) || s === scene) continue;
        for (const child of s.listChildren()) group.addChild(child);
        s.dispose();
      }
      console.log(`+ ${id}`);
    } catch (e) {
      console.error(`échec ${id} : ${e.message}`);
    }
  }
  if (set === "weapons") for (const root of scene.listChildren()) orientWeapon(root);
  const buffer = out.getRoot().listBuffers()[0];
  for (const a of out.getRoot().listAccessors()) a.setBuffer(buffer);
  for (const b of out.getRoot().listBuffers()) if (b !== buffer) b.dispose();
  await out.transform(
    dedup(),
    weld(),
    // Décor vu de loin : maillages fortement simplifiés (les armes gardent leur détail).
    simplify({ simplifier: MeshoptSimplifier, ratio: set === "decor" ? 0.08 : 0.5, error: set === "decor" ? 0.003 : 0.0005 }),
    prune(),
    unpartition(),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [512, 512], quality: 85 }),
    meshopt({ encoder: MeshoptEncoder, level: "medium" }),
  );
  const file = join(OUT, `${set}.glb`);
  await writeFile(file, await io.writeBinary(out));
  console.log(`${set}.glb : ${((await stat(file)).size / 1024).toFixed(0)} Ko`);
}
await rm(tmp, { recursive: true, force: true });
