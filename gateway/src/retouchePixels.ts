import { PNG } from "pngjs";

/** Only decoded, bounded PNGs reach the native inference process. */
export function lirePhoto(octets: Buffer): PNG {
  if (octets.length < 33 || octets.length > 20 * 1024 * 1024 ||
      !octets.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("Photo PNG invalide ou trop volumineuse (20 Mo maximum).");
  }
  const w = octets.readUInt32BE(16), h = octets.readUInt32BE(20);
  if (!w || !h || w > 4096 || h > 4096 || w * h > 8_388_608) {
    throw new Error("Photo trop grande : maximum 4096 pixels par côté et 8 mégapixels.");
  }
  try { return PNG.sync.read(octets, { checkCRC: true }); }
  catch { throw new Error("La photo est corrompue ou son format PNG est incompatible."); }
}

export function photoDepuisDataUrl(value: unknown): PNG {
  if (typeof value !== "string" || value.length > 28_000_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error("Joignez une photo PNG valide.");
  }
  return lirePhoto(Buffer.from(value.slice(value.indexOf(",") + 1), "base64"));
}

export interface Zone { x: number; y: number; largeur: number; hauteur: number }
export function validerZone(value: unknown): Zone | undefined {
  if (value === undefined || value === null) return undefined;
  const z = value as Zone;
  if (![z.x, z.y, z.largeur, z.hauteur].every(v => typeof v === "number" && Number.isFinite(v)) ||
      z.x < 0 || z.y < 0 || z.largeur <= 0 || z.hauteur <= 0 || z.x + z.largeur > 1.000001 || z.y + z.hauteur > 1.000001) {
    throw new Error("Zone de retouche invalide.");
  }
  return { x: z.x, y: z.y, largeur: z.largeur, hauteur: z.hauteur };
}

/** Same framing, dimensions divisible by 16; never silently square-crop a portrait. */
export function dimensionsRetouche(w: number, h: number, cote: number): [number, number] {
  const ratio = Math.min(1, cote / Math.max(w, h));
  return [Math.max(64, Math.round(w * ratio / 16) * 16), Math.max(64, Math.round(h * ratio / 16) * 16)];
}

/** Composite onto the source grid. Outside a selection, pixels remain byte-identical.
 * This is a rectangular composite, not a claim of model-native masked inpainting.
 */
export function composerRetouche(source: PNG, resultat: PNG, intensite: number, zone?: Zone, masque?: Uint8Array): Buffer {
  if (!Number.isFinite(intensite) || intensite <= 0 || intensite > 1) throw new Error("Intensité invalide (0 à 1).");
  if(masque && masque.length!==source.width*source.height)throw new Error("Dimensions du masque invalides.");
  const out = new PNG({ width: source.width, height: source.height });
  source.data.copy(out.data);
  const x0 = zone ? Math.floor(zone.x * source.width) : 0;
  const y0 = zone ? Math.floor(zone.y * source.height) : 0;
  const x1 = zone ? Math.ceil((zone.x + zone.largeur) * source.width) : source.width;
  const y1 = zone ? Math.ceil((zone.y + zone.hauteur) * source.height) : source.height;
  for (let y = y0; y < Math.min(source.height, y1); y++) for (let x = x0; x < Math.min(source.width, x1); x++) {
    if(masque && !masque[y*source.width+x])continue;
    const dest = (y * source.width + x) * 4;
    const from = (Math.min(resultat.height - 1, Math.floor(y * resultat.height / source.height)) * resultat.width +
      Math.min(resultat.width - 1, Math.floor(x * resultat.width / source.width))) * 4;
    for (let c = 0; c < 3; c++) out.data[dest + c] = Math.round(source.data[dest + c] * (1 - intensite) + resultat.data[from + c] * intensite);
    out.data[dest + 3] = source.data[dest + 3];
  }
  return PNG.sync.write(out);
}


export interface TraceMasque { forme?: "rectangle"; mode: "modifier" | "proteger"; rayon: number; points: {x:number;y:number}[] }
export function validerTraces(value: unknown): TraceMasque[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 64) throw new Error("Masque trop complexe (64 traits maximum).");
  let n=0;
  for(const t of value){
    if (!t || !["modifier","proteger"].includes(t.mode) || !Number.isFinite(t.rayon) || t.rayon < .002 || t.rayon > .08 || !Array.isArray(t.points) || t.points.length < 1 || t.points.length > 256) throw new Error("Trait de masque invalide.");
    if(t.forme!==undefined&&(t.forme!=="rectangle"||t.points.length!==2))throw new Error("Forme de masque invalide.");
    n+=t.points.length;
    for(const p of t.points) if(!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x<0 || p.x>1 || p.y<0 || p.y>1) throw new Error("Point de masque invalide.");
  }
  if(n>2048)throw new Error("Masque trop complexe (2048 points maximum).");
  return value as TraceMasque[];
}
/** Rasterize once. Protection always wins, independently of stroke order. */
export function rasteriserMasque(w:number,h:number,traces:TraceMasque[]):Uint8Array {
  const masque=new Uint8Array(w*h);masque.fill(traces.some(t=>t.mode==="modifier")?0:1);
  let travail=0;
  for(const mode of ["modifier","proteger"] as const) for(const t of traces.filter(t=>t.mode===mode)){
    if(t.forme==="rectangle"){
      const a=t.points[0],b=t.points[1];const x0=Math.floor(Math.min(a.x,b.x)*w),x1=Math.min(w,Math.ceil(Math.max(a.x,b.x)*w)),y0=Math.floor(Math.min(a.y,b.y)*h),y1=Math.min(h,Math.ceil(Math.max(a.y,b.y)*h));travail+=(x1-x0)*(y1-y0);if(travail>80000000)throw new Error("Masque trop complexe.");for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)masque[y*w+x]=mode==="modifier"?1:0;continue;
    }
    const rayon=t.rayon*w;
    for(let i=0;i<Math.max(1,t.points.length-1);i++){
      const a=t.points[i],b=t.points[Math.min(i+1,t.points.length-1)];
      const ax=a.x*w,ay=a.y*h,bx=b.x*w,by=b.y*h,dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
      const x0=Math.max(0,Math.floor(Math.min(ax,bx)-rayon)),x1=Math.min(w-1,Math.ceil(Math.max(ax,bx)+rayon));
      const y0=Math.max(0,Math.floor(Math.min(ay,by)-rayon)),y1=Math.min(h-1,Math.ceil(Math.max(ay,by)+rayon));
      travail+=(x1-x0+1)*(y1-y0+1);if(travail>80000000)throw new Error("Masque trop complexe : utilisez des traits plus courts ou un pinceau plus fin.");
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
        const u=len?Math.max(0,Math.min(1,((x+.5-ax)*dx+(y+.5-ay)*dy)/len)):0;
        if((x+.5-ax-u*dx)**2+(y+.5-ay-u*dy)**2<=rayon*rayon)masque[y*w+x]=mode==="modifier"?1:0;
      }
    }
  }
  return masque;
}
