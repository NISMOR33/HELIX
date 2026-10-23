/** Local intent routing: no photo or prompt is sent to a classifier. */
function normaliser(texte: string): string {
  return texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, " ");
}
export function demandeCreationImage(texte: string): boolean {
  const t = normaliser(texte);
  if (/\b(comment|pourquoi|explique|peux tu m expliquer)\b/.test(t)) return false;
  if (/\b(ne|pas|sans)\s+(?:me\s+)?(?:cree|creer|genere|generer)\b/.test(t)) return false;
  return /\b(?:cree|creer|crees|genere|generer|dessine|dessiner|create|generate|draw)\b.{0,65}\b(?:image|photo|illustration|dessin|portrait|affiche|logo|picture)\b/.test(t)
    || /\b(?:fais|faire|veux|voudrais)\b.{0,30}\b(?:une|un|nouvelle|nouveau)\s+(?:nouvelle?\s+)?(?:image|photo|illustration|dessin|portrait|affiche|logo)\b/.test(t);
}
export function demandeRetouche(texte: string, photoDisponible: boolean): boolean {
  const t = normaliser(texte);
  if (/\b(?:ne|sans|pas)\b.{0,25}\b(?:modifi\w*|retouch\w*|chang\w*|transform\w*)\b/.test(t)) return false;
  if (!photoDisponible || /\b(?:comment|explique|pourquoi|decris|analyse|que vois|qu est ce)\b/.test(t)) return false;
  if (/\b(?:mot de passe|adresse mail|compte|code python|code javascript|mon texte|ta memoire|mon agenda|le calendrier|un rappel|une tache|un email)\b/.test(t)) return false;
  if (demandeCreationImage(texte) && !/\b(?:cette|celle|la meme|a partir|sur la|ma photo|mon image)\b/.test(t)) return false;
  return /\b(?:retouch\w*|modifi\w*|remplac\w*|supprim\w*|enleve\w*|retir\w*|ajout\w*|chang\w*|amelior\w*|eclaircis|assombris|mets|mettez|transform\w*|rends|habille|convert|turn|edit|remove|replace|add|enhance|brighten|reprend\w*|repart\w*|refais)\b/.test(t)
    || /\b(?:fais|faire|faites)\b.{0,35}\b(?:en|comme)\b/.test(t)
    || /\b(?:plus|moins)\s+(?:clair|sombre|realiste|lumineux|rouge|bleu|grand|petit|net)\b/.test(t)
    || /\b(?:en|plus|moins)\s+(?:rouge|bleu|vert|noir et blanc|playmobil|figurine|dessin anime|realiste)\b/.test(t)
    || /\b(?:je veux|je voudrais)\b.{0,50}\b(?:fond|lunettes|cheveux|sourire|couleur|noir et blanc)\b/.test(t);
}
export function demandeReflexion(texte: string): boolean {
  return /\b(?:reflechis|raisonne|raisonnement|demontre|resous|resolution|calcule|analyse approfondie|etape par etape)\b/.test(normaliser(texte));
}
export function sourcePourRetouche<T extends { id: string; original?: string }>(texte: string, image?: T): string | undefined {
  return /\b(?:originale?|depart|initiale?)\b/.test(normaliser(texte)) ? image?.original ?? image?.id : image?.id;
}
export function modeleConversation<T extends { uid: string; backendId: string; origine?: string; roles: string[]; reasoning?: boolean; entraine?: boolean; surCetteMachine?: { etat: string } }>(modeles: T[], prefere: string | undefined, texte: string, photo: boolean): string | undefined {
  const courant = modeles.find(m => m.uid === prefere);
  const candidats = modeles.filter(m => (m.roles.includes("chat") || m.roles.includes("code")) && !m.entraine && m.surCetteMachine?.etat !== "defaillant" && (courant ? m.backendId === courant.backendId : m.origine === "local" || m.backendId === "lmstudio"));
  const convient = (m: T) => (!photo || m.roles.includes("vision")) && (!demandeReflexion(texte) || m.reasoning);
  if (!demandeReflexion(texte) && courant?.reasoning) {
    const simple = candidats.find(m => !m.reasoning && (!photo || m.roles.includes("vision")));
    if (simple) return simple.uid;
  }
  return courant && convient(courant) ? courant.uid : candidats.find(convient)?.uid ?? (photo ? candidats.find(m => m.roles.includes("vision"))?.uid : undefined) ?? prefere;
}
