// Outil de développement (?portraits) : rend un portrait en buste de chaque personnage à
// partir de son modèle 3D (fond transparent) et l'envoie au serveur local
// scripts/portrait-server.mjs, qui l'enregistre pour les cartes de la boutique.
// ?portraits=zeus,thor pour une sélection.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { MONSTERS, UNITS } from "@autochess/sim";
import { unitColor, unitDef } from "../data/content";
import { assets, CORE_ASSETS } from "./assets";
import { Character } from "./characters/Character";

const SIZE = 512;

export function Portraits() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Préparation…");

  useEffect(() => {
    let stop = false;
    const params = new URLSearchParams(location.search);
    const only = params.get("portraits")?.split(",").filter(Boolean);
    const ids = only?.length ? only : [...UNITS, ...MONSTERS].map((u) => u.id);

    const renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = false;
    host.current!.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const key = new THREE.DirectionalLight("#fff3e0", 3);
    key.position.set(2, 3, 4);
    const rim = new THREE.DirectionalLight("#ffffff", 2.5);
    rim.position.set(-3, 2, -3);
    const fill = new THREE.HemisphereLight("#cfe0ff", "#3a3040", 0.8);
    scene.add(key, rim, fill);
    new HDRLoader().load(`${import.meta.env.BASE_URL}assets/sky/day.hdr`, (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = hdr;
      scene.environmentIntensity = 0.6;
    });
    const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 50);

    const run = async () => {
      await renderer.init();
      await Promise.all(CORE_ASSETS.map((p) => assets.load(p)));
      for (const [i, id] of ids.entries()) {
        if (stop) return;
        setStatus(`${i + 1}/${ids.length} : ${unitDef(id)?.name ?? id}`);
        const c = new Character(id, 1, "ally", null);
        await c.ready;
        c.setInCombat(true);
        c.setPortraitMode();
        scene.add(c.root);
        // Pose stable : un peu d'animation d'attente, de trois quarts vers la caméra.
        const tall = c.humanoid;
        c.faceDirection(tall ? 0.4 : 0.75);
        for (let f = 0; f < 45; f++) c.update(1 / 30);
        const box = c.bodyBox();
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        // Humanoïdes : tête et buste ; créatures : corps entier.
        const focusY = tall ? box.max.y - size.y * 0.21 : center.y;
        const span = tall ? size.y * 0.52 : Math.max(size.x, size.y, size.z) * 1.0;
        const dist = span / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
        camera.position.set(center.x + dist * 0.12, focusY + span * 0.08, center.z + dist);
        camera.lookAt(center.x, focusY, center.z);
        rim.color.set(unitColor(unitDef(id)));
        await renderer.renderAsync(scene, camera);
        const blob = await new Promise<Blob | null>((res) => renderer.domElement.toBlob(res, "image/png"));
        if (blob) await fetch(`http://localhost:5199/?id=${id}`, { method: "POST", body: blob }).catch(() => setStatus("Serveur de portraits injoignable"));
        scene.remove(c.root);
        c.dispose();
      }
      await fetch("http://localhost:5199/done", { method: "POST" }).catch(() => undefined);
      setStatus(`Terminé : ${ids.length} portraits`);
    };
    void run();
    return () => {
      stop = true;
      renderer.dispose();
    };
  }, []);

  return (
    <div style={{ padding: 16, display: "flex", gap: 16, alignItems: "flex-start", color: "#ddd" }}>
      <div ref={host} style={{ background: "repeating-conic-gradient(#333 0 25%, #444 0 50%) 0 0 / 24px 24px" }} />
      <div>{status}</div>
    </div>
  );
}
