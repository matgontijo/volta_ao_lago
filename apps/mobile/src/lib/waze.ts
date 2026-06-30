/**
 * Deep link do Waze. O "universal link" (https://waze.com/ul) abre o app nativo
 * quando instalado e cai no Waze Live Map no navegador caso contrário.
 */
export function wazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat}%2C${lng}&navigate=yes`;
}

export function openWaze(lat: number, lng: number): void {
  window.open(wazeUrl(lat, lng), '_blank', 'noopener');
}
