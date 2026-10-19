// Extrait les armes des variantes Mixamo « W/Prop » (épée et bouclier du paladin, épée de
// Maria, arc d'Erika) en objets statiques exprimés dans le repère de la main qui les tient,
// en mètres pour un personnage de 1,80 m : rattachés à la main de n'importe quel corps
// Mixamo, ils se placent comme dans l'animation d'origine.
// Usage : node scripts/extract-mixamo-props.mjs <dossier contenant props/*.fbx>
// Sortie : public/assets/mixamo/weapons.glb (exclu de git comme les autres fichiers Mixamo).
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, stat, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, mergeDocuments, meshopt, prune, textureCompress, unpartition } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";
import sharp from "sharp";

const SRC = process.argv[2];
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "mixamo");
const require = createRequire(import.meta.url);
const FBX2GLTF = join(dirname(require.resolve("fbx2gltf/package.json")), "bin", process.platform === "win32" ? "Windows_NT/FBX2glTF.exe" : process.platform === "darwin" ? "Darwin/FBX2glTF" : "Linux/FBX2glTF");

/**
 * Les noms de maillages sont décalés par FBX2glTF : on reconnaît les armes à l'os qui porte
 * leur poids (os d'accessoire de Mixamo, enfant de la main), ou à la main elle-même.
 */
const PROP_JOINTS = { Sword_joint: "mx_sword", Shield_joint: "mx_shield", Left_arch1: "mx_bow", arrow: "mx_arrow" };
const FILES = ["paladin_prop", "maria_prop", "erika_prop"];

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder, "meshopt.encoder": MeshoptEncoder });

// Matrices 4×4 en colonnes (convention glTF).
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const apply = (m, v, w) => [0, 1, 2].map((r) => m[r] * v[0] + m[4 + r] * v[1] + m[8 + r] * v[2] + m[12 + r] * w);
const scaleOf = (m) => Math.hypot(m[0], m[1], m[2]);

const tmp = await mkdtemp(join(tmpdir(), "mixprops-"));
const out = new Document();
const scene = out.createScene("weapons");

for (const file of FILES) {
  const fbx = join(SRC, "props", `${file}.fbx`);
  execFileSync(FBX2GLTF, ["--binary", "--input", fbx, "--output", join(tmp, file)], { stdio: "pipe" });
  const doc = await io.read(join(tmp, `${file}.glb`));
  const root = doc.getRoot();
  const top = root.listNodes().find((n) => n.getName().endsWith("HeadTop_End"));
  const height = top ? top.getWorldTranslation()[1] * 1.04 : 1.8;
  const keep = new Set();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    const skin = node.getSkin();
    if (!mesh || !skin) continue;
    const joints = skin.listJoints();
    const ibms = skin.getInverseBindMatrices();
    const prims = mesh.listPrimitives();
    // Os dominant.
    const totals = new Map();
    let verts = 0;
    for (const prim of prims) {
      const J = prim.getAttribute("JOINTS_0");
      const W = prim.getAttribute("WEIGHTS_0");
      if (!J || !W) continue;
      verts += J.getCount();
      const j = [], w = [];
      for (let i = 0; i < J.getCount(); i++) {
        J.getElement(i, j);
        W.getElement(i, w);
        for (let k = 0; k < 4; k++) if (w[k] > 0) totals.set(j[k], (totals.get(j[k]) ?? 0) + w[k]);
      }
    }
    const dominant = [...totals].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (dominant === undefined) continue;
    const jName = joints[dominant].getName().replace(/^mixamorig\d*:/, "");
    let name = PROP_JOINTS[jName];
    let hand = name ? joints[dominant].getParentNode() : null;
    if (!name && file === "maria_prop" && /Hand$/.test(jName) && verts < 4000) {
      name = "mx_blade";
      hand = joints[dominant];
    }
    if (!name || !hand) continue;
    const handIndex = joints.indexOf(hand);
    const ibm = [];
    if (handIndex >= 0) ibms.getElement(handIndex, ibm);
    else {
      // Main hors du squelette lié : inverse approchée de sa matrice monde (rotation + échelle uniforme).
      const w = hand.getWorldMatrix();
      const sc = scaleOf(w);
      const r = [w[0], w[4], w[8], 0, w[1], w[5], w[9], 0, w[2], w[6], w[10], 0, 0, 0, 0, 1].map((x, i) => (i % 4 < 3 && i < 12 ? x / (sc * sc) : x));
      const t = apply(r, [w[12], w[13], w[14]], 1).map((x) => -x);
      ibm.push(...r.slice(0, 12), t[0], t[1], t[2], 1);
    }
    const s = (scaleOf(hand.getWorldMatrix()) * 1.8) / height;
    for (const prim of prims) {
      const pos = prim.getAttribute("POSITION").clone();
      const v = [];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        pos.setElement(i, apply(ibm, v, 1).map((x) => x * s));
      }
      prim.setAttribute("POSITION", pos);
      const nor = prim.getAttribute("NORMAL");
      if (nor) {
        const n2 = nor.clone();
        for (let i = 0; i < n2.getCount(); i++) {
          n2.getElement(i, v);
          const r = apply(ibm, v, 0);
          const l = Math.hypot(...r) || 1;
          n2.setElement(i, r.map((x) => x / l));
        }
        prim.setAttribute("NORMAL", n2);
      }
      prim.setAttribute("JOINTS_0", null);
      prim.setAttribute("WEIGHTS_0", null);
    }
    console.log(`${name} : os ${jName}, main ${hand.getName()}, échelle ${s.toFixed(4)}`);
    node.setSkin(null);
    node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    node.setName(name);
    keep.add(node);
  }
  // Ne garder que les objets extraits, à la racine de la scène.
  const sceneDoc = root.listScenes()[0];
  for (const child of [...sceneDoc.listChildren()]) sceneDoc.removeChild(child);
  for (const n of keep) {
    n.getParentNode()?.removeChild(n);
    sceneDoc.addChild(n);
  }
  for (const a of root.listAnimations()) a.dispose();
  for (const s of root.listSkins()) s.dispose();
  for (const n of root.listNodes()) if (!keep.has(n)) n.dispose();
  await doc.transform(prune());
  const before = new Set(out.getRoot().listScenes());
  mergeDocuments(out, doc);
  for (const sc of out.getRoot().listScenes()) {
    if (before.has(sc) || sc === scene) continue;
    for (const child of sc.listChildren()) scene.addChild(child);
    sc.dispose();
  }
}

const buffer = out.getRoot().listBuffers()[0];
for (const a of out.getRoot().listAccessors()) a.setBuffer(buffer);
for (const b of out.getRoot().listBuffers()) if (b !== buffer) b.dispose();
await out.transform(dedup(), prune(), unpartition(), textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 85 }), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
await mkdir(OUT, { recursive: true });
const file = join(OUT, "weapons.glb");
await writeFile(file, await io.writeBinary(out));
console.log(`mixamo/weapons.glb : ${((await stat(file)).size / 1024).toFixed(0)} Ko (${basename(file)})`);
await rm(tmp, { recursive: true, force: true });
