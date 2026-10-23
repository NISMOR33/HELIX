# Photo, architecture et maquette

## Parcours du chat

Le routeur local distingue discussion, réflexion, création d’image et retouche. Pour une retouche, une image jointe est prioritaire ; sinon le chat peut reprendre la dernière image de la conversation. Une absence de source doit être signalée.

`useChat.ts` demande le mode automatique à `retoucherPhoto`. `choixRetouche.ts` choisit alors la planification locale, sans émettre l’événement d’ouverture de l’atelier. Le plan indique la cible, les références, les changements et les éléments à conserver. Le client lance une variante et la vérification visuelle, puis affiche le résultat sans exposer le plan technique. La vérification est indicative et accessible dans les détails.

L’atelier explicite conserve ses masques, palettes, variantes et confirmations. Le même moteur de génération sert les deux parcours.

## Attente et résultats

`ImageEnCours.tsx` affiche une carte animée pendant le traitement. La photo floutée reste la **source**, pas une trame générée. Sans source, un fond abstrait accompagne l’attente. Le moteur ne fournit pas de prévisualisation progressive. Seules les étapes réellement annoncées alimentent la barre déterminée. Les animations sont désactivées par `prefers-reduced-motion`.

## Plan et élévations

Les documents acceptés sont des images PNG, JPEG et WebP, pas un import DWG/DXF. Le plan est étalonné par une distance connue, puis son contour est tracé. Chaque capture de façade est cadrée sur le mur correspondant. Son sens peut être inversé et les ouvertures corrigées en mètres.

La lecture locale propose des coordonnées. Sur une capture CAO sombre, `lectureCAD.ts` adapte le contraste et conserve la transformation du cadrage. Les propositions apparaissent en rouge ; elles ne remplacent pas le tracé avant application explicite. Le modèle peut encore confondre des meubles, du bardage ou des véhicules avec des éléments du bâtiment.

`maquetteGeometry.ts` produit un maillage déterministe. Les fenêtres et portes rectangulaires sont des découpes du mur ; les contours concaves sont triangulés. `toituresComposees.ts` découpe les pans de toiture sur l’empreinte et traite plusieurs zones rectangulaires sans chevauchement. Les quatre perspectives et les élévations parallèles utilisent ce même maillage. L’OBJ est exporté en mètres.

## Données

Les documents et études sont privés par compte. La collection interne `maquettes` n’est pas diffusée par les routes ordinaires de synchronisation. La sauvegarde vérifie la propriété des images et la révision du dossier. Les routes de retouche privée et les maquettes associées nécessitent une instance locale non partagée.

Une étude JSON peut inclure les PNG : l’import les réenregistre dans le compte connecté. Sans photos incluses, les identifiants ne sont portables qu’avec les données du compte et du poste correspondants.

## Limites à garder visibles

- Les confirmations valident une saisie ; elles ne certifient pas un relevé réel.
- Les hauteurs et les façades non documentées restent inconnues ou hypothétiques.
- Une hauteur de murs commune, des contours simples et des zones de toiture rectangulaires sont pris en charge. Les cours fermées, étages de contours différents, lucarnes et ouvertures de pignon ne le sont pas.
- Les murs peuvent se recouper aux jonctions. L’OBJ n’est pas un solide BIM de fabrication.
- Les directions des vues suivent les axes du plan ; elles ne déterminent pas le nord géographique.
- Les rendus IA peuvent déplacer des détails. Une préservation exacte concerne uniquement les pixels protégés par le masque appliqué au résultat.

## Validation

Au moment de cette publication : 40 tests unitaires réussis et 60 contrôles HTTP réussis dans l’environnement local de développement. Les tests du chat couvrent le mode autonome, l’atelier explicite, les plans invalides et l’annulation. Le parcours client a aussi été manipulé avec une API simulée ; aucune nouvelle génération native complète n’a été effectuée pour la dernière modification du chat.

Ces résultats ne signifient pas que toutes les fonctions historiques de l’application, tous les systèmes d’exploitation ou toutes les cartes graphiques ont été testés.
