import * as Rt from "gtfs-rt-bindings";
import AdmZip from "adm-zip";
import Papa from "papaparse";

// ---- CONFIG ----
const TL_KEY = "5669c38dfd454535a3e6d59c71ccab61";
const OP = "dintur";

const URLS = {
  static: `https://opendata.samtrafiken.se/gtfs-sweden/sweden.zip?key=${TL_KEY}`,
  staticRegional: `https://opendata.samtrafiken.se/gtfs/${OP}/${OP}.zip?key=${TL_KEY}`,
  vpMain: `https://opendata.samtrafiken.se/gtfs-rt-sweden/${OP}/VehiclePositionsSweden.pb?key=${TL_KEY}`,
  vpRegional: `https://opendata.samtrafiken.se/gtfs-rt/${OP}/VehiclePositions.pb?key=${TL_KEY}`
};

// Sundsvall-only lines
const SUND_LINES = new Set([
  "1","2","3","4","5",
  "70","71","73","74","76","78",
  "84","85","90",
  "120","610","611"
]);

// Cache (to avoid upstream spam)
let cachedVehicles = null;
let cacheAt = 0;
const CACHE_MS = 7000;

let tripToRoute = null;
let routeIdToShort = null;
let lastGTFSLoad = 0;

// ---- HELPERS ----
async function fetchBuf(url, allowFail = false) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    if (allowFail) return null;
    throw new Error(`${res.status} ${res.statusText}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function buildMaps() {
  if (tripToRoute && routeIdToShort && Date.now() - lastGTFSLoad < 12 * 3600 * 1000) {
    return;
  }

  let buf = await fetchBuf(URLS.static, true);
  if (!buf) buf = await fetchBuf(URLS.staticRegional, false);

  const zip = new AdmZip(buf);

  const tripsTxt = zip.getEntry("trips.txt")?.getData().toString("utf8");
  const routesTxt = zip.getEntry("routes.txt")?.getData().toString("utf8");

  if (!tripsTxt || !routesTxt) throw new Error("GTFS static missing files");

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
}

async function getRT() {
  let buf = await fetchBuf(URLS.vpMain, true);
  if (!buf) buf = await fetchBuf(URLS.vpRegional, false);
  return buf;
}

// ---- API HANDLER ----
export default async function handler(req, res) {
  try {
    // Serve fresh cache quickly
    if (cachedVehicles && Date.now() - cacheAt < CACHE_MS) {
      return res.status(200).json(cachedVehicles);
    }

    await buildMaps();

    const raw = await getRT();
    const feed = Rt.FeedMessage.decode(raw);

    const vehicles = [];

    for (const ent of feed.entity || []) {
      if (!ent.vehicle?.position) continue;

      const v = ent.vehicle;
      const trip = v.trip?.tripId ? String(v.trip.tripId) : null;
      const rtRoute = v.trip?.routeId ? String(v.trip.routeId) : null;

      let rid = rtRoute;
      if (!rid && trip && tripToRoute.has(trip)) {
        rid = tripToRoute.get(trip);
      }

      const short = routeIdToShort.get(rid) || rid;

      // Filter Sundsvall only:
      if (!SUND_LINES.has(short)) continue;

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
    return res.status(500).json({ error: err.message || String(err) });
  }
}
