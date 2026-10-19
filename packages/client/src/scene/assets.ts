// Chargement des modèles 3D (glTF compressés meshopt) à la demande, avec suivi de la
// progression pour l'écran de chargement. Chaque fichier n'est téléchargé qu'une fois.
import type * as THREE from "three/webgpu";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const BASE = `${import.meta.env.BASE_URL}assets/`;

/** Fichiers nécessaires avant d'afficher le plateau. */
export const CORE_ASSETS = ["anims/humanoid.glb", "props.glb", "env.glb"];

/** Tailles approximatives (Ko), pour une barre de progression régulière avant les en-têtes HTTP. */
const SIZE_HINT: Record<string, number> = { "anims/humanoid.glb": 1290, "props.glb": 583, "env.glb": 693 };

type Listener = (loaded: number, total: number) => void;

class AssetStore {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<GLTF>>();
  private readonly ready = new Map<string, GLTF>();
  private readonly progress = new Map<string, { loaded: number; total: number }>();
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  load(path: string): Promise<GLTF> {
    let p = this.cache.get(path);
    if (!p) {
      this.progress.set(path, { loaded: 0, total: (SIZE_HINT[path] ?? 200) * 1024 });
      p = this.loader
        .loadAsync(BASE + path, (e) => {
          this.progress.set(path, { loaded: e.loaded, total: e.total || this.progress.get(path)!.total });
          this.emit();
        })
        .then((gltf) => {
          const pr = this.progress.get(path)!;
          pr.loaded = pr.total;
          this.ready.set(path, gltf);
          this.emit();
          return gltf;
        });
      this.cache.set(path, p);
    }
    return p;
  }

  /** Le fichier s'il est déjà chargé (sans attendre). */
  get(path: string): GLTF | undefined {
    return this.ready.get(path);
  }

  onProgress(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    let loaded = 0;
    let total = 0;
    for (const p of this.progress.values()) {
      loaded += p.loaded;
      total += p.total;
    }
    for (const l of this.listeners) l(loaded, total);
  }
}

export const assets = new AssetStore();

/** Nœud racine nommé d'un fichier fusionné (props.glb, env.glb). */
export function namedNode(gltf: GLTF, name: string): THREE.Object3D | undefined {
  return gltf.scene.children.find((c) => c.name === name);
}
