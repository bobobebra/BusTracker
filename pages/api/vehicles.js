import AdmZip from "adm-zip";
import Papa from "papaparse";
import * as Rt from "gtfs-rt-bindings"; // exposes FeedMessage at top-level

// 🔑 Trafiklab key you gave me (rotate later if this repo is public)
const TL_KEY = "5669c38dfd454535a3e6d59c71ccab61";
const OP = "dintur";

const URLS = {
  // Static (try Sweden 3, then fallback to Regional)
  sweden3Zip: `https://opendata.samtrafiken.se/gtfs-sweden/sweden.zip?key=${TL_KEY}`,
  regionalZip: `https://opendata.samtrafiken.se/gtfs/${OP}/${OP}.zip?key=${TL_KEY}`,
  // Realtime (try Sweden 3, then fallback to Regional)
  vpSweden3: `https://opendata.samtrafiken.se/gtfs-rt-sweden/${OP}/VehiclePositionsSweden.pb?key=${TL_KEY}`,
  vpRegional: `https://opendata.samtrafiken.se/gtfs-rt/${OP}/VehiclePositions.pb?key=${TL_KEY}`
};

let tripToRoute = null;
let lastTripLoad = 0;

async function fetchBuf(url, mustOk = true) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    const msg = `${r.status} ${r.statusText}${body ? ` | ${body.slice(0,200)}` : ""}`;
    if (mustOk) throw new Error(msg);
    return { ok: false, msg };
  }
  return { ok: true, buf: Buffer.from(await r.arrayBuffer()) };
}

async function buildTripMap(debug = false) {
  if (tripToRoute && Date.now() - lastTripLoad < 12 * 60 * 60 * 1000) return tripToRoute;

  // try Sweden 3 first, then Regional
  let got = await fetchBuf(URLS.sweden3Zip, false);
  if (!got.ok) {
    if (debug) console.warn("Sweden3 static failed, trying Regional:", got.msg);
    got = await fetchBuf(URLS.regionalZip, true);
  }

  const zip = new AdmZip(got.buf);
  const tripsTxt = zip.getEntry("trips.txt")?.getData().toString("utf8");
  if (!tripsTxt) throw new Error("trips.txt missing in static GTFS ZIP");
  const trips = Papa.parse(tripsTxt, { header: true, skipEmptyLines: true }).data;

  const map = new Map();
  for (const t of trips) if (t.trip_id && t.route_id) map.set(String(t.trip_id), String(t.route_id));
  tripToRoute = map;
  lastTripLoad = Date.now();
  return tripToRoute;
}

async function getVehiclePositions(debug = false) {
  // try Sweden 3 realtime first, then Regional
  let got = await fetchBuf(URLS.vpSweden3, false);
  if (!got.ok) {
    if (debug) console.warn("Sweden3 VP failed, trying Regional:", got.msg);
    got = await fetchBuf(URLS.vpRegional, true);
  }
  return got.buf;
}

export default async function handler(req, res) {
  const debug = req.query.debug === "1";
  try {
    // build trip->route map (if static not allowed, we still return buses with route="unknown" or routeId from RT)
    try { await buildTripMap(debug); } catch (e) { if (debug) console.warn("trip map build failed:", e.message); }

    const bytes = await getVehiclePositions(debug);

    // ✅ decoder fix: top-level FeedMessage
    let feed;
    try { feed = Rt.FeedMessage.decode(bytes); }
    catch (e) { return res.status(500).json({ error: `Decode error: ${e?.message || e}` }); }

    const t2r = tripToRoute;
    const vehicles = (feed.entity || [])
      .filter((e) => e.vehicle?.position)
      .map((e) => {
        const v = e.vehicle;
        const tripId = v.trip?.tripId ? String(v.trip.tripId) : null;
        const rtRoute = v.trip?.routeId ? String(v.trip.routeId) : null;
        const route = rtRoute || (tripId && t2r ? t2r.get(tripId) : null) || "unknown";
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
