import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { appelRetouche, etatRetouche, type EtatRetouche } from "@/lib/retouche";

export function RetouchePhoto() {
  const [etat, setEtat] = useState<EtatRetouche>();
  const [erreur, setErreur] = useState("");
  const [occupe, setOccupe] = useState(false);
  useEffect(() => {
    let vivant = true;
    const lire = () => { void etatRetouche().then(e => { if (vivant) setEtat(e); }).catch(e => { if (vivant) setErreur(e.message); }); };
    lire(); const timer = window.setInterval(lire, 2000);
    return () => { vivant = false; clearInterval(timer); };
  }, []);
  const agir = async (action: string, profil?: string) => {
    setOccupe(true); setErreur("");
    try { setEtat(await appelRetouche<EtatRetouche>(action, profil ? { profil } : {})); }
    catch (e) { setErreur(e instanceof Error ? e.message : String(e)); }
    finally { setOccupe(false); }
  };
  const enCours = occupe || Boolean(etat?.installation && !etat.installation.erreur);
  const go = (n: number) => `${(n / 1e9).toFixed(1)} Go`;
  return <section className="space-y-4 rounded-2xl border border-border p-5" aria-label="Retouche photo locale">
    <h2 className="text-lg font-semibold">Retouche photo locale</h2>
    <p className="text-sm text-muted-foreground">Modifiez une photo depuis le menu + du Chat. Les photos et les instructions restent sur ce poste. Cette fonction est fermée sur une instance partagée sur le réseau.</p>
    {erreur && <p role="alert" className="text-sm text-destructive">{erreur}</p>}
    {etat && <>
      <p className="text-sm">{etat.pret ? "Moteur prêt" : "Installation nécessaire"} · RAM {etat.materiel.totalMemoryGb} Go ({etat.materiel.ramDisponibleGo} Go disponibles) · VRAM NVIDIA {etat.materiel.gpuVramGb ?? "non reconnue"} Go</p>
      <p className="text-xs text-muted-foreground">{etat.materiel.platform} · {etat.materiel.accelerateur} · {etat.materiel.gpu ? `${etat.materiel.gpu.nom} · ${etat.materiel.gpu.vramUtiliseeMo} Mo de VRAM utilisés · pilote ${etat.materiel.gpu.pilote}` : "Carte graphique non identifiée"}</p>
      <p className="break-all text-xs text-muted-foreground">{etat.stockage} · Modèles présents : {go(etat.occupe)} · Libre : {etat.materiel.disqueLibre === null ? "inconnu" : go(etat.materiel.disqueLibre)}</p>
      <div className="space-y-3">{etat.profils.map(p => <div key={p.id} className="rounded-xl border border-border p-3">
        <p className="font-medium">{p.nom} {etat.actif === p.id ? "· sélectionné" : ""}</p>
        <p className="text-sm">{p.modele} · {p.licence}</p>
        <p className="text-xs text-muted-foreground">{p.raison} Téléchargement restant : {go(p.octets)} · Espace requis : {go(p.espaceRequis)}.</p>
        <button className="mt-2 rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40" disabled={enCours || !p.possible || etat.travaux.length > 0 || (etat.materiel.disqueLibre !== null && p.espaceRequis > etat.materiel.disqueLibre)} onClick={() => void agir("installer", p.id)}>
          {p.installe ? "Sélectionner / Vérifier / Réparer" : "Installer"}
        </button>
      </div>)}</div>
      {etat.pret && <label className="block text-sm">Résolution de travail (côté long)<select className="ms-3 rounded-lg border border-border bg-background p-2" value={etat.resolution} disabled={enCours} onChange={e => {
        setErreur(""); void appelRetouche<EtatRetouche>("regler", { resolution: Number(e.target.value) }).then(setEtat).catch(e => setErreur(e.message));
      }}>{etat.resolutions.map(r => <option key={r} value={r}>{r} px</option>)}</select></label>}
      {etat.installation && <div role="status" className="space-y-1 text-sm">
        <p>{etat.installation.message}</p>
        <progress className="w-full" max={Math.max(1, etat.installation.total)} value={etat.installation.fait} />
        <p>{go(etat.installation.fait)} / {go(etat.installation.total)}</p>
        {etat.installation.erreur && <p role="alert" className="text-destructive">{etat.installation.erreur}</p>}
      </div>}
      {etat.travaux.map(tr => <p key={tr.id} role="status" className="text-sm">{tr.message}</p>)}
      <p className="text-xs text-muted-foreground">Le modèle travaille sur une copie réduite (768 ou 1024 px). Le résultat conserve les dimensions de la photo importée (2048 px maximum). La sélection limite les pixels remplacés, sans garantir la conservation des visages à l'intérieur. Les profils et le moteur sont épinglés ; Réparer vérifie la version installée.</p>
      <button className="rounded-lg border border-border px-3 py-1.5 text-sm disabled:opacity-40" disabled={enCours || etat.travaux.length > 0} onClick={() => void agir("desinstaller")}>Désinstaller les modèles de retouche</button>
      <p className="text-xs text-muted-foreground">Les fichiers partagés avec la génération et les photos sont conservés. L'effacement du compte supprime ses photos.</p>
    </>}
    {!etat && !erreur && <p role="status">Lecture de la compatibilité…</p>}
    <Link to="/" className="text-sm underline">Ouvrir le Chat</Link>
  </section>;
}
