// Réglages de qualité graphique : bas, moyen, haut. Choisis automatiquement d'après les
// images par seconde mesurées, ou forcés avec ?quality=low|medium|high dans l'adresse.

export type QualityLevel = "low" | "medium" | "high";

export interface QualitySettings {
  level: QualityLevel;
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  /** Nombre maximal de particules par réserve. */
  particles: number;
  /** Distorsion de l'image (ondes de choc). */
  distortion: boolean;
  /** Lumières ponctuelles pour les éclairs des sorts. */
  flashLights: boolean;
  /** Décor autour du plateau : nombre d'éléments (arbres, rochers…). */
  scenery: number;
}

const DPR = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;

export const QUALITY_PRESETS: Record<QualityLevel, QualitySettings> = {
  low: { level: "low", pixelRatio: Math.min(DPR, 1) * 0.8, shadows: false, shadowMapSize: 512, bloom: false, particles: 2048, distortion: false, flashLights: false, scenery: 0.4 },
  medium: { level: "medium", pixelRatio: Math.min(DPR, 1.25), shadows: true, shadowMapSize: 1024, bloom: true, particles: 4096, distortion: false, flashLights: true, scenery: 0.75 },
  high: { level: "high", pixelRatio: Math.min(DPR, 2), shadows: true, shadowMapSize: 2048, bloom: true, particles: 8192, distortion: true, flashLights: true, scenery: 1 },
};

/** Niveau imposé par l'adresse (?quality=), ou null pour le réglage automatique. */
export function forcedQuality(): QualityLevel | null {
  const q = new URLSearchParams(location.search).get("quality");
  return q === "low" || q === "medium" || q === "high" ? q : null;
}

/**
 * Mesure les images par seconde et baisse la qualité si elles restent sous le seuil.
 * On ne remonte qu'une fois, et seulement si la marge est large, pour éviter les va-et-vient.
 */
export class QualityGovernor {
  level: QualityLevel;
  readonly forced: boolean;
  fps = 60;
  private frames = 0;
  private windowStart = 0;
  private lowWindows = 0;
  private highWindows = 0;
  private raisedOnce = false;

  constructor(private readonly onChange: (level: QualityLevel) => void) {
    const forced = forcedQuality();
    this.forced = forced !== null;
    // Écran tactile ou petit écran : on part de « moyen » ; sinon « haut ».
    const mobile = matchMedia("(pointer: coarse)").matches || window.innerWidth < 900;
    this.level = forced ?? (mobile ? "medium" : "high");
  }

  /** À appeler à chaque image ; `now` en ms. Les onglets en arrière-plan sont ignorés. */
  tick(now: number): void {
    if (!this.windowStart) this.windowStart = now;
    this.frames++;
    const elapsed = now - this.windowStart;
    if (elapsed < 2000) return;
    this.fps = (this.frames * 1000) / elapsed;
    this.frames = 0;
    this.windowStart = now;
    if (this.forced || document.hidden || elapsed > 4000) return;
    if (this.fps < 45) {
      this.lowWindows++;
      this.highWindows = 0;
    } else if (this.fps > 58) {
      this.highWindows++;
      this.lowWindows = 0;
    } else {
      this.lowWindows = 0;
      this.highWindows = 0;
    }
    if (this.lowWindows >= 2 && this.level !== "low") {
      this.set(this.level === "high" ? "medium" : "low");
    } else if (this.highWindows >= 8 && this.level === "low" && !this.raisedOnce) {
      this.raisedOnce = true;
      this.set("medium");
    }
  }

  private set(level: QualityLevel): void {
    this.level = level;
    this.lowWindows = 0;
    this.highWindows = 0;
    console.info(`[autochess] quality → ${level} (${this.fps.toFixed(0)} fps)`);
    this.onChange(level);
  }
}
