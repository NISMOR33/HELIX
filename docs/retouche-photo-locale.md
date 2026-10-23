# Retouche photo locale

Cette extension complète la génération d'images et de vidéos existante. Elle utilise
la photo comme entrée de référence (`sd-cli -r`), et non seulement son nom dans un
prompt texte. Aucun service cloud ne classe les demandes ni ne traduit les instructions.

Dans le Chat : **+ → Modifier une image**, joindre une photo, décrire le changement.
Une demande explicite avec photo (« Modifie cette photo… », « Transforme-moi en
figurine Playmobil… ») est également reconnue sans activer le bouton. Les demandes
suivantes utilisent la dernière retouche ; les boutons de l'historique permettent de
reprendre une ancienne version ou de repartir de l'original. La reconnaissance est
déterministe et limitée aux formulations couvertes ; le bouton explicite reste disponible.

## Installation et matériel

Réglages → Modèles locaux → **Retouche photo locale**. L'administrateur choisit un
profil puis Installer. Les téléchargements reprennent et sont contrôlés par SHA-256.
Les fichiers déjà présents sont revérifiés ; une erreur reste affichée et peut être
reprise avec Installer / Réparer. Ni Python ni ComfyUI ne sont nécessaires.

| Profil | Modèle | RAM totale minimum PC | VRAM NVIDIA minimum | Mémoire Apple Silicon |
|---|---|---:|---:|---:|
| Léger | FLUX.2 klein 4B Q4 | 16 Go | 6 Go | 16 Go |
| Équilibré | Qwen-Image-Edit-2511 Q4_K_M | 32 Go | 24 Go | 48 Go |
| Qualité maximale | Qwen-Image-Edit-2511 Q8_0 | 64 Go | 48 Go | 64 Go |

Ce sont des seuils de sélection prudents, pas une certification de tous les GPU.
Léger a été essayé le 22 octobre 2026 sur Windows x64, NVIDIA RTX A2000 12 Go,
31,7 Go de RAM, pilote 566.03. Les deux profils Qwen et Apple Silicon n'ont pas été
essayés sur GPU ici. AMD/Intel/DirectML ne sont pas proposés : leur mémoire utilisable
n'est pas détectée de manière fiable par l'architecture existante. Aucun modèle
de retouche n'est proposé au CPU seul. macOS 15 est refusé car son ancien moteur
épinglé n'est pas le contrat d'édition vérifié ; macOS 26 utilise le moteur actuel.

Moteur réutilisé : **stable-diffusion.cpp master-908-88411ef**, licence MIT,
archives officielles du catalogue existant, empreintes épinglées. Les exemples
d'édition FLUX.2 et Qwen ont été vérifiés dans les sources de ce tag. Qwen 2511
utilise notamment `--model-args qwen_image_zero_cond_t=true` et un encodeur visuel.
Les profils Qwen emploient les quantifications Unsloth à la révision
`0d33d9692b4b26212297240d87b0d4719aa4fd06`. Les encodeurs, VAE et modèles légers
réutilisent les révisions et empreintes du catalogue d'images existant.

Sources et licences :

- [Qwen-Image-Edit-2511, Apache-2.0](https://huggingface.co/Qwen/Qwen-Image-Edit-2511)
- [Quantifications Unsloth, Apache-2.0](https://huggingface.co/unsloth/Qwen-Image-Edit-2511-GGUF)
- [FLUX.2 klein 4B, Apache-2.0](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B)
- [stable-diffusion.cpp, MIT](https://github.com/leejet/stable-diffusion.cpp/tree/master-908-88411ef)
- [pngjs 7.0.0, MIT](https://www.npmjs.com/package/pngjs/v/7.0.0) ; types 6.0.5, MIT.

L'espace disque est vérifié avant téléchargement, avec une réserve de travail.
Le profil Léger télécharge environ 6,2 Go moteur CUDA compris sur un poste vierge.
La section affiche stockage, espace occupé, RAM, VRAM, consommation GPU, état des
travaux et résolution. La résolution de travail est réglable dans les limites du
profil. Réparer réinstalle **la version intégrée et épinglée** : la découverte et la
migration automatiques vers de nouvelles versions de modèles ne sont pas implémentées.

## Confidentialité et accès

- L'interface refuse l'envoi vers une instance distante **avant** de transmettre
  la photo. Le gateway refuse également les routes de retouche en dehors de la
  boucle locale et sur une instance configurée pour le réseau.
- Une séance nominative est obligatoire. Installation, réglages et suppression
  des modèles sont réservés à l'administrateur.
- Les photos importées et leurs dérivées sont privées pour leur propriétaire,
  même si la conversation est partagée. Les fichiers privés ne sont pas servis
  par un gateway partagé, même à leur propriétaire, et sont envoyés avec no-store.
- Les API n'acceptent ni chemin local fourni par le client ni URL de photo. Un
  identifiant aléatoire validé et une propriété vérifiée sont nécessaires.
- Décodage PNG borné, CRC contrôlé, normalisation sans métadonnées. Les JPEG,
  WebP et GIF sont convertis dans le navigateur avant import ; première image
  seulement pour un GIF animé. Les pièces jointes actuelles sont réduites à 2048 px.
- Les messages de retouche sont marqués `retouchePrivee` et exclus de l'historique
  envoyé ultérieurement à un modèle de conversation. Les octets des photos ne sont
  jamais ajoutés à cet historique.
- Le processus natif est lancé avec une liste d'arguments, sans shell ni serveur
  d'inférence réseau. Aucune télémétrie n'est ajoutée. Les journaux d'audit ne
  contiennent ni photo ni instruction.
- Les fichiers et le registre vivent dans le stockage des images existant et sont
  retirés par l'effacement du compte ; les autorisations applicatives restent en vigueur.

## Calcul, versions et sélection

La file accepte quatre retouches ; le GPU exécute une tâche à la fois. Une génération
déjà commencée peut terminer avant la première retouche. Les réservations empêchent
une génération concurrente et la désinstallation pendant un calcul. Chaque retouche
possède un parent et un original, dans le registre persistant. Le comparateur, les
téléchargements et les boutons de reprise utilisent ces références.

L'arrêt annule une tâche en file ou termine le processus natif actif et supprime sa
sortie provisoire. Un délai limite de 30 minutes arrête les tâches bloquées. Le processus
se ferme après chaque calcul, libérant sa mémoire GPU. Les erreurs de modèle incomplet,
de mémoire, de disque et de décodage sont remontées à l'interface.

La sélection actuelle est **rectangulaire**. Le modèle produit une édition de référence
globale ; le résultat est recomposé sur la photo importée dans la zone choisie.
Hors de cette zone, les pixels RGBA de cette copie importée sont strictement conservés.
Cela ne constitue pas un inpainting natif à masque ni une garantie de conservation
du visage à l'intérieur de la zone. Les bords peuvent être visibles. L'intensité règle
le mélange du résultat avec la photo, pas le débruitage du modèle. Un changement
de cadrage demandé au modèle peut donner un composite moins cohérent.

Le fichier original sur le disque de l'utilisateur n'est jamais modifié. L'« original »
de l'historique est la **copie normalisée importée** ; il ne conserve ni tous les octets
du JPEG initial ni sa résolution au-delà de la limite de pièces jointes. La sortie
conserve les dimensions de cette copie, par remise à l'échelle sur sa grille ; elle
n'ajoute pas de vrai détail haute résolution. L'image globale peut dériver en dehors
d'une sélection lorsqu'aucune zone n'est définie.

Les tâches en mémoire ne reprennent pas après un redémarrage du gateway. Les versions
terminées restent sur disque. Les pages de comparaison sont isolées du calcul. La
relecture automatique de l'historique d'une ancienne bulle se fait à son montage ;
une version nouvelle reste également visible dans sa propre bulle.

## Vérification

```sh
npm ci
npm run build
npm run essai:retouche
npm run essai:retouche:http
```

Le test HTTP crée des comptes et des données jetables, puis vérifie aussi le refus
sur une instance partagée en HTTPS, en faisant confiance uniquement au certificat
de ce test. Il ne désactive pas la vérification TLS.

Le test GPU exige des chemins explicites pour éviter les données personnelles :
`HELIX_IMAGES_DIR` (profil déjà installé), `HELIX_DATA_DIR` (données jetables),
`HELIX_TEST_PHOTO` (PNG de test), `HELIX_TEST_OUTPUT` (résultats), puis
`npm run essai:retouche:gpu`.

Essais réels : combinaison orange → noire avec instruction française ; ajout de
lunettes sur la version précédente avec une zone ; transformation en figurine de
type Playmobil. Photo de test : Eileen Collins, NASA, distribuée par scikit-image
([provenance et domaine public](https://scikit-image.org/docs/stable/api/skimage.data.html#skimage.data.astronaut)).
L'examen visuel confirme une modification de la photo source ; il ne mesure pas une
fidélité d'identité universelle.

Le test bloque les appels HTTP JavaScript durant l'inférence et vérifie qu'il n'y
en a aucun. Le moteur natif utilise les fichiers installés. Aucun essai de blocage
par pare-feu Windows ni de déconnexion physique n'a été effectué.

## Choix automatique à chaque message

Le chat dirige les demandes courantes vers la création ou la retouche sans modèle
classificateur distant. Une photo jointe est prioritaire ; sinon la dernière image
fixe générée ou retouchée sert de source. « Repars de l’original » utilise la racine
de l’historique. Le bouton « Modifier à nouveau » permet de choisir une image plus
ancienne ; il retire les pièces jointes en attente pour éviter de les reprendre à
sa place. Les modes manuels d’image et de retouche se terminent après l’envoi.
Un message suivant comme « merci » revient donc à la conversation.

Pour une question avec photo, le chat recherche un modèle de vision disponible.
Pour une demande explicite de réflexion, il recherche un modèle de raisonnement et
augmente l’effort. Il conserve le même backend que le modèle choisi, et choisit
uniquement un modèle local quand aucune préférence n’existe. Aucun fournisseur
cloud supplémentaire, modèle entraîné ou modèle déclaré défaillant n’est choisi
automatiquement. Si la combinaison vision/raisonnement manque, la vision prime.
Cela utilise les modèles déjà disponibles ; aucun modèle de conversation n’est
téléchargé en silence. La détection des intentions est fondée sur des règles et
peut manquer des formulations ambiguës ; les boutons manuels restent disponibles.

Test supplémentaire sur GPU : génération d’un robot rouge, retouche en bleu,
puis ajout d’un chapeau, avec historique et isolation du propriétaire vérifiés.

## Agent routeur (remplace le routage automatique par règles)

La version courante utilise POST /helix/orienter, authentifié et limité à l’instance
locale sans partage. Un modèle de conversation local choisit l’action via JSON
contraint. L’agent ne reçoit pas les pixels, ne sélectionne pas de fichier arbitraire
et ne génère pas de réponse utilisateur. Le front exécute l’action choisie avec
les outils existants ; il garde les contrôles manuels comme accès direct.
Une photo jointe prime ; sinon la dernière image fixe du Chat est reprise.
L’absence de source donne un message de photo manquante, sans appel au moteur.
Une décision inconnue ou un routeur indisponible produit une erreur explicite,
sans remplacement silencieux par un modèle cloud. La classification peut se tromper,
et la retouche peut affecter des objets proches même si l’instruction ne les vise pas.


### Précisions de style et contexte d’image

Le routeur reçoit aussi imageRecente.description (1 800 caractères maximum), pour
résoudre les précisions sans sujet explicite. Une sortie instruction de 2 400
caractères maximum accompagne la décision. Pour la retouche, la consigne exacte
saisie reste prioritaire sur les précisions reformulées. Le message enregistré
reste celui saisi par l’utilisateur. Cela corrige la création d’un portrait sans
rapport lorsqu’un message demandait simplement plus de réalisme sur un avion.
