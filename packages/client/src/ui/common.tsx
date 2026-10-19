import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { COST_COLORS, itemDef, itemStyle, traitDef, unitColor, unitDef } from "../data/content";

/** Secondes restantes avant `endsAt` (horodatage serveur), rafraîchies 4 fois par seconde. */
export function useCountdown(endsAt: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function Timer({ endsAt, className = "" }: { endsAt: number; className?: string }) {
  const s = useCountdown(endsAt);
  return <span className={`timer ${s <= 5 ? "urgent" : ""} ${className}`}>{s}s</span>;
}

export function ItemChip({ id, size = 28, title = true }: { id: string; size?: number; title?: boolean }) {
  const s = itemStyle(id);
  const def = itemDef(id);
  const completed = Boolean(def?.components);
  const style: CSSProperties = { background: s.color, width: size, height: size, fontSize: size * 0.38 };
  return (
    <span className={`item-chip ${completed ? "completed" : ""}`} style={style} title={title && def ? `${def.name} — ${def.description}` : undefined}>
      {s.short}
    </span>
  );
}

export function TraitTag({ id }: { id: string }) {
  const t = traitDef(id);
  return (
    <span className={`trait-tag ${t?.kind ?? ""}`} title={t?.description}>
      {t?.name ?? id}
    </span>
  );
}

/** Portrait rendu depuis le modèle 3D (public/assets/portraits), sur un fond aux couleurs du panthéon. */
export function portraitUrl(defId: string): string {
  return `${import.meta.env.BASE_URL}assets/portraits/${defId}.webp`;
}

export function UnitPortrait({ defId, size = 40 }: { defId: string; size?: number }) {
  const def = unitDef(defId);
  const [broken, setBroken] = useState(false);
  const style: CSSProperties = {
    width: size,
    height: size,
    background: `radial-gradient(circle at 50% 35%, ${unitColor(def)}cc, #0e1018 75%)`,
    borderColor: COST_COLORS[def?.cost ?? 1],
    fontSize: size * 0.4,
  };
  return (
    <span className="unit-portrait" style={style}>
      {broken ? (def?.name ?? defId).slice(0, 1) : <img src={portraitUrl(defId)} alt="" draggable={false} onError={() => setBroken(true)} />}
    </span>
  );
}

export function Stars({ star }: { star: number }) {
  return <span className={`stars-inline star-${star}`}>{"★".repeat(star)}</span>;
}

export function Panel({ children, className = "", ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`panel ${className}`} {...rest}>
      {children}
    </div>
  );
}
