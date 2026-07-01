import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip } from 'react-leaflet';
import type { ExchangePoint, VehiclePosition } from '../lib/types';

interface Props {
  pcs: ExchangePoint[];
  positions: VehiclePosition[];
  routePath: [number, number][] | null;
  editMode?: boolean;
  onMovePc?: (id: number, lat: number, lng: number) => void;
}

export function MapView({ pcs, positions, routePath, editMode, onMovePc }: Props) {
  const sorted = [...pcs].sort((a, b) => a.sequence - b.sequence);

  const straight: [number, number][] = sorted.map((p) => [p.lat, p.lng]);
  if (straight.length > 1) straight.push(straight[0]);
  const path = routePath && routePath.length > 1 ? routePath : straight;

  const center: [number, number] = path.length
    ? [avg(path.map((r) => r[0])), avg(path.map((r) => r[1]))]
    : [-15.8, -47.85];

  return (
    <MapContainer center={center} zoom={12} className="map" scrollWheelZoom preferCanvas>
      <TileLayer
        attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
      />

      <Polyline positions={path} pathOptions={{ color: '#1f6feb', weight: 7, opacity: 0.35 }} />
      <Polyline positions={path} pathOptions={{ color: '#38e0c8', weight: 3, opacity: 0.95 }} />

      {sorted.map((pc) => {
        const isStart = pc.sequence === 1;
        // Modo edição: marcador arrastável (Leaflet Marker + divIcon).
        if (editMode) {
          const icon = L.divIcon({
            className: 'pc-edit',
            html: `<div class="pc-edit-dot${isStart ? ' start' : ''}">${isStart ? '⚑' : pc.sequence - 1}</div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13],
          });
          return (
            <Marker
              key={`pc-${pc.id}`}
              position={[pc.lat, pc.lng]}
              draggable
              icon={icon}
              eventHandlers={{
                dragend: (e) => {
                  const ll = (e.target as L.Marker).getLatLng();
                  onMovePc?.(pc.id, ll.lat, ll.lng);
                },
              }}
            >
              <Tooltip>{pc.name} (arraste para reposicionar)</Tooltip>
            </Marker>
          );
        }
        return (
          <CircleMarker
            key={`pc-${pc.id}`}
            center={[pc.lat, pc.lng]}
            radius={isStart ? 9 : 6}
            pathOptions={
              isStart
                ? { color: '#facc15', fillColor: '#22c55e', fillOpacity: 1, weight: 3 }
                : { color: '#38e0c8', fillColor: '#0b1220', fillOpacity: 1, weight: 2.5 }
            }
          >
            <Tooltip>
              {pc.name}
              {pc.km_marker != null && <> · km {Number(pc.km_marker).toFixed(1)}</>}
            </Tooltip>
          </CircleMarker>
        );
      })}

      {!editMode &&
        positions.map((p) => {
          const isVan = p.role === 'van_pickup';
          return (
            <CircleMarker
              key={`veh-${p.vehicleId}`}
              center={[p.lat, p.lng]}
              radius={isVan ? 9 : 6}
              pathOptions={{
                color: '#0b1220',
                fillColor: p.colorHex,
                fillOpacity: isVan ? 0.95 : 0.5,
                weight: 2,
              }}
            >
              <Tooltip direction="top" offset={[0, -6]}>
                <b>{p.teamName}</b>
                <br />
                {isVan ? 'Van (pick-up)' : 'Carro (drop-off)'}
                {p.speedMps != null && (
                  <>
                    <br />
                    {(p.speedMps * 3.6).toFixed(0)} km/h
                  </>
                )}
              </Tooltip>
            </CircleMarker>
          );
        })}
    </MapContainer>
  );
}

function avg(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
