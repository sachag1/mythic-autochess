// Recoloration des atlas de palette KayKit : chaque case de l'atlas est un dégradé d'une
// couleur. On remplace les teintes du tissu principal, du tissu secondaire, de la peau et
// du métal par celles du personnage, en gardant la luminosité du dégradé.
import * as THREE from "three/webgpu";

export interface Palette {
  primary?: string;
  secondary?: string;
  skin?: string;
  metal?: string;
  /** Couleur des cheveux et du cuir (bruns de l'atlas). */
  leather?: string;
}

/** Teintes (degrés) du tissu principal et secondaire de chaque corps KayKit. */
const SOURCE_HUES: Record<string, { primary: number[]; secondary: number[] }> = {
  knight: { primary: [357], secondary: [45] },
  barbarian: { primary: [205], secondary: [40] },
  mage: { primary: [245, 330], secondary: [185, 40] },
  rogue: { primary: [160], secondary: [80] },
  rogue_hooded: { primary: [160], secondary: [80] },
  skeleton_mage: { primary: [235], secondary: [350] },
  skeleton_minion: { primary: [235], secondary: [350] },
  skeleton_rogue: { primary: [235], secondary: [350] },
  skeleton_warrior: { primary: [235], secondary: [350] },
};

const cache = new Map<string, THREE.Texture>();

function hueDist(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

/** Texture recolorée (mise en cache par corps et palette). */
export function recolorAtlas(body: string, source: THREE.Texture, palette: Palette): THREE.Texture {
  const key = `${body}|${palette.primary}|${palette.secondary}|${palette.skin}|${palette.metal}|${palette.leather}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const image = source.image as CanvasImageSource & { width: number; height: number };
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = img.data;
  const hues = SOURCE_HUES[body] ?? { primary: [], secondary: [] };
  // Couleurs cibles en sRGB, comme les pixels de l'atlas.
  const target = (c?: string) => {
    if (!c) return null;
    const rgb = { r: 0, g: 0, b: 0 };
    new THREE.Color(c).getRGB(rgb, THREE.SRGBColorSpace);
    return rgbToHsv(rgb.r, rgb.g, rgb.b);
  };
  const tp = target(palette.primary);
  const ts = target(palette.secondary);
  const tk = target(palette.skin);
  const tm = target(palette.metal);
  const tl = target(palette.leather);
  const out = new THREE.Color();
  for (let i = 0; i < data.length; i += 4) {
    const [h, s, v] = rgbToHsv(data[i]! / 255, data[i + 1]! / 255, data[i + 2]! / 255);
    let t: [number, number, number] | null = null;
    let ref = 0.9;
    const isSkin = h >= 12 && h <= 38 && s > 0.18 && s < 0.5 && v > 0.82;
    if (isSkin) {
      if (tk) (t = tk), (ref = 0.97);
    } else if (s > 0.3 && tp && hues.primary.some((x) => hueDist(h, x) < 22)) t = tp;
    else if (s > 0.3 && ts && hues.secondary.some((x) => hueDist(h, x) < 18)) t = ts;
    else if (tl && h >= 8 && h <= 32 && s > 0.3 && v > 0.3 && v <= 0.82) (t = tl), (ref = 0.7);
    else if (tm && s < 0.16 && v > 0.25 && v < 0.75) (t = tm), (ref = 0.6);
    if (!t) continue;
    const vv = Math.min(1, t[2] * (v / ref));
    hsvToRgb(t[0], t[1], vv, out);
    data[i] = out.r * 255;
    data[i + 1] = out.g * 255;
    data[i + 2] = out.b * 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = source.flipY;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, tex);
  return tex;
}

function hsvToRgb(h: number, s: number, v: number, out: THREE.Color): void {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  out.setRGB(r + m, g + m, b + m);
}
