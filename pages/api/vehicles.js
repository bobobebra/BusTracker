import AdmZip from "adm-zip";
import Papa from "papaparse";
import * as Rt from "gtfs-rt-bindings"; // transit_realtime

// 🔒 Your Trafiklab key is hardcoded here (server-side only)
// NOTE: If this repo is public, rotate the key afterwards.
const TRAFIKLAB_KEY = "c498298c7eb7434ea59c5fc4149bc7f5";

let tripToRoute = null;
let lastLoad = 0;

// Build a cache: trip_id -> route_id from static GTFS (Sweden 3)
async function ensureTripToRoute(debug = false) {
  const TTL = 12 * 60 * 60 * 1000; // 12h
  if (tripToRoute && Date.now() - lastLoad < TTL) return;

  const staticUrl = `https://opendata.samtrafiken.se/gtfs-sweden/sweden.zip?key=${encodeURIComponent(TRAFIKLAB_KEY)}`;
  const r = await fetch(staticUrl, { cache: "no-store" });
  if (!r.ok) {
    const msg = `GTFS static fetch failed: ${r.status} ${r.statusText}`;
    if (debug) console.error(msg);
    throw new Error(msg);
  }

  const buf = Buffer.from(await r.arrayBuffer());
  const zip = new AdmZip(buf);
  const tripsEntry = zip.getEntry("trips.txt");
  if (!tripsEntry) throw new Error("trips.txt missing in GTFS static ZIP");
  const tripsTxt = tripsEntry.getData().toString("utf8");
  const trips = Papa.parse(tripsTxt, { header: true, skipEmptyLines: true }).data;

  const map = new Map();
  for (const t of trips) {
    if (t.trip_id && t.route_id) map.set(String(t.trip_id), String(t.route_id));
  }
  tripToRoute = map;
  lastLoad = Date.now();
}

export default async function handler(req, res) {
  const debug = req.query.debug === "1";
  try {
    await ensureTripToRoute(debug);

    // Din Tur realtime via GTFS-RT Sweden
    const feedUrl = `https://opendata.samtrafiken.se/gtfs-rt-sweden/dintur/VehiclePositionsSweden.pb?key=${encodeURIComponent(TRAFIKLAB_KEY)}`;
    const rr = await fetch(feedUrl, { cache: "no-store" });
    if (!rr.ok) {
      const text = await rr.text().catch(() => "");
      const msg = `Trafiklab VehiclePositions failed: ${rr.status} ${rr.statusText}${text ? ` | body: ${text.slice(0,200)}` : ""}`;
      if (debug) console.error(msg);
      return res.status(500).json({ error: msg });
    }

    const bytes = Buffer.from(await rr.arrayBuffer());
    let feed;
    try {
      feed = Rt.transit_realtime.FeedMessage.decode(bytes);
    } catch (e) {
      const msg = `Decode error: ${e?.message || e}`;
      if (debug) console.error(msg);
      return res.status(500).json({ error: msg });
    }

    const vehicles = (feed.entity || [])
      .filter((e) => e.vehicle?.position)
      .map((e) => {
        const v = e.vehicle;
        const tripId = v.trip?.tripId ? String(v.trip.tripId) : null;
        const rtRoute = v.trip?.routeId ? String(v.trip.routeId) : null;
        const resolvedRoute = rtRoute || (tripId ? tripToRoute.get(tripId) : null) || "unknown";

        return {
          id: e.id,
          lat: v.position.latitude,
          lon: v.position.longitude,
          bearing: v.position.bearing ?? 0,
          speed: v.position.speed ?? null,
          route: resolvedRoute,
          tripId,
          label: v.vehicle?.label ?? v.vehicle?.id ?? null,
          timestamp: v.timestamp ?? null
        };
      });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(vehicles);
  } catch (err) {
    const msg = `Failed to fetch vehicle data: ${err?.message || err}`;
    if (debug) console.error("Vehicle API error:", err);
    return res.status(500).json({ error: msg });
  }
}
