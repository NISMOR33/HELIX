import {randomBytes} from 'node:crypto';
import {db} from './db.ts';
import {validerDossier,type DossierMaquette} from '../../src/lib/maquetteGeometry.ts';
interface Ligne {pour:string;dossier:DossierMaquette}
let queue=Promise.resolve();
async function lignes():Promise<Ligne[]>{const v=await db().read('maquettes');if(v==null)return [];if(!Array.isArray(v))throw new Error('Bibliothèque de maquettes illisible.');return v;}
export async function lister(qui:string){return(await lignes()).filter(l=>l.pour===qui).map(l=>l.dossier);}
export function sauver(qui:string,brut:unknown,photo:(id:string)=>void):Promise<DossierMaquette>{const action=queue.then(async()=>{const d=validerDossier(brut),rows=await lignes();if(d.plan)photo(d.plan.photo);d.facades.forEach(f=>photo(f.document.photo));let id=d.id;if(!id){if(rows.filter(l=>l.pour===qui).length>=100)throw new Error('Maximum de 100 maquettes atteint.');if(d.revision!==0)throw new Error('Révision invalide pour une nouvelle maquette.');id=randomBytes(16).toString('hex');}else{const avant=rows.find(l=>l.pour===qui&&l.dossier.id===id);if(!avant)throw new Error('Maquette introuvable.');if(avant.dossier.revision!==d.revision)throw new Error('La maquette a changé dans une autre fenêtre. Rechargez-la avant de réessayer.');}const dossier={...d,id,revision:d.revision+1};await db().write('maquettes',[...rows.filter(l=>!(l.pour===qui&&l.dossier.id===id)),{pour:qui,dossier}]);return dossier;});queue=action.then(()=>undefined,()=>undefined);return action;}
