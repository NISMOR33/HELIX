import { useEffect, useRef, useState } from "react";
import { ImagePlus, SlidersHorizontal, X, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { urlImage } from "@/lib/images";
import type { ZoneRetouche } from "@/lib/retouche";

export function RetoucheControls({ source, photo, zone, onZone, intensite, onIntensite, onFermer, onAjouterFichiers }: {
  onAjouterFichiers?: (f: File[]) => void;
  source?: string; photo?: string; zone?: ZoneRetouche; onZone: (v?: ZoneRetouche) => void;
  intensite: number; onIntensite: (v: number) => void; onFermer: () => void;
}) {
  const [url, setUrl] = useState<string>();
  const fichier = useRef<HTMLInputElement>(null);
  const debut = useRef<{ x: number; y: number }>();
  useEffect(() => {
    let vivant = true, adresse: string | null = null;
    setUrl(photo);
    if (!photo && source) void urlImage(source).then(u => { adresse = u; if (vivant) setUrl(u ?? undefined); else if (u) URL.revokeObjectURL(u); });
    return () => { vivant = false; if (adresse) URL.revokeObjectURL(adresse); };
  }, [source, photo]);
  return <div className="space-y-3 rounded-xl bg-muted/50 p-3 text-xs">
    <input ref={fichier} type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files?.length) onAjouterFichiers?.(Array.from(e.target.files)); e.target.value = ""; }} />
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-background text-foreground"><ImagePlus size={17} /></span><div><strong className="block text-sm font-medium">Retouche photo</strong><span className="flex items-center gap-1 text-[11px] text-muted-foreground"><ShieldCheck size={11} /> Sur votre ordinateur</span></div></div>
      <button type="button" onClick={onFermer} className="rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-foreground" aria-label="Fermer la retouche"><X size={15} /></button>
    </div>
    {!url ? <button type="button" onClick={() => fichier.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-foreground/20 bg-background/60 px-4 py-4 text-sm font-medium transition-colors hover:border-foreground/40 hover:bg-background"><ImagePlus size={18} /> Ajouter la photo et ses références</button> : <>
      <p>Tracez la zone à modifier : les pixels à l’extérieur resteront intacts.</p>
      <div className="relative mx-auto max-w-sm touch-none overflow-hidden rounded-lg" onPointerDown={e => {
        const r = e.currentTarget.getBoundingClientRect();
        debut.current = { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
        e.currentTarget.setPointerCapture(e.pointerId);
      }} onPointerMove={e => {
        if (!debut.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
        const a = debut.current;
        if (Math.abs(a.x - x) > .005 && Math.abs(a.y - y) > .005) onZone({ x: Math.min(x, a.x), y: Math.min(y, a.y), largeur: Math.abs(x - a.x), hauteur: Math.abs(y - a.y) });
      }} onPointerUp={() => { debut.current = undefined; }} onPointerCancel={() => { debut.current = undefined; }}>
        <img src={url} draggable={false} alt="Photo source à retoucher" className="block w-full select-none" />
        {zone && <div className="pointer-events-none absolute border-2 border-primary bg-primary/20" style={{ left: `${zone.x * 100}%`, top: `${zone.y * 100}%`, width: `${zone.largeur * 100}%`, height: `${zone.hauteur * 100}%` }} />}
      </div>
      <button className="underline" onClick={() => onZone(undefined)}>Retoucher toute l'image</button>
      <details><summary>Définir la zone au clavier</summary><div className="grid grid-cols-2 gap-2">{(["x", "y", "largeur", "hauteur"] as const).map(k => <label key={k}>{k} (%)<input type="number" min={k === "largeur" || k === "hauteur" ? 1 : 0} max={100} value={Math.round((zone ?? { x: 0, y: 0, largeur: 1, hauteur: 1 })[k] * 100)} onChange={e => {
        const z = { ...(zone ?? { x: 0, y: 0, largeur: 1, hauteur: 1 }), [k]: Math.max(0, Math.min(1, Number(e.target.value) / 100)) };
        z.largeur = Math.min(Math.max(.01, z.largeur), 1 - z.x); z.hauteur = Math.min(Math.max(.01, z.hauteur), 1 - z.y);
        if (z.largeur > 0 && z.hauteur > 0) onZone(z);
      }} className="w-full rounded border border-border bg-background px-2" /></label>)}</div></details>
    </>}
    <p className="text-[11px] leading-relaxed text-muted-foreground">Jusqu’à 4 photos : la cible d’abord, puis les références de bois, de matière ou de style. Précisez leurs numéros dans votre demande. Sans zone sélectionnée, la conservation des détails dépend du modèle.</p>
    <details className="group border-t border-border/60 pt-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-muted-foreground hover:text-foreground"><SlidersHorizontal size={13} /> Réglages <span className="ms-auto text-[11px]">{Math.round(intensite * 100)} %</span></summary>
      <div className="space-y-3 pt-3"><label className="flex flex-wrap items-center justify-between gap-2">Intensité du résultat <span>{Math.round(intensite * 100)} %</span><input className="w-full accent-primary" type="range" min={10} max={100} value={Math.round(intensite * 100)} onChange={e => onIntensite(Number(e.target.value) / 100)} /></label>
      <p className="leading-relaxed text-muted-foreground">Réduisez l’intensité pour mélanger le résultat avec votre photo. La zone extérieure à votre sélection reste intacte.</p>
      <Link className="inline-block text-muted-foreground underline underline-offset-2 hover:text-foreground" to="/parametres/modeles-locaux">Configurer le modèle de retouche</Link></div>
    </details>
  </div>;
}
