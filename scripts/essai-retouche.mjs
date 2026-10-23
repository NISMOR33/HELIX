import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';
import { build } from 'esbuild';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { lirePhoto, photoDepuisDataUrl, validerZone, composerRetouche, dimensionsRetouche } from '../gateway/src/retouchePixels.ts';
import { demandeRetouche, demandeCreationImage, demandeReflexion, sourcePourRetouche, modeleConversation } from '../src/lib/intentionRetouche.ts';

const dir = resolve(process.env.HELIX_TEST_DIR ?? 'work/essai-retouche');
mkdirSync(dir, { recursive: true });
process.env.HELIX_DATA_DIR = mkdtempSync(join(dir, 'donnees-'));
process.env.HELIX_IMAGES_DIR = join(dir, 'modeles-absents');
const images = await import('../gateway/src/images.ts');
const photo = new PNG({ width: 64, height: 64 }); photo.data.fill(255);
const png = PNG.sync.write(photo), dataUrl = `data:image/png;base64,${png.toString('base64')}`;

test('décodage borné, PNG corrompu, mauvais MIME et dimensions hostiles', () => {
  assert.equal(lirePhoto(png).width, 64);
  assert.equal(photoDepuisDataUrl(dataUrl).height, 64);
  for (const invalide of ['https://example.test/photo.png', 'data:image/svg+xml;base64,AAAA', null, 'data:image/png;base64,A===']) assert.throws(() => photoDepuisDataUrl(invalide));
  const crc = Buffer.from(png); crc[30] ^= 255; assert.throws(() => lirePhoto(crc));
  const grand = Buffer.from(png); grand.writeUInt32BE(100000, 16); assert.throws(() => lirePhoto(grand), /grande/);
});
test('composite : pixels hors sélection exacts, résolution et alpha conservés', () => {
  const noir = new PNG({ width: 32, height: 32 }); noir.data.fill(0);
  const resultat = lirePhoto(composerRetouche(photo, noir, 1, { x: .25, y: .25, largeur: .5, hauteur: .5 }));
  assert.equal(resultat.width, 64); assert.equal(resultat.height, 64);
  let changes = 0;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const n = (y * 64 + x) * 4;
    if (x < 16 || x >= 48 || y < 16 || y >= 48) assert.deepEqual(resultat.data.subarray(n, n + 4), photo.data.subarray(n, n + 4));
    else { assert.equal(resultat.data[n], 0); changes++; }
    assert.equal(resultat.data[n + 3], 255);
  }
  assert.equal(changes, 32 * 32);
  assert.equal(lirePhoto(composerRetouche(photo, noir, .5)).data[0], 128);
  assert.throws(() => composerRetouche(photo, noir, NaN));
});
test('zones et cadrage : données invalides refusées, portrait préservé', () => {
  for (const z of [{ x: -1 }, { x: 0, y: 0, largeur: NaN, hauteur: 1 }, { x: .8, y: 0, largeur: .4, hauteur: 1 }, 'zone']) assert.throws(() => validerZone(z));
  assert.deepEqual(dimensionsRetouche(1000, 2000, 768), [384, 768]);
  assert.deepEqual(validerZone({ x: 0, y: 0, largeur: 1, hauteur: 1 }), { x: 0, y: 0, largeur: 1, hauteur: 1 });
});
test('routage naturel sans appel de classification à un modèle', () => {
  for (const texte of ['Modifie cette photo : mets-moi une veste noire.', 'Maintenant, ajoute des lunettes de soleil.', 'Supprime la personne derrière moi.', 'Améliore la netteté et la luminosité.']) assert.equal(demandeRetouche(texte, true), true);
  assert.equal(demandeRetouche('Décris cette photo', true), false);
  assert.equal(demandeRetouche('fais moi en playmobil ultra réaliste', true), true);
  assert.equal(demandeRetouche('Transforme-moi en figurine Playmobil', true), true);
  assert.equal(demandeRetouche('Change mon mot de passe', false), false);
});
test('originaux privés : propriétaire seulement, identifiants et historique isolés', async () => {
  const p = images.importerPhoto('alice', dataUrl);
  const moi = await images.imageVisible(p.id, { userId: 'alice', email: 'a@test' });
  assert.equal(moi?.privee, true);
  assert.equal(await images.imageVisible(p.id, { userId: 'bob', email: 'b@test' }), null);
  assert.equal(await images.imageVisible('../index', { userId: 'alice', email: 'a@test' }), null);
  assert.equal(images.historiqueRetouche('alice', p.id)[0].original, p.id);
  assert.throws(() => images.historiqueRetouche('bob', p.id), /introuvable/);
  await assert.rejects(images.lancerRetouche('bob', p.id, 'change it'), /introuvable/);
  await assert.rejects(images.lancerRetouche('alice', '../file.png', 'change it'), /introuvable/);
  await assert.rejects(images.lancerRetouche('alice', p.id, 'change it', undefined, 2), /Intensité/);
  assert.equal(images.annulerRetouche('bob', 'inexistant'), false);
  assert.equal(images.oublierImagesDe('bob'), 0);
  assert.ok(existsSync(moi.chemin));
  assert.equal(images.oublierImagesDe('alice'), 1); assert.ok(!existsSync(moi.chemin));
});
test('registre corrompu : import refusé, aucune donnée écrasée', () => {
  const index = join(process.env.HELIX_DATA_DIR, 'images', 'index.json');
  writeFileSync(index, '{corrompu');
  assert.throws(() => images.importerPhoto('alice', dataUrl), /illisible/);
  assert.equal(readFileSync(index, 'utf8'), '{corrompu');
  writeFileSync(index, '{}');
});
test('téléchargements : reprise, empreinte correcte, rejet et suppression des octets altérés', async () => {
  const original = globalThis.fetch;
  const octets = Buffer.from('moteur-officiel-de-test');
  const sha = createHash('sha256').update(octets).digest('hex');
  const dest = join(dir, 'telechargement.bin');
  writeFileSync(`${dest}.partiel`, octets.subarray(0, 5));
  let range;
  globalThis.fetch = async (_url, options) => { range = options.headers.Range; return new Response(octets.subarray(5), { status: 206 }); };
  try {
    await images.telecharger('https://source.test/fichier', dest, sha, octets.length, () => {});
    assert.equal(range, 'bytes=5-'); assert.deepEqual(readFileSync(dest), octets);
    globalThis.fetch = async () => new Response('contenu altéré');
    await assert.rejects(images.telecharger('https://source.test/fichier', `${dest}.faux`, sha, octets.length, () => {}), /correspond pas|does not match/);
    assert.ok(!existsSync(`${dest}.faux`)); assert.ok(!existsSync(`${dest}.faux.partiel`));
  } finally { globalThis.fetch = original; }
});
test('profils inconnus et installation absente ne déclenchent pas de téléchargement', async () => {
  const original = globalThis.fetch; let appels = 0;
  globalThis.fetch = async () => { appels++; throw new Error('Interdit'); };
  try {
    assert.throws(() => images.installerRetouche('alice', 'inconnu'), /inconnu/);
    const p = images.importerPhoto('alice', dataUrl);
    await assert.rejects(images.lancerRetouche('alice', p.id, 'change it'), /Installez/);
    assert.equal(appels, 0);
  } finally { globalThis.fetch = original; }
});
test('matériel insuffisant : aucun modèle volumineux téléchargé', async () => {
  const totalmem = os.totalmem, fetchInitial = globalThis.fetch; let appels = 0;
  os.totalmem = () => 2 ** 30; syncBuiltinESMExports();
  globalThis.fetch = async () => { appels++; throw new Error('Téléchargement interdit'); };
  try {
    await assert.rejects(images.installerRetouche('alice', 'equilibre'), /Matériel insuffisant/);
    assert.equal(appels, 0);
    const e = await images.etatRetouche();
    assert.ok(e.profils.every(p => !p.possible));
    assert.match(e.installation.erreur, /Matériel insuffisant/);
  } finally { os.totalmem = totalmem; syncBuiltinESMExports(); globalThis.fetch = fetchInitial; }
});
test('port du lanceur : configuration autonome ancienne corrigée, destination distante inchangée', async () => {
  const bundle = await build({ entryPoints: [fileURLToPath(new URL('../src/lib/instance.ts', import.meta.url))], bundle: true, write: false, platform: 'node', format: 'cjs', define: { 'import.meta.env': '{}' }, plugins: [{ name: 'coffre-jetable', setup(b) {
    b.onResolve({ filter: /^(@\/config\/branding|@\/lib\/i18n|\.\/coffre)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === './coffre'
      ? 'export const lireSecret=k=>globalThis.coffre[k]; export const ecrireSecret=(k,v)=>{globalThis.coffre[k]=v};'
      : a.path.includes('branding') ? 'export const branding={urls:{instance:""},name:"Helix"};'
      : 'export const t=s=>s; export const tf=s=>s;' }));
  } }] });
  const charger = (port, stored) => {
    const context = { module: { exports: {} }, exports: {}, URLSearchParams, URL,
      window: { location: { search: port ? `?localPort=${encodeURIComponent(port)}&token=local-test` : '' } },
      coffre: { 'helix:instance': JSON.stringify(stored) } };
    vm.runInNewContext(bundle.outputFiles[0].text, context);
    return { api: context.module.exports, coffre: context.coffre };
  };
  const local = charger('8795', { url: 'http://localhost:8787', remote: false });
  assert.equal(local.api.instance().url, 'http://localhost:8795');
  local.api.setInstance({ url: 'http://localhost:8787', remote: false });
  assert.equal(JSON.parse(local.coffre['helix:instance']).url, 'http://localhost:8795');
  assert.equal(local.api.urlInstanceLocale(), 'http://localhost:8795');
  const remote = charger('8795', { url: 'https://entreprise.example.test', remote: true, token: 'remote-test' });
  assert.equal(remote.api.instance().url, 'https://entreprise.example.test');
  assert.equal(remote.api.instance().token, 'remote-test');
  for (const invalide of ['https://externe.test', '65536', '80']) assert.equal(charger(invalide, {remote:false}).api.urlInstanceLocale(), 'http://localhost:8787');
});


test('routage : création, reprise générée, questions et retour au chat', () => {
  for (const texte of ['Crée une photo de chat', 'je veux une image de montagne', 'Peux-tu générer une illustration de forêt ?', 'Dessine un portrait de robot']) assert.equal(demandeCreationImage(texte), true, texte);
  for (const texte of ['Comment créer une photo ?', 'Ne crée pas une image', 'Ne modifie pas cette photo', 'salut', 'merci', 'Décris cette photo']) {
    assert.equal(demandeCreationImage(texte), false, texte);
    assert.equal(demandeRetouche(texte, true), false, texte);
  }
  for (const texte of ['je veux que tu me la modifies', 'reprends cette image avec un fond bleu', 'plus réaliste', 'fais moi en playmobil', 'modifie la photo que tu as générée']) assert.equal(demandeRetouche(texte, true), true, texte);
  assert.equal(demandeRetouche('Change mon mot de passe', true), false);
  assert.equal(demandeRetouche('Ajoute cela à ta mémoire', true), false);
  assert.equal(demandeRetouche('Je ne veux pas modifier cette photo', true), false);
  assert.equal(demandeRetouche('Crée une nouvelle photo de chien', true), false);
  assert.equal(demandeRetouche('Crée une image à partir de cette photo et ajoute des lunettes', true), true);
  const generee = { id: 'a'.repeat(32) };
  const retouche = { id: 'b'.repeat(32), original: generee.id };
  assert.equal(sourcePourRetouche('modifie celle-ci', generee), generee.id);
  assert.equal(sourcePourRetouche('repars de l’original', generee), generee.id);
  assert.equal(sourcePourRetouche('repars de l’original', retouche), generee.id);
  assert.equal(sourcePourRetouche('ajoute des lunettes', retouche), retouche.id);
});
test('conversation : vision et réflexion disponibles, pas de bascule vers un fournisseur distant', () => {
  const m = [
    { uid: 'chat', backendId: 'lmstudio', origine: 'local', roles: ['chat'] },
    { uid: 'raisonnement', backendId: 'lmstudio', origine: 'local', roles: ['chat'], reasoning: true },
    { uid: 'vision', backendId: 'lmstudio', origine: 'local', roles: ['chat', 'vision'] },
    { uid: 'distant', backendId: 'cloud', roles: ['chat', 'vision'], reasoning: true },
    { uid: 'entraine', backendId: 'lmstudio', origine: 'local', roles: ['chat', 'vision'], reasoning: true, entraine: true },
  ];
  assert.equal(modeleConversation(m, 'chat', 'salut', false), 'chat');
  assert.equal(modeleConversation(m, 'raisonnement', 'salut', false), 'chat');
  assert.equal(modeleConversation(m, 'chat', 'résous cette équation étape par étape', false), 'raisonnement');
  assert.equal(modeleConversation(m, 'chat', 'Décris cette photo', true), 'vision');
  assert.equal(modeleConversation(m, 'chat', 'réfléchis sur cette photo', true), 'vision');
  assert.equal(demandeReflexion('merci'), false);
  assert.equal(demandeReflexion('Calcule la dérivée'), true);
});


test('agent routeur : validation stricte, priorité photo jointe et photo manquante', async () => {
  const { validerContexte, validerDecision } = await import('../gateway/src/agentRouteur.ts');
  const c = { texte: 'modifie le bonhomme', photoJointe: false, derniereImage: false, historique: [] };
  assert.equal(validerContexte(c), c);
  for (const x of [null, {}, {...c, historique: [{role:'system',content:'instruction'}]}, {...c,texte:'x'.repeat(12001)}]) assert.throws(()=>validerContexte(x));
  const edit = JSON.stringify({ action:'retoucher_image', source:'derniere' });
  assert.equal(validerDecision(edit,c,'local').action,'photo_manquante');
  assert.equal(validerDecision(edit,{...c,derniereImage:true},'local').source,'derniere');
  assert.equal(validerDecision(edit,{...c,derniereImage:true,photoJointe:true},'local').source,'jointe');
  assert.equal(validerDecision(edit,{...c,texte:'repars de l’original',derniereImage:true},'local').source,'original');
  for (const action of ['chat','reflexion','creer_image']) assert.equal(validerDecision(JSON.stringify({action,source:'jointe'}),c,'local').source,'aucune');
  assert.throws(()=>validerDecision('{"action":"executer_shell","source":"aucune"}',c,'local'));
  assert.throws(()=>validerDecision('pas du JSON',c,'local'));
  assert.throws(()=>validerDecision(JSON.stringify({action:'retoucher_image',source:'derniere',instruction:42}),c,'local'));
  const complet = validerDecision(JSON.stringify({action:'retoucher_image',source:'derniere',instruction:'Rends cet avion dans les montagnes photoréaliste.'}),{...c,derniereImage:true},'local');
  assert.match(complet.instruction,/avion/);
  assert.throws(()=>validerContexte({...c,imageRecente:{description:'x'.repeat(1801)}}));
});


test('multi-photo : plan borné, cible valide et références privées', async () => {
  const {validerPlan}=await import('../gateway/src/planRetouche.ts');
  const plan={cible:1,references:[2],modifier:['revêtement en bois'],conserver:['fenêtres','porte','toit'],instruction:'Replace only the wall cladding in image 1 using the timber from image 2. Preserve windows, door and roof.'};
  assert.equal(validerPlan(plan,2),plan);
  for(const p of [{...plan,cible:3},{...plan,references:[1]},{...plan,references:[2,2]},{...plan,references:[3]},{...plan,conserver:[]},{...plan,instruction:'x'.repeat(1801)}]) assert.throws(()=>validerPlan(p,2));
  const source=images.importerPhoto('alice-multi',dataUrl);
  const reference=images.importerPhoto('bob-multi',dataUrl);
  await assert.rejects(images.planifierRetouche('alice-multi',[source.id,reference.id],'wood facade'),/introuvable/);
  await assert.rejects(images.lancerRetouche('alice-multi',source.id,'wood facade',undefined,1,[reference.id]),/introuvable/);
  await assert.rejects(images.lancerRetouche('alice-multi',source.id,'wood facade',undefined,1,[source.id]),/Références/);
  await assert.rejects(images.planifierRetouche('alice-multi',[source.id,source.id],'wood facade'));
});


test('pinceaux : protection prioritaire, inclusions, alpha et bornes', async () => {
  const {validerTraces,rasteriserMasque}=await import('../gateway/src/retouchePixels.ts');
  const edit={mode:'modifier',rayon:.08,points:[{x:.25,y:.5},{x:.75,y:.5}]};
  const protection={mode:'proteger',rayon:.04,points:[{x:.5,y:.5}]};
  const traces=validerTraces([protection,edit]);const masque=rasteriserMasque(100,60,traces);
  assert.equal(masque[30*100+50],0,'protection gagne quel que soit l’ordre');
  assert.equal(masque[30*100+30],1);assert.equal(masque[5*100+30],0,'hors inclusion protégé');
  const inverse=rasteriserMasque(100,60,[protection]);assert.equal(inverse[5*100+30],1);assert.equal(inverse[30*100+50],0);
  const source=new PNG({width:100,height:60});source.data.fill(213);const retouche=new PNG({width:100,height:60});retouche.data.fill(5);
  const sortie=lirePhoto(composerRetouche(source,retouche,1,undefined,masque));let exacts=0;
  for(let i=0;i<6000;i++){if(!masque[i]){assert.deepEqual(sortie.data.subarray(i*4,i*4+4),source.data.subarray(i*4,i*4+4));exacts++;}else{assert.equal(sortie.data[i*4],5);assert.equal(sortie.data[i*4+3],213);}}
  assert.ok(exacts>5000);
  for(const invalide of [[{...edit,rayon:NaN}],[{...edit,rayon:.9}],[{...edit,points:[{x:-1,y:0}]}],Array(65).fill(edit)])assert.throws(()=>validerTraces(invalide));
  assert.throws(()=>composerRetouche(source,retouche,1,undefined,new Uint8Array(10)));
});


test('atelier : trois variantes reprennent la même source et transportent les protections', async () => {
  const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/lib/retouche.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'passerelle-studio-jetable',setup(b){
    b.onResolve({filter:/^\.\/(endpoint|instance|atelierRetouche)$/},a=>({path:a.path,namespace:'studio-fixture'}));
    b.onLoad({filter:/.*/,namespace:'studio-fixture'},a=>({contents:a.path==='./endpoint'?'export const apiFetch=(...a)=>globalThis.appeler(...a);':a.path==='./instance'?'export const instance=()=>({url:"http://localhost:8795",remote:false});':'export const ouvrirAtelier=(...a)=>globalThis.preparer(...a);'}));
  }}]});
  const appels=[];let n=0;
  const contexte={module:{exports:{}},exports:{},URL,DOMException,setTimeout,clearTimeout,
    preparer:async()=>({plan:{cible:1,references:[],modifier:['bois'],conserver:['fenêtres'],instruction:'wood facade'},traces:[{mode:'proteger',rayon:.02,points:[{x:.5,y:.5}]}],variantes:3,verifier:true}),
    appeler:async(route,options)=>{const body=options?.body?JSON.parse(options.body):undefined;appels.push({route,body});if(route==='/helix/retouche/lancer'){n++;return {ok:true,json:async()=>({id:`job-${n}`,etat:'fait',message:'fait',image:{id:`image-${n}`,largeur:64,hauteur:64,description:'wood facade',parent:'source'}})};}if(route==='/helix/retouche/verifier')return{ok:true,json:async()=>({conforme:true,changements:['bois'],ecarts:[],conseil:'Vérifier visuellement.'})};throw new Error(route);},
  };
  vm.runInNewContext(bundle.outputFiles[0].text,contexte);
  const resultat=await contexte.module.exports.retoucherPhoto('wood facade',{source:'source'},()=>{});
  assert.equal(resultat.variantes.length,3);assert.equal(resultat.id,'image-1');
  const generations=appels.filter(a=>a.route.endsWith('/lancer'));
  assert.equal(generations.length,3);assert.ok(generations.every(a=>a.body.source==='source'&&a.body.traces[0].mode==='proteger'));
  assert.equal(appels.filter(a=>a.route.endsWith('/verifier')).length,3);assert.ok(resultat.variantes.every(v=>v.verification.conforme));
  const avant=appels.length;contexte.preparer=async()=>{throw new DOMException('annulé','AbortError')};
  await assert.rejects(contexte.module.exports.retoucherPhoto('wood facade',{source:'source'},()=>{}),/annulé/);assert.equal(appels.length,avant,'annuler le plan ne lance aucun calcul');
});


test('architecture : projets privés, palettes, références et conflits de révision', async()=>{
 const a=await import('../gateway/src/architecture.ts');const p=await a.creerProjet('arch-alice','Projet maison');const b=await a.creerProjet('arch-bob','Projet privé');
 assert.deepEqual((await a.listerProjets('arch-alice')).map(p=>p.id),[p.id]);assert.deepEqual((await a.listerProjets('arch-bob')).map(p=>p.id),[b.id]);
 await assert.rejects(a.sauverProjet('arch-bob',p,()=>{}),/introuvable/);
 const photo=images.importerPhoto('arch-alice',dataUrl);const ref=images.importerPhoto('arch-bob',dataUrl);
 const mat={id:'a'.repeat(32),nom:'Bois vertical',famille:'bois',couleur:'#bba58b',finition:'mat',pose:'verticale',dimensions:'45 mm',reference:'Fournie par le client',photo:photo.id};
 const suivant=await a.sauverProjet('arch-alice',{...p,palettes:[{id:'b'.repeat(32),nom:'Forêt',materiaux:[mat]}]},id=>images.historiqueRetouche('arch-alice',id));assert.equal(suivant.revision,1);
 await assert.rejects(a.sauverProjet('arch-alice',p,()=>{}),/changé/);
 await assert.rejects(a.sauverProjet('arch-alice',{...suivant,palettes:[{...suivant.palettes[0],materiaux:[{...mat,photo:ref.id}]}]},id=>images.historiqueRetouche('arch-alice',id)),/introuvable/);
 assert.throws(()=>a.validerProjet({...suivant,champInconnu:'intrus'}),/inconnu/);
 const courses=await Promise.allSettled([a.sauverProjet('arch-alice',{...suivant,notes:'A'},()=>{}),a.sauverProjet('arch-alice',{...suivant,notes:'B'},()=>{})]);assert.equal(courses.filter(c=>c.status==='fulfilled').length,1);assert.equal(courses.filter(c=>c.status==='rejected').length,1);
});
test('architecture : zones IA bornées et sans verrouillage implicite',async()=>{
 const {validerDetection}=await import('../gateway/src/analyseArchitecture.ts');
 const z={nom:'Façade',nature:'mur',x:.1,y:.2,largeur:.4,hauteur:.5,etat:'verrouille'};
 const d=validerDetection({zones:[z],incertitudes:['À vérifier']});assert.equal(d.zones[0].etat,'libre');assert.equal(d.zones[0].id,'zone-1');
 for(const zones of [[{...z,x:-.1}],[{...z,largeur:1}],[{...z,y:NaN}],Array(13).fill(z)])assert.throws(()=>validerDetection({zones,incertitudes:[]}));
 const {validerTraces,rasteriserMasque}=await import('../gateway/src/retouchePixels.ts');const edit={mode:'modifier',forme:'rectangle',rayon:.002,points:[{x:.2,y:.2},{x:.8,y:.8}]};const lock={mode:'proteger',forme:'rectangle',rayon:.002,points:[{x:.4,y:.4},{x:.6,y:.6}]};
 const masque=rasteriserMasque(100,100,validerTraces([lock,edit]));assert.equal(masque[50*100+50],0);assert.equal(masque[30*100+30],1);assert.equal(masque[5*100+5],0);
 assert.throws(()=>validerTraces([{...edit,forme:'triangle'}]));
});
test('architecture : palette active, consignes et sélection des références',async()=>{
 const bundle=await build({entryPoints:[fileURLToPath(new URL('../src/lib/architecture.ts',import.meta.url))],bundle:true,write:false,platform:'node',format:'cjs',plugins:[{name:'architecture-pure',setup(b){b.onResolve({filter:/^\.\/retouche$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const appelRetouche=()=>{throw new Error("HTTP interdit")};'}));}}]});const contexte={module:{exports:{}},exports:{}};vm.runInNewContext(bundle.outputFiles[0].text,contexte);const a=contexte.module.exports;const o=a.optionsArchitecture();o.typeSource='croquis';o.projet={palettes:[{id:'p',materiaux:[{id:'m',nom:'Chêne',famille:'bois',couleur:'#bb9944',pose:'vertical',dimensions:'45 mm',finition:'mat',reference:'X',photo:'ref'}]}]};o.palette='p';o.actifs=['m'];const txt=a.consigneArchitecture(o);assert.match(txt,/croquis/);assert.match(txt,/FIDELITE/);assert.match(txt,/45 mm/);const e=a.entreesArchitecture(['cible','ignore'],['cible','ignorer'],o);assert.equal(JSON.stringify(e.photos),JSON.stringify(['cible','ref']));assert.throws(()=>a.entreesArchitecture(['cible','a','b','c'],['cible','style','couleur','materiau'],o));
 const t=a.tracesDesZones([{x:.1,y:.1,largeur:.2,hauteur:.2,etat:'verrouille'},{x:0,y:0,largeur:1,hauteur:1,etat:'libre'}]);assert.equal(t.length,1);assert.equal(t[0].forme,'rectangle');assert.equal(t[0].mode,'proteger');
});
