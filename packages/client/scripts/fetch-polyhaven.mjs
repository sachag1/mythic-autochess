// Télécharge les textures PBR et les ciels HDRI de Poly Haven (CC0, https://polyhaven.com)
// utilisés par l'arène, et les convertit pour le web (WebP).
// Usage : node scripts/fetch-polyhaven.mjs
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets");
const API = "https://api.polyhaven.com";

/** Textures : identifiant Poly Haven → nom local. */
const TEXTURES = {
  marble_01: "marble",
  large_sandstone_blocks: "sandstone",
  monastery_stone_floor: "floor",
  coast_sand_01: "sand",
  granite_tile: "granite",
  // Accessoires des personnages (couronnes, fourrures, coiffes…), en 512 px.
  metal_plate: "metal",
  brown_leather: "leather",
  velour_velvet: "velvet",
  rough_linen: "linen",
  wool_boucle: "wool",
};
const SMALL = new Set(["metal", "leather", "velvet", "linen", "wool"]);
/** Ciels : lumière (HDR 1k) + fond (JPG retouché, réduit). */
const SKIES = { kloofendal_48d_partly_cloudy_puresky: "day", belfast_sunset_puresky: "sunset" };

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

await mkdir(join(OUT, "pbr"), { recursive: true });
await mkdir(join(OUT, "sky"), { recursive: true });

for (const [id, name] of Object.entries(TEXTURES)) {
  const files = JSON.parse((await get(`${API}/files/${id}`)).toString());
  const maps = { diff: files.Diffuse, nor: files.nor_gl, arm: files.arm };
  for (const [kind, entry] of Object.entries(maps)) {
    const url = entry?.["1k"]?.jpg?.url ?? entry?.["1k"]?.png?.url;
    if (!url) {
      console.warn(`${id} : pas de carte ${kind}`);
      continue;
    }
    const img = await get(url);
    const out = join(OUT, "pbr", `${name}_${kind}.webp`);
    // Normales et ARM sans perte de précision visible ; couleur un peu plus compressée.
    const size = SMALL.has(name) ? 512 : 1024;
    await sharp(img).resize(size, size).webp({ quality: kind === "diff" ? 82 : 90 }).toFile(out);
    console.log(`pbr/${name}_${kind}.webp`);
  }
}

for (const [id, name] of Object.entries(SKIES)) {
  const files = JSON.parse((await get(`${API}/files/${id}`)).toString());
  await writeFile(join(OUT, "sky", `${name}.hdr`), await get(files.hdri["1k"].hdr.url));
  const jpg = await get(files.tonemapped.url);
  await sharp(jpg).resize(4096, 2048, { fit: "fill" }).webp({ quality: 80 }).toFile(join(OUT, "sky", `${name}.webp`));
  console.log(`sky/${name}.hdr, sky/${name}.webp`);
}
