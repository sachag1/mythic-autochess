// Triangles et taille des textures par nœud racine d'un fichier fusionné (diagnostic).
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const doc = await io.read(process.argv[2]);
for (const root of doc.getRoot().listScenes()[0].listChildren()) {
  let tris = 0;
  const tex = new Set();
  root.traverse((n) => {
    const m = n.getMesh();
    if (!m) return;
    for (const p of m.listPrimitives()) {
      tris += (p.getIndices()?.getCount() ?? 0) / 3;
      const mat = p.getMaterial();
      for (const t of [mat?.getBaseColorTexture(), mat?.getNormalTexture(), mat?.getMetallicRoughnessTexture(), mat?.getOcclusionTexture()]) if (t) tex.add(t);
    }
  });
  const kb = [...tex].reduce((s, t) => s + (t.getImage()?.byteLength ?? 0), 0) / 1024;
  console.log(root.getName().padEnd(26), String(Math.round(tris)).padStart(8), "tris", kb.toFixed(0).padStart(6), "Ko tex");
}
