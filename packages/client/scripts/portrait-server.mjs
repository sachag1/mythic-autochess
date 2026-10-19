// Reçoit les portraits rendus par la page « ?portraits » du client et les enregistre en WebP
// dans public/assets/portraits/<unité>.webp. Usage : node scripts/portrait-server.mjs
// puis ouvrir http://localhost:5173/?portraits ; Ctrl+C pour arrêter le serveur.
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "assets", "portraits");
await mkdir(OUT, { recursive: true });
let count = 0;

createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.end();
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "POST" && url.pathname === "/done") {
    console.log(`${count} portraits enregistrés`);
    res.end("ok");
    return;
  }
  const id = url.searchParams.get("id");
  if (req.method !== "POST" || !id || !/^[a-z0-9_]+$/.test(id)) {
    res.statusCode = 400;
    return res.end("bad request");
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  await sharp(Buffer.concat(chunks)).webp({ quality: 86, alphaQuality: 90 }).toFile(join(OUT, `${id}.webp`));
  count++;
  console.log(`portraits/${id}.webp`);
  res.end("ok");
}).listen(5199, () => console.log("Serveur de portraits sur http://localhost:5199"));
