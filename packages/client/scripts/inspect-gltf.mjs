// Affiche le contenu d'un fichier glTF/GLB : maillages, matériaux, textures, os, animations.
// Usage : node scripts/inspect-gltf.mjs <fichier> [--bones]
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const [file, ...flags] = process.argv.slice(2);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(file);
const root = doc.getRoot();
const tris = root.listMeshes().reduce((n, m) => n + m.listPrimitives().reduce((k, p) => k + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
console.log(`meshes ${root.listMeshes().length} (${Math.round(tris)} tris), materials ${root.listMaterials().map((m) => m.getName()).join(",")}`);
console.log(`textures ${root.listTextures().map((t) => `${t.getName() || t.getURI()} ${t.getMimeType()} ${t.getImage()?.byteLength}`).join(" | ")}`);
console.log(`skins ${root.listSkins().length} joints ${root.listSkins()[0]?.listJoints().length ?? 0}`);
console.log(`nodes: ${root.listNodes().filter((n) => n.getMesh()).map((n) => n.getName()).join(", ")}`);
if (flags.includes("--bones")) console.log(`bones: ${root.listSkins()[0]?.listJoints().map((j) => j.getName()).join(", ")}`);
console.log(`animations (${root.listAnimations().length}): ${root.listAnimations().map((a) => a.getName()).join(", ")}`);
