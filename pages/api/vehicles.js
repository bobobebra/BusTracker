import fetch from "node-fetch";
import { transit_realtime } from "gtfs-realtime-bindings";
import AdmZip from "adm-zip";
import Papa from "papaparse";

let tripToRoute = null;   // cached map: tripId -> route_id
let lastLoad = 0;

async function ensureTripToRoute(apiKey) {
  const TTL = 12 * 60 * 60 * 1000; // 12h
  if (tripToRoute && Date.now() - lastLoad < TTL) return;

  const url = `https://opendata.samtrafiken.se/gtfs/dintur/dintur.zip?key=${apiKey}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`GTFS static fetch failed: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const zip = new AdmZip(buf);
  const tripsTxt = zip.getEntry("trips.txt").getData().toString("utf8");
  const trips = Papa.parse(tripsTxt, { header: true, skipEmptyLines: true }).data;

  const map = new Map();
  for (const t of trips) {
    if (t.trip_id && t.route_id) map.set(String(t.trip_id), String(t.route_id));
  }
  tripToRoute = map;
  lastLoad = Date.now();
}

export default async function handler(req, res) {
  try {
    const apiKey = process.env.TRAFIKLAB_API_KEY || "c498298c7eb7434ea59c5fc4149bc7f5";
    await ensureTripToRoute(apiKey);

    const feedUrl = `https://opendata.samtrafiken.se/gtfs-rt/dintur/VehiclePositions.pb?key=${apiKey}`;
    const rr = await fetch(feedUrl);
    if (!rr.ok) throw new Error(`Trafiklab request failed: ${rr.status}`);

    const buf = new Uint8Array(await rr.arrayBuffer());
    const feed = transit_realtime.FeedMessage.decode(buf);

    const vehicles = feed.entity
      .filter(e => e.vehicle?.position)
      .map(e => {
        const v = e.vehicle;
        const tripId = v.trip?.tripId ? String(v.trip.tripId) : null;
        const rtFromRealtime = v.trip?.routeId ? String(v.trip.routeId) : null;
        const routeResolved = rtFromRealtime || (tripId ? tripToRoute.get(tripId) : null) || "unknown";

        return {
          id: e.id,
          lat: v.position.latitude,
          lon: v.position.longitude,
          bearing: v.position.bearing ?? 0,     // rotate icon
          speed: v.position.speed ?? null,      // m/s (if provided)
          route: routeResolved,
          tripId,
          label: v.vehicle?.label ?? v.vehicle?.id ?? null,
          timestamp: v.timestamp ?? null
        };
      });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(vehicles);
  } catch (err) {
    console.error("Vehicle API error:", err);
    return res.status(500).json({ error: "Failed to fetch vehicle data" });
  }
}
