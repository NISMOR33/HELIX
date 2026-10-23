import type {ChoixAtelier,PlanAtelier} from './atelierRetouche';
/** Chat automation and explicit atelier share the same validated generation pipeline. */
export async function choisirRetouche(mode:'automatique'|'atelier'|undefined,photos:string[],instruction:string,dependances:{planifier:()=>Promise<PlanAtelier>;atelier:()=>Promise<ChoixAtelier>},signal?:AbortSignal):Promise<ChoixAtelier>{
 if(signal?.aborted)throw new DOMException('Retouche annulée.','AbortError');
 if(!instruction.trim())throw new Error('Décrivez la modification souhaitée.');
 if(mode!=='automatique')return dependances.atelier();
 const plan=await dependances.planifier();
 if(signal?.aborted)throw new DOMException('Retouche annulée.','AbortError');
 if(!Number.isInteger(plan.cible)||!photos[plan.cible-1]||!Array.isArray(plan.references)||plan.references.some(i=>!Number.isInteger(i)||!photos[i-1]||i===plan.cible)||!plan.instruction?.trim())throw new Error('Plan de retouche invalide.');
 return{plan,photos,traces:[],variantes:1,verifier:true};
}
