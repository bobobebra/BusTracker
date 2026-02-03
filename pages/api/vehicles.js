import * as Rt from "gtfs-rt-bindings";
import AdmZip from "adm-zip";
import Papa from "papaparse";

// ---- CONFIG ----
const TL_KEY = "5669c38dfd454535a3e6d59c71ccab61";
const OP = "dintur";

const URLS = {
  // FIXED: Removed the massive 'sweden.zip' that causes timeouts.
  // We now rely solely on the regional 'dintur' zip.
  staticRegional: `https://opendata.samtrafiken.se/gtfs/${OP}/${OP}.zip?key=${TL_KEY}`,
  vpRegional: `https://opendata.samtrafiken.se/gtfs-rt/${OP}/VehiclePositions.pb?key=${TL_KEY}`
};

// Sundsvall-only lines
const SUND_LINES = new Set([
  "1","2","3","4","5",
  "70","71","73","74","76","78",
  "84","85","90",
  "120","610","611"
]);

// Cache to avoid hitting the API too often
let cachedVehicles = null;
let cacheAt = 0;
const CACHE_MS = 7000;

// In-memory mappings
let tripToRoute = null;
let routeIdToShort = null;
let lastGTFSLoad = 0;

// ---- HELPERS ----
async function fetchBuf(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function buildMaps() {
  // Reload static data only if it's missing or older than 12 hours
  if (tripToRoute && routeIdToShort && Date.now() - lastGTFSLoad < 12 * 3600 * 1000) {
    return;
  }

  console.log("Fetching static GTFS data (Regional)...");
  
  // FIXED: Fetch only the regional zip
  const buf = await fetchBuf(URLS.staticRegional);
  const zip = new AdmZip(buf);

  const tripsEntry = zip.getEntry("trips.txt");
  const routesEntry = zip.getEntry("routes.txt");

  if (!tripsEntry || !routesEntry) {
    throw new Error("GTFS static missing files (trips.txt or routes.txt)");
  }

  const tripsTxt = tripsEntry.getData().toString("utf8");
  const routesTxt = routesEntry.getData().toString("utf8");

  const trips = Papa.parse(tripsTxt, { header: true, skipEmptyLines: true }).data;
  const routes = Papa.parse(routesTxt, { header: true, skipEmptyLines: true }).data;

  const t2r = new Map();
  const ridToShort = new Map();

  for (const r of routes) {
    const rid = r.route_id?.trim();
    const short = r.route_short_name?.trim();
    if (rid && short) ridToShort.set(rid, short);
  }

  for (const t of trips) {
    if (t.trip_id && t.route_id) {
      t2r.set(String(t.trip_id), String(t.route_id));
    }
  }

  tripToRoute = t2r;
  routeIdToShort = ridToShort;
  lastGTFSLoad = Date.now();
  console.log("Static GTFS data built.");
}

// ---- API HANDLER ----
export default async function handler(req, res) {
  try {
    // 1. Return cache if fresh
    if (cachedVehicles && Date.now() - cacheAt < CACHE_MS) {
      return res.status(200).json(cachedVehicles);
    }

    // 2. Ensure static maps (routes/trips) are loaded
    await buildMaps();

    // 3. Fetch Realtime Data
    const raw = await fetchBuf(URLS.vpRegional);
    const feed = Rt.GtfsRealtimeBindings.FeedMessage.decode(raw);

    const vehicles = [];

    for (const ent of feed.entity || []) {
      if (!ent.vehicle?.position) continue;

      const v = ent.vehicle;
      const trip = v.trip?.tripId ? String(v.trip.tripId) : null;
      const rtRoute = v.trip?.routeId ? String(v.trip.routeId) : null;

      let rid = rtRoute;
      // If routeId is missing in realtime feed, look it up via tripId
      if (!rid && trip && tripToRoute.has(trip)) {
        rid = tripToRoute.get(trip);
      }

      const short = routeIdToShort.get(rid) || rid;

      // Filter: Only return buses in the Sundsvall list
      if (!short || !SUND_LINES.has(short)) continue;

      vehicles.push({
        id: ent.id,
        route: short,
        routeId: rid,
        lat: v.position.latitude,
        lon: v.position.longitude,
        bearing: v.position.bearing ?? 0,
        speed: v.position.speed ?? null,
        timestamp: v.timestamp ?? null
      });
    }

    cachedVehicles = vehicles;
    cacheAt = Date.now();

    res.status(200).json(vehicles);
  } catch (err) {
    console.error("API Error:", err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}
