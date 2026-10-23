import { apiFetch } from "./endpoint";
export type DecisionAgent = { action: "chat" | "reflexion" | "creer_image" | "retoucher_image" | "photo_manquante"; source: "jointe" | "derniere" | "original" | "aucune"; modele: string; instruction?: string };
export async function demanderOrientation(texte: string, photoJointe: boolean, derniereImage: boolean, historique: { role: string; content: string }[], signal: AbortSignal, descriptionImage?: string): Promise<DecisionAgent> {
  const r = await apiFetch("/helix/orienter", { method: "POST", headers: { "Content-Type": "application/json" }, signal,
    body: JSON.stringify({ texte, photoJointe, derniereImage, ...(descriptionImage ? { imageRecente: { description: descriptionImage.slice(0,1800) } } : {}), historique: historique.filter(m => m.role === "user" || m.role === "assistant").slice(-8).map(m => ({ role: m.role, content: m.content.slice(0, 1800) })) }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(b.error?.message ?? "Agent routeur indisponible.");
  if (!["chat", "reflexion", "creer_image", "retoucher_image", "photo_manquante"].includes(b.action) || !["jointe", "derniere", "original", "aucune"].includes(b.source)) throw new Error("Décision du routeur invalide.");
  return b as DecisionAgent;
}
