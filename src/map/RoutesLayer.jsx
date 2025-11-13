// src/map/RoutesLayer.jsx
import React from "react";
import { Polyline } from "react-leaflet";
import { ROUTE_COLORS } from "../lib/routeColors.js";

export default function RoutesLayer({ routes }) {
  if (!routes) return null;

  return (
    <>
      {Object.entries(routes).map(([line, polylines]) =>
        polylines.map((coords, idx) => (
          <Polyline
            key={`${line}-${idx}`}
            positions={coords.map(([lat, lon]) => [lat, lon])}
            pathOptions={{
              color: ROUTE_COLORS[line] ?? "#444",
              weight: 5,
              opacity: 0.9,
            }}
          />
        ))
      )}
    </>
  );
}
