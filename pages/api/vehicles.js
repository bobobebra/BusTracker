import AdmZip from "adm-zip";
import Papa from "papaparse";
import * as Rt from "gtfs-rt-bindings";

// 🔑 Your Trafiklab key (Sweden-3 RT key you gave me)
const TL_KEY = "5669c38dfd454535a3e6d59c71ccab61";

// Din Tur operator slug for GTFS Regional
// (Trafiklab lists it as "dintur")
const OP = "dintur";

const URLS = {
  // Static
  sweden3Zip: `https://opendata.samtrafiken.se/gtfs-sweden/sweden.zip?key=${TL_KEY}`,
  regionalZip: `https://opendata.samtrafiken.se/gtfs/${OP}/${OP}.zip?key=${TL_KEY}`,
  // Realtime (try Sweden-3 first; if not available for this operator, fall back to Regional)
  vpSweden3: `https://opendata.samtrafiken.se/gtfs-rt-sweden/${OP}/VehiclePositionsSweden.pb?key=${TL_KEY}`,
  vpRegional: `https://opendata.samtrafiken.se/gtfs-rt/${OP}/VehiclePositions.pb?key=${TL_KEY}`,
};

let tripToRoute = null;
let lastTripLoad = 0;

async function fetchBuf(url, mustOk = true) {
  const r = await fetch(url, { headers: { "Accept-encoding": "gzip" }, cache: "no-store" });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    const msg = `${r.status} ${r.statusText}${text ? ` | ${text.slice(0,200)}` : ""}`;
    if (mustOk) throw new Error(msg);
    return { ok: false, msg };
  }
  const buf = Buffer.from(await r.arrayBuffer());
  return { ok: true, buf };
}

async function buildTripMap() {
  if (tripToRoute && Date.now() - lastTripLoad < 12 * 60 * 60 * 1000) return tripToRoute;

  // Try Sweden-3 static, then Regional static
  let got = await fetchBuf(URLS.sweden3Zip, false);
  if (!got.ok) got = await fetchBuf(URLS.regionalZip, true);

  const zip = new AdmZip(got.buf);
  const tripsTxt = zip.getEntry("trips.txt")?.getData().toString("utf8");
  if (!tripsTxt) throw new Error("trips.txt missing in static GTFS");
  const trips = Papa.parse(tripsTxt, { header: true, skipEmptyLines: true }).data;

  const map = new Map();
  for (const t of trips) if (t.trip_id && t.route_id) map.set(String(t.trip_id), String(t.route_id));
  tripToRoute = map;
  lastTripLoad = Date.now();
  return tripToRoute;
}

async function getVehiclePositions() {
  // Try Sweden-3 VehiclePositions first; if operator not supported (404/403), fall back to Regional
  let got = await fetchBuf(URLS.vpSweden3, false);
  if (!got.ok) got = await fetchBuf(URLS.vpRegional, true);
  return got.buf;
}

export default async function handler(req, res) {
  const debug = req.query.debug === "1";
  try {
    // Build trip→route map, but if static fails we still return vehicles with route = routeId|unknown
    let t2r = null;
    try { t2r = await buildTripMap(); }
    catch (e) { if (debug) console.error("⚠️ static fallback failed:", e.message); }

    const feedBuf = await getVehiclePositions();
    let feed;
    try { feed = Rt.transit_realtime.FeedMessage.decode(feedBuf); }
    catch (e) { return res.status(500).json({ error: `Decode error: ${e.message || e}` }); }

    const vehicles = (feed.entity || [])
      .filter(e => e.vehicle?.position)
      .map(e => {
        const v = e.vehicle;
        const tripId = v.trip?.tripId ? String(v.trip.tripId) : null;
        const routeIdRT = v.trip?.routeId ? String(v.trip.routeId) : null;
        const route = routeIdRT || (tripId && t2r ? t2r.get(tripId) : null) || "unknown";
        return {
          id: e.id,
          lat: v.position.latitude,
          lon: v.position.longitude,
          bearing: v.position.bearing ?? 0,
          speed: v.position.speed ?? null,
          route,
          tripId,
          label: v.vehicle?.label ?? v.vehicle?.id ?? null,
          timestamp: v.timestamp ?? null
        };
      });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(vehicles);
  } catch (err) {
    const msg = `Failed to fetch vehicle data: ${err?.message || err}`;
    if (debug) console.error(msg);
    res.status(500).json({ error: msg });
  }
}
