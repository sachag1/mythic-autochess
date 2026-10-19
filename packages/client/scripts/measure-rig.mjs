// Mesure un personnage glTF : position monde des os principaux et boîte englobante des maillages.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { getBounds } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const r = (v) => v.map((x) => x.toFixed(2)).join(",");
for (const n of doc.getRoot().listNodes()) {
  if (/^(root|hips|chest|head|handslot\.[lr]|Head|Neck|Spine|Body|Hips|Tail|Root)$/i.test(n.getName()) || /head|tail|neck/i.test(n.getName()) && !n.getMesh()) {
    console.log(`bone ${n.getName()} world ${r(n.getWorldTranslation())} rot ${r(n.getWorldRotation())}`);
  }
}
for (const n of doc.getRoot().listNodes()) if (n.getMesh()) { const b = getBounds(n); console.log(`mesh ${n.getName()} min ${r(b.min)} max ${r(b.max)}`); }
const sb = getBounds(doc.getRoot().listScenes()[0]);
console.log(`scene min ${r(sb.min)} max ${r(sb.max)}`);
