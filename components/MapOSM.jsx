import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useMemo, useState } from "react";

const SUNDSVALL = [62.391, 17.306];

// Rotated diamond marker via SVG divIcon
function busIcon(bearing = 0, color = "#2dd4bf") {
  const svg = `
    <svg width="26" height="26" viewBox="-13 -13 26 26" xmlns="http://www.w3.org/2000/svg"
         style="transform: rotate(${Math.round(bearing)}deg);">
      <polygon points="0,-10 8,0 0,10 -8,0" fill="${color}"/>
    </svg>`;
  return L.divIcon({ html: svg, className: "bus-icon", iconSize: [26,26], iconAnchor: [13,13] });
}

// Fit map bounds to selected route
function FitToRoute({ shapes, selectedRouteId }) {
  const map = useMap();
  useEffect(() => {
    if (!shapes || !selectedRouteId) return;
    const b = L.latLngBounds([]);
    for (const f of shapes.features || []) {
      if (f.properties.route_id !== selectedRouteId) continue;
      if (f.geometry?.type === "MultiLineString") {
        for (const line of f.geometry.coordinates) for (const [lng, lat] of line) b.extend([lat, lng]);
      }
    }
    if (b.isValid()) map.fitBounds(b.pad(0.05));
  }, [map, shapes, selectedRouteId]);
  return null;
}

// Focus on selected bus
function FocusBus({ bus }) {
  const map = useMap();
  useEffect(() => { if (bus) map.setView([bus.lat, bus.lon], 16, { animate: true }); }, [map, bus]);
  return null;
}

export default function MapOSM({ vehicles, shapes, selectedRouteId, selectedBus }) {
  const [satellite, setSatellite] = useState(false);

  const polylines = useMemo(() => {
    if (!shapes) return [];
    const out = [];
    for (const f of shapes.features || []) {
      if (selectedRouteId && f.properties.route_id !== selectedRouteId) continue;
      const color = f.properties.color || "#3388ff";
      if (f.geometry?.type === "MultiLineString") {
        for (const line of f.geometry.coordinates) {
          out.push({ color, path: line.map(([lng, lat]) => [lat, lng]) });
        }
      }
    }
    return out;
  }, [shapes, selectedRouteId]);

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      <div style={{ position: "absolute", zIndex: 1000, top: 10, right: 10, display: "flex", gap: 8 }}>
        <button
          onClick={() => setSatellite(false)}
          style={{ background: satellite ? "#111" : "#1a1f2e", color: "#fff", border: "1px solid #333", borderRadius: 6, padding: "6px 10px" }}
        >
          Streets
        </button>
        <button
          onClick={() => setSatellite(true)}
          style={{ background: satellite ? "#1a1f2e" : "#111", color: "#fff", border: "1px solid #333", borderRadius: 6, padding: "6px 10px" }}
        >
          Satellite
        </button>
      </div>

      <MapContainer center={SUNDSVALL} zoom={12} style={{ height: "100%", width: "100%" }} zoomControl={false} preferCanvas={true}>
        {!satellite && (
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap contributors"
            maxZoom={19}
          />
        )}
        {satellite && (
          <TileLayer
            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            attribution='Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community'
            maxZoom={19}
          />
        )}

        {polylines.map((pl, i) => (
          <Polyline
            key={i}
            positions={pl.path}
            pathOptions={{ color: pl.color, weight: selectedRouteId ? 5 : 2, opacity: selectedRouteId ? 1 : 0.7 }}
          />
        ))}

        {vehicles.map((v) => (
          <Marker key={v.id} position={[v.lat, v.lon]} icon={busIcon(v.bearing)} />
        ))}

        <FitToRoute shapes={shapes} selectedRouteId={selectedRouteId} />
        <FocusBus bus={selectedBus} />
      </MapContainer>
    </div>
  );
}
