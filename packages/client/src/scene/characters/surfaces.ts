// Matières réalistes des accessoires : relief (normales) et rugosité des textures PBR de
// Poly Haven (métal ciselé, cuir, velours, lin, laine, marbre pour l'os et la corne), plus une
// texture de plume dessinée en code (rachis, barbes, transparence). La couleur reste celle de
// l'accessoire : seules la matière et la lumière changent.
import * as THREE from "three/webgpu";

export type Surface = "metal" | "leather" | "velvet" | "linen" | "fur" | "bone" | "plain";

const BASE = `${import.meta.env.BASE_URL}assets/pbr/`;
const loader = new THREE.TextureLoader();

/** Nom du jeu de textures et répétition sur les UV des primitives. */
const SETS: Record<Exclude<Surface, "plain">, { name: string; repeat: number; normalScale: number; roughness: number }> = {
  metal: { name: "metal", repeat: 1.5, normalScale: 0.6, roughness: 1 },
  leather: { name: "leather", repeat: 2, normalScale: 1.2, roughness: 1 },
  velvet: { name: "velvet", repeat: 2, normalScale: 1, roughness: 1 },
  linen: { name: "linen", repeat: 3, normalScale: 1, roughness: 1 },
  fur: { name: "wool", repeat: 2, normalScale: 1.6, roughness: 1 },
  bone: { name: "marble", repeat: 1, normalScale: 0.5, roughness: 0.8 },
};

const textures = new Map<string, THREE.Texture>();
function tex(name: string, kind: "nor" | "arm", repeat: number): THREE.Texture {
  const key = `${name}|${kind}|${repeat}`;
  let t = textures.get(key);
  if (!t) {
    t = loader.load(`${BASE}${name}_${kind}.webp`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    textures.set(key, t);
  }
  return t;
}

const surfaced = new Map<string, THREE.Material>();

/** Copie du matériau avec le relief et la rugosité de la matière choisie (mise en cache). */
export function withSurface(m: THREE.MeshStandardMaterial, surface: Surface): THREE.MeshStandardMaterial {
  if (surface === "plain") return m;
  const key = `${m.uuid}|${surface}`;
  let out = surfaced.get(key) as THREE.MeshStandardMaterial | undefined;
  if (!out) {
    const set = SETS[surface];
    out = m.clone();
    out.normalMap = tex(set.name, "nor", set.repeat);
    out.normalScale.setScalar(set.normalScale);
    // Canal vert de la carte ARM = rugosité.
    out.roughnessMap = tex(set.name, "arm", set.repeat);
    out.roughness = surface === "metal" ? 0.9 : set.roughness;
    surfaced.set(key, out);
  }
  return out;
}

let featherMap: THREE.CanvasTexture | null = null;

/** Texture de plume : rachis central, barbes obliques, bord effiloché (canal alpha). */
export function featherTexture(): THREE.CanvasTexture {
  if (featherMap) return featherMap;
  const w = 64;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  // Vexille : forme effilée, plus large au tiers supérieur.
  for (let y = 0; y < h; y++) {
    const k = y / h;
    const half = (w / 2 - 3) * Math.sin(Math.PI * Math.pow(1 - k, 0.8)) * (k > 0.92 ? (1 - k) / 0.08 : 1);
    for (let side = -1; side <= 1; side += 2) {
      // Barbes : traits obliques avec de petites variations de luminosité.
      const shade = 200 + Math.round(Math.sin(y * 1.7 + side) * 25 + Math.random() * 25);
      ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.85 + Math.random() * 0.15})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w / 2, y);
      const reach = half * (0.85 + Math.random() * 0.15);
      ctx.lineTo(w / 2 + side * reach, y - reach * 0.35);
      ctx.stroke();
    }
  }
  // Rachis.
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "rgba(255,255,255,0.95)");
  grad.addColorStop(1, "rgba(220,220,220,0.95)");
  ctx.fillStyle = grad;
  ctx.fillRect(w / 2 - 1.5, 0, 3, h);
  featherMap = new THREE.CanvasTexture(canvas);
  featherMap.colorSpace = THREE.SRGBColorSpace;
  featherMap.anisotropy = 4;
  return featherMap;
}
