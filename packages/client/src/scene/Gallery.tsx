// Galerie de développement (?gallery) : tous les personnages en grille, pour vérifier
// modèles, couleurs, accessoires et animations. ?gallery=zeus,thor pour une sélection ;
// les touches 1 à 8 jouent attente, course, attaque, sort, coup, étourdissement, mort, victoire.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { unitDef } from "../data/content";
import { assets, CORE_ASSETS } from "./assets";
import { CHARACTERS } from "./characters/catalog";
import { Character } from "./characters/Character";
import { VfxSystem } from "./vfx/VfxSystem";
import { QUALITY_PRESETS } from "./quality";

export function Gallery() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Chargement…");

  useEffect(() => {
    const el = host.current!;
    const params = new URLSearchParams(location.search);
    const only = params.get("gallery")?.split(",").filter(Boolean);
    const star = Number(params.get("star") ?? 1);
    const ids = only?.length ? only : Object.keys(CHARACTERS);

    const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL: params.has("webgl") });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#1b1f2c");
    scene.add(new THREE.HemisphereLight("#cfe0ff", "#3a3040", 1.4));
    const sun = new THREE.DirectionalLight("#fff2dd", 2.6);
    sun.position.set(-8, 14, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, far: 60 });
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: "#2a3040", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 300);
    const cols = Math.ceil(Math.sqrt(ids.length * 1.6));
    const spacing = 2.4;
    const width = (cols - 1) * spacing;
    const rows = Math.ceil(ids.length / cols);
    const controls = new OrbitControls(camera, renderer.domElement);
    if (ids.length === 1) {
      // Gros plan de trois quarts ; ?view=back pour le dos.
      const back = params.get("view") === "back";
      camera.position.set(back ? -1.2 : 1.1, 1.5, back ? -3.4 : 3.6);
      controls.target.set(0, 0.95, 0);
    } else {
      camera.position.set(0, 2.6 + rows * 1.1, 4.2 + rows * 1.9 + cols * 0.5);
      controls.target.set(0, 0.8, -((rows - 1) * spacing) / 2 + 1);
    }
    controls.update();

    const vfx = new VfxSystem(QUALITY_PRESETS.high);
    scene.add(vfx.root);
    const chars: Character[] = [];
    const labels: { el: HTMLDivElement; c: Character }[] = [];
    const overlay = document.createElement("div");
    overlay.className = "unit-overlay";
    el.appendChild(overlay);

    void Promise.all(CORE_ASSETS.map((p) => assets.load(p))).then(() => {
      ids.forEach((id, i) => {
        const c = new Character(id, star, i % 2 ? "enemy" : "ally", vfx);
        c.root.position.set((i % cols) * spacing - width / 2, 0, -Math.floor(i / cols) * spacing);
        scene.add(c.root);
        chars.push(c);
        const label = document.createElement("div");
        label.className = "gallery-label";
        label.textContent = unitDef(id)?.name ?? id;
        overlay.appendChild(label);
        labels.push({ el: label, c });
      });
      void Promise.all(chars.map((c) => c.ready)).then(() => setStatus(`${chars.length} personnages`));
    });

    const onKey = (e: KeyboardEvent) => {
      for (const c of chars) {
        if (e.key === "1") c.setInCombat(false);
        if (e.key === "2") c.setMoving(true);
        if (e.key === "3") (c.setMoving(false), c.attack());
        if (e.key === "4") (c.setMoving(false), c.cast());
        if (e.key === "5") c.hit();
        if (e.key === "6") c.stun(true, Math.random() < 0.5 ? "stone" : "stars");
        if (e.key === "7") c.die();
        if (e.key === "8") c.victory(true);
        if (e.key === "0") c.stun(false);
      }
    };
    window.addEventListener("keydown", onKey);

    const resize = () => {
      renderer.setSize(el.clientWidth, el.clientHeight, false);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let last = performance.now();
    const v = new THREE.Vector3();
    void renderer.init().then(() =>
      renderer.setAnimationLoop(() => {
        const now = performance.now();
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        for (const c of chars) c.update(dt);
        vfx.update();
        renderer.render(scene, camera);
        for (const { el: l, c } of labels) {
          v.set(c.root.position.x, c.height + 0.35, c.root.position.z).project(camera);
          l.style.transform = `translate(${((v.x + 1) / 2) * el.clientWidth}px, ${((1 - v.y) / 2) * el.clientHeight}px) translate(-50%, -100%)`;
        }
      }),
    );
    Object.assign(window, { __gallery: { chars, scene, camera, controls, vfx, renderer } });
    return () => {
      window.removeEventListener("keydown", onKey);
      ro.disconnect();
      renderer.setAnimationLoop(null);
      renderer.dispose();
      el.replaceChildren();
    };
  }, []);

  return (
    <div className="gallery">
      <div ref={host} className="gallery-host" />
      <div className="gallery-status">{status} · touches 1–8 : attente, course, attaque, sort, coup, étourdissement, mort, victoire</div>
    </div>
  );
}
