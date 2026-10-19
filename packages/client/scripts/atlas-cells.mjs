// Couleur moyenne de chaque case (128 px) d'un atlas de palette KayKit (pour la recoloration).
import sharp from "sharp";
const file = process.argv[2];
const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
const cell = info.width / 8;
for (let r = 0; r < info.height / cell; r++) {
  const row = [];
  for (let c = 0; c < 8; c++) {
    let R = 0, G = 0, B = 0, n = 0;
    for (let y = r * cell; y < (r + 1) * cell; y += 8) for (let x = c * cell; x < (c + 1) * cell; x += 8) {
      const i = (y * info.width + x) * info.channels; R += data[i]; G += data[i + 1]; B += data[i + 2]; n++;
    }
    row.push("#" + [R, G, B].map((v) => Math.round(v / n).toString(16).padStart(2, "0")).join(""));
  }
  console.log(r, row.join(" "));
}
