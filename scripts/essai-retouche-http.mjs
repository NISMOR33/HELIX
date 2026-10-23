import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { PNG } from 'pngjs';
import { request as httpsRequest } from 'node:https';
import {dossierVide} from '../src/lib/maquetteGeometry.ts';

const racine = resolve(process.env.HELIX_TEST_DIR ?? 'work/essai-retouche-http');
mkdirSync(racine, { recursive: true });
const donnees = mkdtempSync(join(racine, 'donnees-'));
const serveur = createServer();
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const port = serveur.address().port; await new Promise(r => serveur.close(r));
const profil = join(donnees, 'profil.json');
writeFileSync(profil, JSON.stringify({ chiffrement: 'fichier', autoProvision: false, backends: [{ id: 'lmstudio', enabled: false }, { id: 'exo', enabled: false }] }));
const enfant = spawn(process.execPath, [resolve('dist-gateway/index.cjs')], {
  env: { ...process.env, HELIX_CONFIG: profil, HELIX_DATA_DIR: donnees, HELIX_IMAGES_DIR: join(donnees, 'modeles'),
    HELIX_GATEWAY_PORT: String(port), HELIX_GATEWAY_HOST: '127.0.0.1', HELIX_SANS_MISE_A_JOUR: '1' },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
let log = ''; enfant.stdout.on('data', b => { log = (log + b).slice(-4000); }); enfant.stderr.on('data', b => { log = (log + b).slice(-4000); });
const base = `http://127.0.0.1:${port}`;
let checks = 0;
const verifier = (nom, v) => { assert.ok(v, nom); checks++; console.log(`OK ${nom}`); };
try {
  for (let i = 0; i < 100; i++) {
    if (enfant.exitCode !== null) throw new Error(`Passerelle arrêtée : ${log}`);
    if (existsSync(join(donnees, 'instance-token'))) {
      try { await fetch(`${base}/health`); break; } catch { /* démarre */ }
    }
    await new Promise(r => setTimeout(r, 150));
  }
  const jeton = readFileSync(join(donnees, 'instance-token'), 'utf8').trim();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` };
  const post = (route, body, h = headers) => fetch(`${base}${route}`, { method: 'POST', headers: h, body: JSON.stringify(body) });
  const routes = ['', 'installer', 'desinstaller', 'importer', 'lancer', 'annuler', 'historique', 'regler', 'planifier', 'verifier', 'detecter', 'projet-creer', 'projet-sauver','maquette-sauver','maquette-lire'];
  for (const action of routes) {
    const r = action ? await post(`/helix/retouche/${action}`, {}) : await fetch(`${base}/helix/retouche`, { headers });
    verifier(`séance exigée : ${action || 'état'}`, r.status === 401);
  }
  verifier("agent : séance exigée", (await post("/helix/orienter", {})).status === 401);
  const cree = await post('/helix/auth/create', { fullName: 'Essai local', email: 'retouche-a@example.test', password: 'Retouche2Test!2026' });
  const a = await cree.json();
  verifier('création du compte jetable', cree.status === 200 && a.session?.token);
  const ha = { ...headers, 'X-Helix-Session': a.session.token };
  verifier("agent : contexte invalide refusé", (await post("/helix/orienter", {}, ha)).status === 409);
  const sansModele = await post("/helix/orienter", { texte: "salut", photoJointe: false, derniereImage: false, historique: [] }, ha);
  verifier("agent : absence de modèle local signalée sans repli distant", sansModele.status === 409 && (await sansModele.json()).error?.message?.includes("local"));
  const b = await (await post('/helix/auth/create', { fullName: 'Autre compte', email: 'retouche-b@example.test', password: 'Retouche2Provisoire!2026' }, ha)).json();
  const loginB = await (await post('/helix/auth/mot-de-passe-provisoire', { accountId: b.account.id, password: 'Retouche2Provisoire!2026', nouveau: 'Retouche2Personnel!2026' })).json();
  const hb = { ...headers, 'X-Helix-Session': loginB.session.token };
  verifier('installation réservée à l’administrateur', (await post('/helix/retouche/installer', { profil: 'leger' }, hb)).status === 403);
  const png = new PNG({ width: 64, height: 64 }); png.data.fill(120);
  const photo = `data:image/png;base64,${PNG.sync.write(png).toString('base64')}`;
  const r = await post('/helix/retouche/importer', { photo }, ha); const source = await r.json();
  verifier('import PNG normalisé', r.status === 201 && /^[a-f0-9]{32}$/.test(source.id));
  const brouillon={...dossierVide(),plan:{photo:source.id,nom:'plan.png',largeur:64,hauteur:64}};
  const mq=await (await post('/helix/retouche/maquette-sauver',{dossier:brouillon},ha)).json();
  verifier('maquette : création privée',/^[a-f0-9]{32}$/.test(mq.id)&&mq.revision===1);
  verifier('maquette : liste inaccessible sans séance',(await fetch(`${base}/helix/retouche/maquettes`,{headers})).status===401);
  const listeB=await (await fetch(`${base}/helix/retouche/maquettes`,{headers:hb})).json();
  verifier('maquette : bibliothèque isolée',Array.isArray(listeB)&&listeB.length===0);
  verifier('maquette : modification du dossier d’autrui refusée',(await post('/helix/retouche/maquette-sauver',{dossier:mq},hb)).status===409);
  verifier('maquette : photo d’autrui refusée à la création',(await post('/helix/retouche/maquette-sauver',{dossier:brouillon},hb)).status===409);
  verifier('maquette : mise à jour propriétaire',(await post('/helix/retouche/maquette-sauver',{dossier:mq},ha)).status===200);
  verifier('maquette : révision périmée refusée',(await post('/helix/retouche/maquette-sauver',{dossier:mq},ha)).status===409);
  verifier('maquette : lecture privée refusée à autrui',(await post('/helix/retouche/maquette-lire',{photo:source.id,type:'plan'},hb)).status===409);
  verifier('maquette : type de lecture invalide refusé',(await post('/helix/retouche/maquette-lire',{photo:source.id,type:'invalide'},ha)).status===409);
  verifier('maquette : cadre hors image refusé avant lecture IA',(await post('/helix/retouche/maquette-lire',{photo:source.id,type:'facade',cadre:{x:.8,y:0,largeur:.5,hauteur:1}},ha)).status===409);
  const toit={id:'c'.repeat(32),nom:'Volume décalé',cadre:{x:.1,y:.1,largeur:.8,hauteur:.8},type:'deux-pans',axe:'x',releve:2,confirmee:false};
  verifier('maquette : sauvegarde des volumes de toiture',(await post('/helix/retouche/maquette-sauver',{dossier:{...mq,revision:2,toitures:[toit]}},ha)).status===200);
  const sauvegardes=await (await fetch(`${base}/helix/retouche/maquettes`,{headers:ha})).json();
  verifier('maquette : relecture de la toiture sans validation implicite',sauvegardes[0]?.toitures?.[0]?.releve===2&&sauvegardes[0]?.toitures?.[0]?.confirmee===false);
  const owner = await fetch(`${base}/helix/images/fichier/${source.id}`, { headers: ha });
  verifier('photo accessible au propriétaire et sans cache', owner.status === 200 && owner.headers.get('cache-control') === 'no-store' && owner.headers.get('content-type') === 'image/png');
  verifier('photo inaccessible à un autre compte', (await fetch(`${base}/helix/images/fichier/${source.id}`, { headers: hb })).status === 404);
  verifier('historique inaccessible à un autre compte', (await post('/helix/retouche/historique', { id: source.id }, hb)).status === 409);
  verifier('retouche de la photo d’autrui refusée', (await post('/helix/retouche/lancer', { source: source.id, instruction: 'change shirt' }, hb)).status === 409);
  verifier('référence URL externe refusée', (await post('/helix/retouche/importer', { photo: 'https://example.test/private.png' }, ha)).status === 409);
  verifier('traversée de chemin refusée', (await post('/helix/retouche/lancer', { source: '../secret', instruction: 'edit' }, ha)).status === 409);
  verifier('plan : référence privée refusée à un autre compte', (await post('/helix/retouche/planifier',{photos:[source.id],instruction:'bois'},hb)).status===409);
  verifier('plan : plus de quatre photos refusées', (await post('/helix/retouche/planifier',{photos:Array(5).fill(source.id),instruction:'bois'},ha)).status===409);
  verifier('référence URL externe de retouche refusée', (await post('/helix/retouche/lancer',{source:source.id,instruction:'bois',references:['https://example.test/photo.png']},ha)).status===409);
  verifier('vérification : photos privées refusées à un autre compte', (await post('/helix/retouche/verifier',{avant:source.id,apres:source.id,instruction:'bois'},hb)).status===409);
  verifier('masque invalide refusé avant calcul', (await post('/helix/retouche/lancer',{source:source.id,instruction:'bois',traces:[{mode:'proteger',rayon:.5,points:[{x:0,y:0}]}]},ha)).status===409);
  verifier('rôles invalides refusés', (await post('/helix/retouche/planifier',{photos:[source.id],instruction:'bois',roles:['style']},ha)).status===409);
  verifier('détection : photo d’autrui refusée', (await post('/helix/retouche/detecter',{photo:source.id},hb)).status===409);
  const projet=await (await post('/helix/retouche/projet-creer',{nom:'Maison test'},ha)).json();
  verifier('architecture : création de projet privé', /^[a-f0-9]{32}$/.test(projet.id));
  const chezB=await (await fetch(`${base}/helix/retouche/projets`,{headers:hb})).json();
  verifier('architecture : autre propriétaire ne voit pas le projet', Array.isArray(chezB)&&!chezB.some(p=>p.id===projet.id));
  verifier('architecture : modification du projet d’autrui refusée', (await post('/helix/retouche/projet-sauver',{projet},hb)).status===409);
  verifier('architecture : sauvegarde du propriétaire', (await post('/helix/retouche/projet-sauver',{projet:{...projet,notes:'Conserver les baies'}},ha)).status===200);
  verifier('architecture : conflit de révision signalé', (await post('/helix/retouche/projet-sauver',{projet},ha)).status===409);
  verifier('modèle absent signalé'   , (await post('/helix/retouche/lancer', { source: source.id, instruction: 'change shirt' }, ha)).status === 409);
  const e = await (await fetch(`${base}/helix/retouche`, { headers: ha })).json();
  verifier('diagnostic et profils accessibles sans télécharger', Array.isArray(e.profils) && e.profils.length === 3 && e.pret === false);
  verifier('génération existante toujours protégée', (await post('/helix/images/creer', { description: 'test' })).status === 401);
  // The same authenticated owner must lose access when this gateway is shared.
  enfant.kill(); await new Promise(r => enfant.exitCode !== null || enfant.signalCode !== null ? r() : enfant.once('exit', r));
  const partage = join(donnees, 'partage.json');
  writeFileSync(partage, JSON.stringify({ share: true, chiffrement: 'fichier', autoProvision: false, backends: [{ id: 'lmstudio', enabled: false }, { id: 'exo', enabled: false }] }));
  const reseau = spawn(process.execPath, [resolve('dist-gateway/index.cjs')], { env: { ...process.env, HELIX_CONFIG: partage, HELIX_DATA_DIR: donnees, HELIX_IMAGES_DIR: join(donnees, 'modeles'), HELIX_GATEWAY_PORT: String(port), HELIX_GATEWAY_HOST: '127.0.0.1' }, stdio: 'ignore', windowsHide: true });
  try {
    // Sharing automatically enables TLS. Trust only this fixture's certificate;
    // never turn off certificate verification, including in a test.
    const requetePartagee = (route, corps) => new Promise((ok, ko) => {
      const q = httpsRequest(`https://127.0.0.1:${port}${route}`, { method: corps ? 'POST' : 'GET', headers: ha, ca: readFileSync(join(donnees, 'tls', 'instance-cert.pem')) }, r => { r.resume(); r.once('end', () => ok(r.statusCode)); });
      q.on('error', ko); q.end(corps ? JSON.stringify(corps) : undefined);
    });
    for (let i = 0; i < 100; i++) {
      try { await requetePartagee('/health'); break; } catch { await new Promise(r => setTimeout(r, 100)); }
    }
    verifier('instance partagée : agent privé fermé', await requetePartagee('/helix/orienter', { texte:'salut', photoJointe:false, derniereImage:false, historique:[] }) === 403);
    verifier('instance partagée : diagnostic de retouche fermé' , await requetePartagee('/helix/retouche') === 403);
    verifier('instance partagée : import privé fermé', await requetePartagee('/helix/retouche/importer', { photo }) === 403);
    verifier('instance partagée : bibliothèque maquettes fermée',await requetePartagee('/helix/retouche/maquettes')===403);
    verifier('instance partagée : sauvegarde maquettes fermée',await requetePartagee('/helix/retouche/maquette-sauver',{dossier:mq})===403);
    verifier('instance partagée : photo privée fermée même au propriétaire', await requetePartagee(`/helix/images/fichier/${source.id}`) === 403);
  } finally { reseau.kill(); await new Promise(r => reseau.exitCode !== null || reseau.signalCode !== null ? r() : reseau.once('exit', r)); }
  console.log(`${checks} vérifications HTTP réussies.`);
} finally {
  enfant.kill();
  await new Promise(r => { if (enfant.exitCode !== null || enfant.signalCode !== null) r(); else enfant.once('exit', r); });
}
