import { appelRetouche } from "./retouche";
import type { TraceMasque } from "./atelierRetouche";
export interface MateriauArch { id:string;nom:string;famille:string;couleur:string;finition:string;pose:string;dimensions:string;reference:string;photo?:string }
export interface PaletteArch { id:string;nom:string;materiaux:MateriauArch[] }
export interface ScenarioArch { id:string;nom:string;source:string;images:string[];instruction:string;palette?:string;date:string;typeSource:string;intention:string;references?:string[];resumePalette?:string }
export interface ProjetArch { id:string;nom:string;notes:string;palettes:PaletteArch[];scenarios:ScenarioArch[];revision:number }
export interface ZoneArch { id:string;nom:string;nature:string;x:number;y:number;largeur:number;hauteur:number;etat:"libre"|"verrouille"|"materiau" }
export interface AnnotationArch { id:string;texte:string;x:number;y:number;finX:number;finY:number }
export interface OptionsArch { typeSource:"photo"|"croquis"|"elevation"|"maquette";intention:"fidele"|"materiaux"|"exploration";projet?:ProjetArch;palette?:string;actifs:string[];zones:ZoneArch[];annotations:AnnotationArch[];notes:string }
export const optionsArchitecture=():OptionsArch=>({typeSource:"photo",intention:"fidele",actifs:[],zones:[],annotations:[],notes:""});
export const idArch=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),v=>v.toString(16).padStart(2,"0")).join("");
export const listerProjetsArch=()=>appelRetouche<ProjetArch[]>("projets");
export const creerProjetArch=(nom:string)=>appelRetouche<ProjetArch>("projet-creer",{nom});
export const sauverProjetArch=(projet:ProjetArch)=>appelRetouche<ProjetArch>("projet-sauver",{projet});
export function materiauxChoisis(o:OptionsArch):MateriauArch[]{return o.projet?.palettes.find(p=>p.id===o.palette)?.materiaux.filter(m=>o.actifs.includes(m.id))??[];}
export function consigneArchitecture(o:OptionsArch):string{
 const modes={fidele:"FIDELITE : conserver volumes, silhouette, proportions, positions et nombre des ouvertures, perspective et cadrage. Ne pas inventer de nouveau bâtiment.",materiaux:"MATERIAUX : conserver strictement les volumes, ouvertures et point de vue. Modifier uniquement les matériaux et couleurs demandés.",exploration:"EXPLORATION : proposer une variante architecturale uniquement dans les parties autorisées. Respecter les zones protégées et le contexte."};
 const source=o.typeSource==="photo"?"Source : photo ou image existante.":`Source : ${o.typeSource}. Transformer cette représentation en rendu architectural photoréaliste, avec lumière, ombres et matériaux plausibles. Ne pas reproduire les traits du dessin comme une texture sur un mur. La géométrie est un guide visuel, sans garantie métrique.`;
 const mat=materiauxChoisis(o).map(m=>`${m.nom} (${m.famille}) : teinte indicative ${m.couleur}, finition ${m.finition||"non précisée"}, pose ${m.pose||"non précisée"}, dimensions fournies ${m.dimensions||"aucune"}, référence fournie ${m.reference||"aucune"}`).join(" ; ");
 const annotations=o.annotations.map(a=>`À x=${Math.round(a.finX*100)}%, y=${Math.round(a.finY*100)}% de la cible : ${a.texte}`).join(" ; ");
 return [source,modes[o.intention],mat?`Palette sélectionnée : ${mat}`:"",annotations?`Annotations de la cible : ${annotations}`:"",o.notes?`Contraintes : ${o.notes}`:""].filter(Boolean).join("\n");
}
export function tracesDesZones(zones:ZoneArch[]):TraceMasque[]{return zones.filter(z=>z.etat!=="libre").map(z=>({forme:"rectangle",mode:z.etat==="verrouille"?"proteger":"modifier",rayon:.002,points:[{x:z.x,y:z.y},{x:z.x+z.largeur,y:z.y+z.hauteur}]}));}
export function entreesArchitecture(photos:string[],roles:string[],o:OptionsArch){
 const p:string[]=[],r:string[]=[];photos.forEach((id,i)=>{if(roles[i]!=="ignorer"){p.push(id);r.push(roles[i]);}});
 for(const m of materiauxChoisis(o))if(m.photo&&!p.includes(m.photo)){p.push(m.photo);r.push("materiau");}
 if(p.length>4)throw new Error("Quatre images maximum : ignorez une référence ou désactivez un échantillon de palette.");
 if(r.filter(v=>v==="cible").length!==1)throw new Error("Choisissez une seule photo cible.");return {photos:p,roles:r};
}
export async function echantillonDepuisFichier(file:File):Promise<{photo:string;couleurs:string[]}>{
 if(!file.type.startsWith("image/")||file.size>20*1024*1024)throw new Error("Choisissez une image de moins de 20 Mo.");
 const data=await new Promise<string>((ok,ko)=>{const r=new FileReader();r.onload=()=>ok(String(r.result));r.onerror=()=>ko(new Error("Lecture impossible."));r.readAsDataURL(file);});
 const img=new Image();img.src=data;await img.decode();const f=Math.min(1,1600/Math.max(img.width,img.height));const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.width*f));canvas.height=Math.max(1,Math.round(img.height*f));const c=canvas.getContext("2d");if(!c)throw new Error("Image illisible.");c.drawImage(img,0,0,canvas.width,canvas.height);const png=canvas.toDataURL("image/png");const photo=(await appelRetouche<{id:string}>("importer",{photo:png})).id;
 const miniature=document.createElement("canvas");miniature.width=80;miniature.height=80;const ctx=miniature.getContext("2d")!;ctx.drawImage(img,0,0,80,80);const pixels=ctx.getImageData(0,0,80,80).data;const bins=new Map<string,{n:number;r:number;g:number;b:number}>();for(let i=0;i<pixels.length;i+=4){const [r,g,b]=[pixels[i],pixels[i+1],pixels[i+2]];const k=[r>>5,g>>5,b>>5].join("-");const a=bins.get(k)??{n:0,r:0,g:0,b:0};a.n++;a.r+=r;a.g+=g;a.b+=b;bins.set(k,a);}const rgb:number[][]=[];for(const a of [...bins.values()].sort((a,b)=>b.n-a.n)){const v=[a.r/a.n,a.g/a.n,a.b/a.n].map(Math.round);if(rgb.every(p=>Math.hypot(...p.map((n,i)=>n-v[i]))>45))rgb.push(v);if(rgb.length>=5)break;}return {photo,couleurs:rgb.map(v=>"#"+v.map(n=>n.toString(16).padStart(2,"0")).join(""))};
}
