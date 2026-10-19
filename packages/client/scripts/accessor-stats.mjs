// Répartition de la taille d'un fichier glTF par usage des accesseurs (débogage de l'optimisation).
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const stats = {};
for (const a of doc.getRoot().listAccessors()) {
  const parents = a.listParents().map((p) => p.propertyType).filter((t) => t !== "Root");
  const key = [...new Set(parents)].join("+") || "orphan";
  stats[key] = (stats[key] ?? 0) + a.getByteLength();
}
console.log(Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, `${(v / 1024).toFixed(0)} Ko`])), doc.getRoot().listAnimations().length, doc.getRoot().listExtensionsUsed().map((e) => e.extensionName));
