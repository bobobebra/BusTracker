// components/Map.js
import { MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import { useEffect, useState, useMemo } from "react";

import RoutesLayer from "./RoutesLayer";
import StopsLayer from "./StopsLayer";
import BusMarker from "./BusMarker";

import { loadRoutes } from "../lib/loadRoutes";
import { snapToRoutes } from "../lib/snapping";

// Fix Leaflet icons in Next
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png"
});

const SUNDSVALL_CENTER = [62.391, 17.306];

function CenterOnBus({ bus }) {
  const map = useMap();
  useEffect(() => {
    if (bus && bus.lat && bus.lon) {
      map.setView([bus.lat, bus.lon], 15, { animate: true });
    }
  }, [bus, map]);
  return null;
}

export default function Map({ vehicles, selectedBus }) {
  const [routes, setRoutes] = useState(null);

  useEffect(() => {
    loadRoutes()
      .then((data) => {
        console.log("Loaded routes for lines:", Object.keys(data));
        setRoutes(data);
      })
      .catch((err) => console.error("Failed to load routes", err));
  }, []);

  const snappedVehicles = useMemo(() => {
    if (!routes) return vehicles;

    return vehicles.map((v) => {
      const snapped = snapToRoutes(v.lat, v.lon, routes);
      return {
        ...v,
        lat: snapped.lat,
        lon: snapped.lon,
        snappedLine: snapped.line,
        snapped: snapped.snapped
      };
    });
  }, [vehicles, routes]);

  return (
    <MapContainer
      center={SUNDSVALL_CENTER}
      zoom={12}
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="© OpenStreetMap contributors"
      />

      <RoutesLayer routes={routes} />
      <StopsLayer />

      {snappedVehicles.map((v) => (
        <BusMarker key={v.id} bus={v} />
      ))}

      <CenterOnBus bus={selectedBus} />
    </MapContainer>
  );
}
