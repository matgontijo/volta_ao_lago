// Cálculos geográficos leves feitos em memória (sem ida ao PostGIS) para o
// caminho quente: distância da van ao próximo PC, usada em geofence e ETA.

const EARTH_R = 6371000; // metros

export interface LatLng {
  lat: number;
  lng: number;
}

/** Distância em metros entre dois pontos (Haversine). */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
