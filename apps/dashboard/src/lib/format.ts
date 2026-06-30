export function secondsToClock(total: number | null): string {
  if (total == null || !Number.isFinite(total) || total < 0) return '—';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function distanceLabel(meters: number | null): string {
  if (meters == null) return '—';
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

export function paceLabel(secPerKm: number | null): string {
  if (secPerKm == null) return '—';
  return `${secondsToClock(secPerKm)}/km`;
}
