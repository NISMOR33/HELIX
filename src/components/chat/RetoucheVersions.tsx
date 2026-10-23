import { useEffect, useState } from "react";
import { historiqueRetouche } from "@/lib/retouche";
import { urlImage, type ImageCreee } from "@/lib/images";

export function choisirPhotoRetouche(id: string) {
  window.dispatchEvent(new CustomEvent("helix-retouche-source", { detail: id }));
}

export function RetoucheVersions({ image }: { image: ImageCreee }) {
  const [versions, setVersions] = useState<ImageCreee[]>([]);
  const [choix, setChoix] = useState(image.parent ?? image.original!);
  const [avant, setAvant] = useState<string>();
  const [apres, setApres] = useState<string>();
  const [seuil, setSeuil] = useState(50);
  const [erreur, setErreur] = useState("");
  useEffect(() => {
    let vivant = true;
    void historiqueRetouche(image.id).then(v => { if (vivant) setVersions(v); }).catch(e => { if (vivant) setErreur(e.message); });
    return () => { vivant = false; };
  }, [image.id]);
  useEffect(() => {
    let vivant = true; const urls: string[] = [];
    setAvant(undefined); setApres(undefined);
    for (const [id, setter] of [[choix, setAvant], [image.id, setApres]] as const) void urlImage(id).then(u => {
      if (!u) return;
      if (vivant) { urls.push(u); setter(u); } else URL.revokeObjectURL(u);
    });
    return () => { vivant = false; urls.forEach(u => URL.revokeObjectURL(u)); };
  }, [choix, image.id]);
  return <details className="mt-3 space-y-2 text-xs">
    <summary className="cursor-pointer">Versions et comparaison avant / après</summary>
    {erreur && <p role="alert">{erreur}</p>}
    <label className="block">Version de référence<select value={choix} onChange={e => setChoix(e.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background p-2">
      {versions.map((v, n) => <option key={v.id} value={v.id}>{n === 0 ? "Original" : `Version ${n}`} · {v.description.slice(0, 60)}</option>)}
    </select></label>
    {avant && apres && <>
      <div className="relative overflow-hidden rounded-xl" style={{ aspectRatio: `${image.largeur}/${image.hauteur}` }}>
        <img src={apres} alt="Après la retouche" className="absolute inset-0 h-full w-full object-contain" />
        <img src={avant} alt="Version avant la retouche" className="absolute inset-0 h-full w-full object-contain" style={{ clipPath: `inset(0 ${100 - seuil}% 0 0)` }} />
        <span className="absolute bottom-1 left-1 rounded bg-black/60 px-2 text-white">Avant</span><span className="absolute bottom-1 right-1 rounded bg-black/60 px-2 text-white">Après</span>
      </div>
      <input aria-label="Comparer avant et après" className="w-full" type="range" min={0} max={100} value={seuil} onChange={e => setSeuil(Number(e.target.value))} />
    </>}
    <div className="flex flex-wrap gap-3">
      <button className="underline" onClick={() => choisirPhotoRetouche(choix)}>Reprendre cette version</button>
      <button className="underline" onClick={() => choisirPhotoRetouche(image.original!)}>Repartir de l'original</button>
      {avant && <a className="underline" href={avant} download={`helix-version-${choix}.png`}>Télécharger cette version</a>}
    </div>
    <p className="text-muted-foreground">La photo reste privée, même si le Chat est partagé. Les visages et les zones modifiées peuvent varier.</p>
  </details>;
}
