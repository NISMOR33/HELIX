import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

for (const k of ['HELIX_IMAGES_DIR', 'HELIX_DATA_DIR', 'HELIX_TEST_PHOTO']) if (!process.env[k]) throw new Error(`${k} requis : utiliser des dossiers d'essai isolés.`);
const m = await import('../gateway/src/images.ts');
const { lirePhoto } = await import('../gateway/src/retouchePixels.ts');
const etat = await m.etatRetouche();
assert.equal(etat.pret, true, 'Installer un profil compatible avant cet essai GPU.');
const sortie = resolve(process.env.HELIX_TEST_OUTPUT ?? 'work/essai-retouche-gpu'); mkdirSync(sortie, { recursive: true });
const photo = readFileSync(process.env.HELIX_TEST_PHOTO);
const original = m.importerPhoto('essai-gpu', `data:image/png;base64,${photo.toString('base64')}`);
const empreinte = b => createHash('sha256').update(b).digest('hex');
const vue = await m.imageVisible(original.id, { userId: 'essai-gpu', email: 'gpu@example.test' });
const originalSha = empreinte(readFileSync(vue.chemin));
copyFileSync(vue.chemin, join(sortie, 'original.png'));
const debut = Date.now();
const fetchInitial = globalThis.fetch; let appelsReseau = 0;
globalThis.fetch = async () => { appelsReseau++; throw new Error('Essai hors ligne : accès HTTP interdit pendant l’inférence.'); };
const attendre = async tr => {
  let dernier = '';
  for (let n = 0; n < 2400; n++) {
    const t = m.travail(tr.id, 'essai-gpu');
    if (t.message !== dernier) { console.log(t.message); dernier = t.message; }
    if (['fait', 'echec'].includes(t.etat)) return t;
    await new Promise(r => setTimeout(r, 800));
  }
  m.annulerRetouche('essai-gpu', tr.id); throw new Error('Délai de test dépassé.');
};
try {
  const t1 = await attendre(await m.lancerRetouche('essai-gpu', original.id,
    'Change la couleur de la combinaison orange en noir. Conserve le visage, la pose, le cadrage et le fond.'));
  assert.equal(t1.etat, 'fait', t1.erreur);
  const v1 = await m.imageVisible(t1.image.id, { userId: 'essai-gpu', email: 'gpu@example.test' });
  copyFileSync(v1.chemin, join(sortie, 'retouche-1.png'));
  assert.equal(t1.image.parent, original.id); assert.equal(t1.image.original, original.id);
  assert.notEqual(empreinte(readFileSync(v1.chemin)), originalSha);
  assert.equal(empreinte(readFileSync(vue.chemin)), originalSha, 'Original intact');
  const t2 = await attendre(await m.lancerRetouche('essai-gpu', t1.image.id,
    'Add dark sunglasses on the face. Preserve the black suit, pose, framing and background.', { x: .30, y: .10, largeur: .24, hauteur: .25 }));
  assert.equal(t2.etat, 'fait', t2.erreur);
  assert.equal(t2.image.parent, t1.image.id); assert.equal(t2.image.original, original.id);
  const v2 = await m.imageVisible(t2.image.id, { userId: 'essai-gpu', email: 'gpu@example.test' });
  copyFileSync(v2.chemin, join(sortie, 'retouche-2.png'));
  const a = lirePhoto(readFileSync(v1.chemin)), b = lirePhoto(readFileSync(v2.chemin));
  let horsZone = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    if (x >= Math.floor(.30 * a.width) && x < Math.ceil(.54 * a.width) && y >= Math.floor(.10 * a.height) && y < Math.ceil(.35 * a.height)) continue;
    const i = (y * a.width + x) * 4;
    assert.deepEqual(a.data.subarray(i, i + 4), b.data.subarray(i, i + 4)); horsZone++;
  }
  assert.equal(m.historiqueRetouche('essai-gpu', original.id).length, 3);
  assert.equal(await m.imageVisible(t2.image.id, { userId: 'autre', email: 'autre@example.test' }), null);
  // Queued cancellation + active cancellation; neither may create a version.
  const t3 = await m.lancerRetouche('essai-gpu', t2.image.id, 'Change the background to a beach.');
  const t4 = await m.lancerRetouche('essai-gpu', t2.image.id, 'Add a blue scarf.');
  assert.equal(m.annulerRetouche('autre', t3.id), false);
  assert.equal(m.annulerRetouche('essai-gpu', t4.id), true);
  for (let n = 0; n < 100 && t3.etat === 'preparation'; n++) await new Promise(r => setTimeout(r, 100));
  await new Promise(r => setTimeout(r, 1500));
  const annulationDepuis = Date.now();
  assert.equal(m.annulerRetouche('essai-gpu', t3.id), true);
  assert.equal((await attendre(t3)).etat, 'echec'); assert.equal((await attendre(t4)).etat, 'echec');
  const delaiAnnulationMs = Date.now() - annulationDepuis;
  assert.ok(delaiAnnulationMs < 5000, `Le calcul doit s'arrêter réellement : ${delaiAnnulationMs} ms`);
  await new Promise(r => setTimeout(r, 1000));
  assert.equal(m.historiqueRetouche('essai-gpu', original.id).length, 3);
  assert.equal(appelsReseau, 0);
  let memoire;
  try { memoire = execFileSync('nvidia-smi', ['--query-gpu=memory.used,memory.free', '--format=csv,noheader,nounits'], { encoding: 'utf8', windowsHide: true }).trim(); } catch { memoire = 'indisponible'; }
  const bilan = { profil: etat.actif, materiel: etat.materiel, secondes: Math.round((Date.now() - debut) / 1000), original: original.id,
    version1: t1.image, version2: t2.image, originalIntact: true, pixelsHorsZoneVerifies: horsZone,
    historique: 3, annulationActive: true, delaiAnnulationMs, annulationEnFile: true, appelsHttpPendantInference: appelsReseau,
    vramApresCalculMo: memoire, limites: 'Appels HTTP JavaScript bloqués ; aucune règle pare-feu OS ajoutée. Inspection visuelle des PNG nécessaire pour juger le respect des instructions.' };
  writeFileSync(join(sortie, 'bilan-gpu.json'), JSON.stringify(bilan, null, 2));
  console.log('GPU_OK', JSON.stringify(bilan));
} finally { globalThis.fetch = fetchInitial; }
