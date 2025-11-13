// src/map/BusMarker.jsx
import React, { useMemo } from "react";
import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import { ROUTE_COLORS } from "../lib/routeColors.js";

function makeBusIcon(line) {
  const color = ROUTE_COLORS[line] ?? "#000000";

  const html = `
    <div class="bus-icon">
      <div class="bus-icon-line" style="background:${color}"></div>
      <div class="bus-icon-body" style="color:${color}">
        <div class="bus-icon-dot"></div>
        <span>${line || "?"}</span>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: "",
    iconSize: [32, 24],
    iconAnchor: [16, 16],
  });
}

export default function BusMarker({ bus }) {
  const icon = useMemo(() => makeBusIcon(bus.line), [bus.line]);

  return (
    <Marker position={[bus.lat, bus.lon]} icon={icon}>
      <Tooltip direction="top">
        Linje {bus.line}
        {bus.destination ? ` → ${bus.destination}` : ""}
        {typeof bus.delayMinutes === "number"
          ? ` (${bus.delayMinutes >= 0 ? "+" : ""}${bus.delayMinutes} min)`
          : ""}
      </Tooltip>
    </Marker>
  );
}
