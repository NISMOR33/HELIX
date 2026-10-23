import {choisirRetouche} from './choixRetouche';
import type {PlanAtelier} from './atelierRetouche';
import { ouvrirAtelier } from "./atelierRetouche";
import { apiFetch } from "./endpoint";
import { instance } from "./instance";
import type { ImageCreee, Travail } from "./images";

export interface ZoneRetouche { x: number; y: number; largeur: number; hauteur: number }
export interface DemandeRetouche { mode?:"automatique"|"atelier"; hote?:"chat"|"maquette"; demandeUtilisateur?: string;typeSource?:"photo"|"croquis"|"elevation"|"maquette"; source?: string; photo?: string; references?: string[]; zone?: ZoneRetouche; intensite?: number }
export interface EtatRetouche {
  pret: boolean; actif: string | null; stockage: string; occupe: number; moteur: string | null;
  resolution: number; resolutions: number[];
  materiel: { platform: string; gpuVramGb?: number; totalMemoryGb: number; ramDisponibleGo: number; disqueLibre: number | null; accelerateur: string; gpu: { nom: string; vramUtiliseeMo: number; pilote: string } | null };
  profils: { id: string; nom: string; modele: string; licence: string; possible: boolean; raison: string; installe: boolean; octets: number; espaceRequis: number; verifie: boolean }[];
  installation: { profil: string; fait: number; total: number; message: string; erreur?: string } | null;
  travaux: { id: string; etat: string; message: string }[];
}
export function exigerPosteLocal() {
  const i = instance();
  const host = new URL(i.url).hostname;
  if (i.remote || !["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)) {
    throw new Error("La retouche privée est disponible uniquement sur votre instance locale. La photo n'a pas été envoyée.");
  }
}
export async function appelRetouche<T>(action = "", body?: Record<string, unknown>,signal?:AbortSignal): Promise<T> {
  exigerPosteLocal();
  const r = await apiFetch(`/helix/retouche${action ? `/${action}` : ""}`, body ? {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),signal,
  } : signal?{signal}:undefined);
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error?.message ?? "Retouche indisponible.");
  }
  return r.json() as Promise<T>;
}
export const etatRetouche = () => appelRetouche<EtatRetouche>();
export const historiqueRetouche = (id: string) => appelRetouche<(ImageCreee & { date: string })[]>("historique", { id });

/** Normalize locally: no file, metadata or URL is passed to an external decoder. */
async function pngLocal(dataUrl: string): Promise<string> {
  if (!/^data:image\/(png|jpeg|webp|gif);base64,/.test(dataUrl) || dataUrl.length > 28_000_000) throw new Error("Photo incompatible ou trop volumineuse.");
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const ratio = Math.min(1, 2048 / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * ratio)); canvas.height = Math.max(1, Math.round(img.height * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Impossible de lire la photo.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export async function retoucherPhoto(instruction: string, demande: DemandeRetouche, suivre: (t: Travail) => void, signal?: AbortSignal): Promise<ImageCreee> {
  exigerPosteLocal();
  if (signal?.aborted) throw new DOMException("arrêt", "AbortError");
  if ((demande.references?.length ?? 0) > 3) throw new Error("Vous pouvez utiliser 4 photos au total : une cible et 3 références.");
  let source = demande.source;
  if (demande.photo) {
    const photo = await pngLocal(demande.photo);
    if (signal?.aborted) throw new DOMException("arrêt", "AbortError");
    source = (await appelRetouche<ImageCreee>("importer", { photo })).id;
  }
  if (!source) throw new Error("Joignez une photo ou choisissez une version à modifier.");
  const ids = [source];
  for (const reference of demande.references ?? []) {
    if (signal?.aborted) throw new DOMException("arrêt", "AbortError");
    const photo = await pngLocal(reference);
    ids.push((await appelRetouche<ImageCreee>("importer", { photo })).id);
  }
  if (signal?.aborted) throw new DOMException("arrêt", "AbortError");
  suivre({ id:"plan", etat:"preparation", message:demande.mode==="automatique"?"Analyse de votre demande et de la photo…":"Préparez les zones et validez votre plan dans l’atelier.", apercuSource:ids[0],etape:0,total:1 });
  const choix = await choisirRetouche(demande.mode,ids,instruction,{planifier:()=>appelRetouche<PlanAtelier>("planifier",{photos:ids,instruction:instruction.slice(0,2000)},signal),atelier:()=>ouvrirAtelier(ids,instruction,demande.zone,signal,demande.demandeUtilisateur,demande.typeSource,demande.hote)},signal);
  if(signal?.aborted)throw new DOMException("arrêt","AbortError");
  if(demande.mode==="automatique"&&demande.zone)choix.zone=demande.zone;
  const {plan}=choix;const photosPlan=choix.photos??ids;source=photosPlan[plan.cible-1];
  if(!source||plan.references.some(i=>!photosPlan[i-1]))throw new Error("Plan de photos invalide.");
  const resultats:ImageCreee[]=[];
  for(let variante=0;variante<choix.variantes;variante++){
    if(signal?.aborted)throw new DOMException("arrêt","AbortError");
    let tr=await appelRetouche<Travail>("lancer",{source,references:plan.references.map(i=>photosPlan[i-1]),instruction:plan.instruction,zone:choix.zone,traces:choix.traces,intensite:demande.intensite??1});
    const annuler=()=>{void appelRetouche("annuler",{id:tr.id}).catch(()=>undefined);};
    signal?.addEventListener("abort",annuler,{once:true});
    try{
      if(signal?.aborted){annuler();throw new DOMException("arrêt","AbortError");}
      suivre({...tr,apercuSource:source,message:choix.variantes>1?`Variante ${variante+1}/${choix.variantes} · ${tr.message}`:tr.message});
      while(tr.etat==="preparation"||tr.etat==="encours"){
        await new Promise(r=>setTimeout(r,800));if(signal?.aborted)throw new DOMException("arrêt","AbortError");
        exigerPosteLocal();const r=await apiFetch(`/helix/images/travail/${tr.id}`);if(!r.ok)throw new Error("Suivi indisponible.");tr=await r.json() as Travail;suivre({...tr,apercuSource:source,message:choix.variantes>1?`Variante ${variante+1}/${choix.variantes} · ${tr.message}`:tr.message});
      }
      if(tr.etat!=="fait"||!tr.image)throw new Error(`${tr.message} ${tr.erreur??""}`.trim());
      resultats.push({...tr.image,plan});
    }catch(e){if(signal?.aborted||!resultats.length)throw e;resultats[0].avertissement=`${resultats.length} variante(s) créée(s). Les suivantes ont échoué : ${e instanceof Error?e.message:"erreur du moteur"}`;break;}
    finally{signal?.removeEventListener("abort",annuler);}
  }
  if(choix.verifier){for(let i=0;i<resultats.length;i++){
    if(signal?.aborted)throw new DOMException("arrêt","AbortError");
    suivre({id:"verification",etat:"preparation",message:`Vérification visuelle ${i+1}/${resultats.length}…`,etape:0,total:1});
    try{resultats[i].verification=await appelRetouche("verifier",{avant:source,apres:resultats[i].id,instruction:plan.instruction});}
    catch(e){resultats[i].avertissement=[resultats[i].avertissement,`Vérification indisponible : ${e instanceof Error?e.message:"erreur du modèle"}`].filter(Boolean).join(" · ");}
  }}
  if(signal?.aborted)throw new DOMException("arrêt","AbortError");
  if(choix.architecture?.projet){
    try{const {listerProjetsArch,sauverProjetArch,idArch,materiauxChoisis}=await import("./architecture");const projet=(await listerProjetsArch()).find(p=>p.id===choix.architecture!.projet!.id);if(!projet)throw new Error("Projet introuvable.");const scenario={id:idArch(),nom:(demande.demandeUtilisateur||instruction).slice(0,100),source,images:resultats.map(v=>v.id),instruction:plan.instruction,palette:choix.architecture.palette,date:new Date().toISOString(),typeSource:choix.architecture.typeSource,intention:choix.architecture.intention,references:plan.references.map(i=>photosPlan[i-1]),resumePalette:JSON.stringify(materiauxChoisis(choix.architecture)).slice(0,3000)};await sauverProjetArch({...projet,scenarios:[...projet.scenarios,scenario]});for(const r of resultats)r.projetArchitecture={id:projet.id,nom:projet.nom,scenario:scenario.id};}
    catch(e){resultats[0].avertissement=[resultats[0].avertissement,`Résultat créé mais projet non enregistré : ${e instanceof Error?e.message:"erreur"}`].filter(Boolean).join(" · ");}
  }
  return {...resultats[0],variantes:resultats.length>1?resultats:undefined};

}
