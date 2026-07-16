import * as GtfsRt from "gtfs-rt-bindings";
import AdmZip from "adm-zip";
import Papa from "papaparse";

const TRAFIKLAB_KEY =
  process.env.TRAFIKLAB_API_KEY || "5669c38dfd454535a3e6d59c71ccab61";
const OPERATOR = "dintur";

const URLS = {
  staticRegional: `https://opendata.samtrafiken.se/gtfs/${OPERATOR}/${OPERATOR}.zip?key=${TRAFIKLAB_KEY}`,
  realtimeRegional: `https://opendata.samtrafiken.se/gtfs-rt/${OPERATOR}/VehiclePositions.pb?key=${TRAFIKLAB_KEY}`,
  realtimeSweden: `https://opendata.samtrafiken.se/gtfs-rt-sweden/${OPERATOR}/VehiclePositionsSweden.pb?key=${TRAFIKLAB_KEY}`
};

const SUNDSVALL_LINES = new Set([
  "1", "2", "3", "4", "5",
  "70", "71", "73", "74", "76", "78",
  "84", "85", "90", "120", "610", "611"
]);

// A geographic fallback prevents an outdated route list or missing route mapping
// from hiding every vehicle on the map.
const SUNDSVALL_BOUNDS = {
  minLat: 62.15,
  maxLat: 62.65,
  minLon: 16.75,
  maxLon: 17.95
};

let cachedVehicles = null;
let cacheAt = 0;
const CACHE_MS = 10_000;

let tripToRoute = null;
let routeIdToShort = null;
let lastGtfsLoad = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchBuffer(url, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `${response.status} ${response.statusText}${body ? `: ${body.slice(0, 160)}` : ""}`
      );
    }

    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchRealtime() {
  const errors = [];

  for (const url of [URLS.realtimeRegional, URLS.realtimeSweden]) {
    try {
      return await fetchBuffer(url);
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }

  throw new Error(`All realtime feeds failed: ${errors.join(" | ")}`);
}

async function buildRouteMaps() {
  if (
    tripToRoute &&
    routeIdToShort &&
    Date.now() - lastGtfsLoad < 12 * 60 * 60 * 1000
  ) {
    return;
  }

  const buffer = await fetchBuffer(URLS.staticRegional, 8_000);
  const zip = new AdmZip(buffer);
  const tripsEntry = zip.getEntry("trips.txt");
  const routesEntry = zip.getEntry("routes.txt");

  if (!tripsEntry || !routesEntry) {
    throw new Error("Static GTFS is missing trips.txt or routes.txt");
  }

  const trips = Papa.parse(tripsEntry.getData().toString("utf8"), {
    header: true,
    skipEmptyLines: true
  }).data;
  const routes = Papa.parse(routesEntry.getData().toString("utf8"), {
    header: true,
    skipEmptyLines: true
  }).data;

  const nextTripToRoute = new Map();
  const nextRouteIdToShort = new Map();

  for (const route of routes) {
    const routeId = route.route_id?.trim();
    const shortName = route.route_short_name?.trim();
    if (routeId && shortName) nextRouteIdToShort.set(routeId, shortName);
  }

  for (const trip of trips) {
    const tripId = trip.trip_id?.trim();
    const routeId = trip.route_id?.trim();
    if (tripId && routeId) nextTripToRoute.set(tripId, routeId);
  }

  tripToRoute = nextTripToRoute;
  routeIdToShort = nextRouteIdToShort;
  lastGtfsLoad = Date.now();
}

function isInSundsvall(lat, lon) {
  return (
    lat >= SUNDSVALL_BOUNDS.minLat &&
    lat <= SUNDSVALL_BOUNDS.maxLat &&
    lon >= SUNDSVALL_BOUNDS.minLon &&
    lon <= SUNDSVALL_BOUNDS.maxLon
  );
}

function getFeedMessageDecoder() {
  // gtfs-rt-bindings exports FeedMessage directly. The default fallback keeps
  // this working through different CommonJS/ESM interop modes in Next.js.
  return GtfsRt.FeedMessage || GtfsRt.default?.FeedMessage;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=60");

  if (cachedVehicles && Date.now() - cacheAt < CACHE_MS) {
    return res.status(200).json(cachedVehicles);
  }

  try {
    // Start loading route names, but do not let a large static ZIP prevent live
    // positions from appearing. Coordinates are used as a fallback filter.
    const routeMapsPromise = buildRouteMaps().catch((error) => {
      console.warn("Static GTFS mapping unavailable:", error?.message || error);
    });

    const raw = await fetchRealtime();
    await Promise.race([routeMapsPromise, sleep(1_500)]);

    const FeedMessage = getFeedMessageDecoder();
    if (!FeedMessage) {
      throw new Error("gtfs-rt-bindings did not export FeedMessage");
    }

    const feed = FeedMessage.decode(raw);
    const vehicles = [];

    for (const entity of feed.entity || []) {
      const vehiclePosition = entity.vehicle;
      const position = vehiclePosition?.position;
      if (!position) continue;

      const lat = Number(position.latitude);
      const lon = Number(position.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const trip = vehiclePosition.trip;
      // gtfs-rt-bindings preserves protobuf snake_case names. Camel-case
      // fallbacks support feeds/versions that expose transformed objects.
      const tripId = String(trip?.trip_id ?? trip?.tripId ?? "").trim() || null;
      const realtimeRouteId =
        String(trip?.route_id ?? trip?.routeId ?? "").trim() || null;
      const routeId =
        realtimeRouteId || (tripId ? tripToRoute?.get(tripId) : null) || null;
      const shortName =
        (routeId ? routeIdToShort?.get(String(routeId)) : null) || routeId || null;

      const route = shortName ? String(shortName).trim() : "?";
      const knownSundsvallLine = SUNDSVALL_LINES.has(route);

      if (!knownSundsvallLine && !isInSundsvall(lat, lon)) continue;

      const vehicleInfo = vehiclePosition.vehicle;
      vehicles.push({
        id:
          entity.id ||
          vehicleInfo?.id ||
          `${route}-${lat.toFixed(5)}-${lon.toFixed(5)}`,
        route,
        routeId,
        tripId,
        label: vehicleInfo?.label ?? vehicleInfo?.id ?? null,
        lat,
        lon,
        bearing: Number(position.bearing ?? 0),
        speed: position.speed == null ? null : Number(position.speed),
        timestamp: vehiclePosition.timestamp ?? null
      });
    }

    cachedVehicles = vehicles;
    cacheAt = Date.now();
    return res.status(200).json(vehicles);
  } catch (error) {
    console.error("Vehicle API error:", error);

    if (cachedVehicles) {
      return res.status(200).json(cachedVehicles);
    }

    return res.status(500).json({
      error: error?.message || String(error)
    });
  }
}
