// Deep link do Waze: abre o app nativo no ponto (ou o Live Map no navegador).
export function wazeUrl(lat: number, lng: number): string {
  return `https://waze.com/ul?ll=${lat}%2C${lng}&navigate=yes`;
}
