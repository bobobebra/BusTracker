// components/MapGoogle.jsx
import { GoogleMap, Polyline, Marker, useJsApiLoader } from "@react-google-maps/api";
import { useEffect, useMemo, useState, useRef } from "react";

const SUNDSVALL = { lat: 62.391, lng: 17.306 };

// Build a rotated symbol icon (SVG arrow/bus-like) with route color
const makeSymbol = (color = "#2dd4bf", rotation = 0) => ({
  path: "M 0,-1 2,0 0,1 -2,0 Z", // diamond/arrow; tweak to taste
  fillColor: color,
  fillOpacity: 1,
  strokeWeight: 0,
  scale: 8,
  rotation, // degrees
});

export default function MapGoogle({
  apiKey,
  vehicles,
  shapes,                 // GeoJSON FeatureCollection from /api/shapes
  selectedRouteId,
  selectedBus,
  showRoutes,
  onFitDone,             // optional callback
}) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey });
  const mapRef = useRef(null);
  const [mapTypeId, setMapTypeId] = useState("ROADMAP"); // ROADMAP | HYBRID | SATELLITE | TERRAIN

  const center = SUNDSVALL;
  const onLoad = (map) => { mapRef.current = map; };

  // Build polylines from shapes (per route)
  const polylines = useMemo(() => {
    if (!shapes) return [];
    const out = [];
    for (const f of shapes.features) {
      if (!showRoutes) break;
      if (selectedRouteId && f.properties.route_id !== selectedRouteId) continue;
      const color = f.properties.color || "#3388ff";
      if (f.geometry.type === "MultiLineString") {
        for (const line of f.geometry.coordinates) {
          const path = line.map(([lng, lat]) => ({ lat, lng }));
          out.push({ path, color });
        }
      }
    }
    return out;
  }, [shapes, showRoutes, selectedRouteId]);

  // Fit to selected route bounds
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
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, 30);
      onFitDone?.();
    }
  }, [selectedRouteId, shapes, onFitDone]);

  // Zoom to selected bus smoothly
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedBus) return;
    map.panTo({ lat: selectedBus.lat, lng: selectedBus.lon });
    map.setZoom(16);
  }, [selectedBus]);

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      {/* Basemap toggle */}
      <div style={{ position: "absolute", zIndex: 2, top: 10, right: 10, background: "#0f1115dd", color: "#fff", borderRadius: 8, padding: 6, display: "flex", gap: 6 }}>
        {["ROADMAP", "HYBRID"].map(t => (
          <button
            key={t}
            onClick={() => setMapTypeId(t)}
            style={{
              fontSize: 12, padding: "6px 8px", borderRadius: 6,
              background: mapTypeId === t ? "#1a1f2e" : "#111", color: "#fff", border: "1px solid #333", cursor: "pointer"
            }}
          >
            {t === "ROADMAP" ? "Streets" : "Satellite"}
          </button>
        ))}
      </div>

      {isLoaded && (
        <GoogleMap
          onLoad={onLoad}
          mapContainerStyle={{ height: "100%", width: "100%" }}
          center={center}
          zoom={12}
          options={{
            mapTypeId,
            fullscreenControl: false,
            streetViewControl: false,
            mapTypeControl: false,
            gestureHandling: "greedy",
            styles: [] // keep default; you can drop in a SnazzyMaps style here
          }}
        >
          {/* Route polylines */}
          {polylines.map((pl, i) => (
            <Polyline
              key={i}
              path={pl.path}
              options={{
                strokeColor: pl.color,
                strokeOpacity: selectedRouteId ? 1 : 0.6,
                strokeWeight: selectedRouteId ? 5 : 2,
              }}
            />
          ))}

          {/* Bus markers (rotating symbols colored by route) */}
          {vehicles.map((v) => (
            <Marker
              key={v.id}
              position={{ lat: v.lat, lng: v.lon }}
              icon={makeSymbol("#2dd4bf", Math.round(v.bearing || 0))}
              // You can switch color per v.route by mapping route_id -> color from shapes if you pass that in.
              // icon accepts a google.maps.Symbol; rotation is supported on Symbols.
            />
          ))}
        </GoogleMap>
      )}
    </div>
  );
}
