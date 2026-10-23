import type { OptionsArch } from "./architecture";
import type { ZoneRetouche } from "./retouche";
export interface TraceMasque { forme?:"rectangle"; mode:"modifier"|"proteger";rayon:number;points:{x:number;y:number}[] }
export interface PlanAtelier { cible:number;references:number[];modifier:string[];conserver:string[];instruction:string }
export interface ChoixAtelier { plan:PlanAtelier;photos?:string[];architecture?:OptionsArch;traces:TraceMasque[];zone?:ZoneRetouche;variantes:number;verifier:boolean }
export interface RequeteAtelier { hote?:"chat"|"maquette"; photos:string[];instruction:string;demandeUtilisateur?:string;typeSourceInitial?:"photo"|"croquis"|"elevation"|"maquette";zone?:ZoneRetouche;signal?:AbortSignal;prisEnCharge:boolean;valider:(v:ChoixAtelier)=>void;annuler:()=>void }
export function ouvrirAtelier(photos:string[],instruction:string,zone?:ZoneRetouche,signal?:AbortSignal,demandeUtilisateur?:string,typeSourceInitial?:"photo"|"croquis"|"elevation"|"maquette",hote?:"chat"|"maquette"):Promise<ChoixAtelier>{
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException("Retouche annulée.","AbortError"));return;}
    let fini=false;
    const terminer=(v?:ChoixAtelier)=>{if(fini)return;fini=true;signal?.removeEventListener("abort",annuler);v?resolve(v):reject(new DOMException("Retouche annulée avant génération.","AbortError"));};
    const annuler=()=>terminer();signal?.addEventListener("abort",annuler,{once:true});
    const detail:RequeteAtelier={hote,photos,instruction,demandeUtilisateur,typeSourceInitial,zone,signal,prisEnCharge:false,valider:terminer,annuler};
    window.dispatchEvent(new CustomEvent("helix-atelier-retouche",{detail}));
    if(!detail.prisEnCharge){signal?.removeEventListener("abort",annuler);reject(new Error("L’atelier de retouche n’est pas disponible. Rouvrez le chat."));}
  });
}
