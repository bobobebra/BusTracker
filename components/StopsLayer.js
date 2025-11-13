// components/StopsLayer.js
import { useEffect, useState } from "react";
import { CircleMarker, Tooltip } from "react-leaflet";

const STOPS_URL =
  "https://pnsnaaduo2m27rir.public.blob.vercel-storage.com/stops-sundsvall.json";

export default function StopsLayer() {
  const [stops, setStops] = useState([]);

  useEffect(() => {
    fetch(STOPS_URL, { cache: "force-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed stops: ${r.status}`);
        return r.json();
      })
      .then((data) => setStops(data.stops ?? []))
      .catch((err) => console.error("Failed to load stops", err));
  }, []);

  return (
    <>
      {stops.map((s) => (
        <CircleMarker
          key={s.id}
          center={[s.lat, s.lon]}
          radius={4}
          pathOptions={{
            color: "#ffffff",
            weight: 2,
            fillColor: "#000000",
            fillOpacity: 1,
          }}
        >
          <Tooltip direction="top" offset={[0, -4]}>
            {s.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}
