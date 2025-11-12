import { GoogleMap, Polyline, Marker, useJsApiLoader } from "@react-google-maps/api";
import { useEffect, useMemo, useRef, useState } from "react";

const SUNDSVALL = { lat: 62.391, lng: 17.306 };

// Vector symbol (supports rotation)
const makeSymbol = (color = "#2dd4bf", rotation = 0) => ({
  path: "M 0,-1 2,0 0,1 -2,0 Z", // arrow/diamond
  fillColor: color,
  fillOpacity: 1,
  strokeWeight: 0,
  scale: 8,
  rotation
});

export default function MapGoogle({
  apiKey,
  vehicles,
  shapes,
  selectedRouteId,
  selectedBus,
  showRoutes = true
}) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey });
  const mapRef = useRef(null);
  const [mapTypeId, setMapTypeId] = useState("ROADMAP"); // HYBRID for satellite

  // Build polylines from GeoJSON
  const polylines = useMemo(() => {
    if (!shapes || !showRoutes) return [];
    const out = [];
    for (const f of shapes.features) {
      if (selectedRouteId && f.properties.route_id !== selectedRouteId) continue;
      const color = f.properties.color || "#3388ff";
      if (f.geometry.type === "MultiLineString") {
        for (const line of f.geometry.coordinates) {
          out.push({ color, path: line.map(([lng, lat]) => ({ lat, lng })) });
        }
      }
    }
    return out;
  }, [shapes, showRoutes, selectedRouteId]);

  // Fit to selected route
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedRouteId || !shapes) return;
    const bounds = new window.google.maps.LatLngBounds();
    for (const f of shapes.features) {
      if (f.properties.route_id !== selectedRouteId) continue;
      if (f.geometry.type === "MultiLineString") {
        for (const line of f.geometry.coordinates) {
          for (const [lng, lat] of line) bounds.extend({ lat, lng });
        }
      }
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, 30);
  }, [selectedRouteId, shapes]);

  // Zoom to selected bus
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedBus) return;
    map.panTo({ lat: selectedBus.lat, lng: selectedBus.lon });
    map.setZoom(16);
  }, [selectedBus]);

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      {/* Basemap toggle */}
      <div style={{ position: "absolute", zIndex: 2, top: 10, right: 10, display: "flex", gap: 8 }}>
        {["ROADMAP", "HYBRID"].map((t) => (
          <button
            key={t}
            onClick={() => setMapTypeId(t)}
            style={{
              background: mapTypeId === t ? "#1a1f2e" : "#111",
              color: "#fff",
              border: "1px solid #333",
              borderRadius: 6,
              padding: "6px 8px",
              cursor: "pointer"
            }}
          >
            {t === "ROADMAP" ? "Streets" : "Satellite"}
          </button>
        ))}
      </div>

      {isLoaded && (
        <GoogleMap
          onLoad={(map) => (mapRef.current = map)}
          mapContainerStyle={{ height: "100%", width: "100%" }}
          center={SUNDSVALL}
          zoom={12}
          options={{
            mapTypeId,
            streetViewControl: false,
            fullscreenControl: false,
            mapTypeControl: false,
            gestureHandling: "greedy"
          }}
        >
          {/* Route polylines */}
          {polylines.map((pl, i) => (
            <Polyline
              key={i}
              path={pl.path}
              options={{
                strokeColor: pl.color,
                strokeWeight: selectedRouteId ? 5 : 2,
                strokeOpacity: selectedRouteId ? 1 : 0.65
              }}
            />
          ))}

          {/* Rotating bus markers (bearing) */}
          {vehicles.map((v) => (
            <Marker
              key={v.id}
              position={{ lat: v.lat, lng: v.lon }}
              icon={makeSymbol("#2dd4bf", Math.round(v.bearing || 0))}
              // For per-route colors, pass a route->color map and set fillColor here.
            />
          ))}
        </GoogleMap>
      )}
    </div>
  );
}
