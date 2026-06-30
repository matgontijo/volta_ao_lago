export interface PointIn {
  lat: number;
  lng: number;
  name?: string;
}

const valid = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

/** Cola: uma linha por ponto — "lat, lng" (formato do Google Maps), opcional "lat,lng,nome". */
export function parsePasted(text: string): PointIn[] {
  const out: PointIn[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(/(-?\d+(?:\.\d+)?)\s*[,;\s]+\s*(-?\d+(?:\.\d+)?)(?:\s*[,;]\s*(.+))?/);
    if (!m) continue;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (valid(lat, lng)) out.push({ lat, lng, name: m[3]?.trim() || undefined });
  }
  return out;
}

/** KML do Google My Maps: Placemarks com <Point><coordinates>lng,lat</coordinates>. */
export function parseKml(text: string): PointIn[] {
  const out: PointIn[] = [];
  const placemarks = text.match(/<Placemark[\s\S]*?<\/Placemark>/g) || [];
  for (const pm of placemarks) {
    const pt = pm.match(/<Point>[\s\S]*?<coordinates>\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)/);
    if (!pt) continue;
    const lng = parseFloat(pt[1]);
    const lat = parseFloat(pt[2]);
    const nm = pm.match(/<name>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/name>/);
    if (valid(lat, lng)) out.push({ lat, lng, name: nm ? nm[1].trim() : undefined });
  }
  // Fallback: rota como LineString (sem placemarks de ponto).
  if (out.length === 0) {
    for (const block of text.match(/<coordinates>([\s\S]*?)<\/coordinates>/g) || []) {
      const inner = block.replace(/<\/?coordinates>/g, '').trim();
      for (const tok of inner.split(/\s+/)) {
        const [lngS, latS] = tok.split(',');
        const lng = parseFloat(lngS);
        const lat = parseFloat(latS);
        if (valid(lat, lng)) out.push({ lat, lng });
      }
    }
  }
  return out;
}
