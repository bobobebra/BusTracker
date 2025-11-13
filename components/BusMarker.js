// components/BusMarker.js
import { Marker, Tooltip } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";
import { ROUTE_COLORS } from "../lib/routeColors";

function makeBusIcon(route) {
  const color = ROUTE_COLORS[route] ?? "#000000";

  const html = `
    <div class="bus-icon">
      <div class="bus-icon-line" style="background:${color}"></div>
      <div class="bus-icon-body" style="color:${color}">
        <div class="bus-icon-dot"></div>
        <span>${route || "?"}</span>
      </div>
    </div>
  `;

  return L.divIcon({
    html,
    className: "",
    iconSize: [32, 24],
    iconAnchor: [16, 16]
  });
}

export default function BusMarker({ bus }) {
  const icon = useMemo(() => makeBusIcon(bus.route), [bus.route]);

  return (
    <Marker position={[bus.lat, bus.lon]} icon={icon}>
      <Tooltip direction="top">
        Linje {bus.route}
        {bus.destination ? ` → ${bus.destination}` : ""}
        {typeof bus.delayMinutes === "number"
          ? ` (${bus.delayMinutes >= 0 ? "+" : ""}${bus.delayMinutes} min)`
          : ""}
      </Tooltip>
    </Marker>
  );
}
