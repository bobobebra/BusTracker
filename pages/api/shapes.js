import AdmZip from "adm-zip";
import Papa from "papaparse";

const TL_KEY = "5669c38dfd454535a3e6d59c71ccab61";
const OP = "dintur";

const SWEDEN3_ZIP = `https://opendata.samtrafiken.se/gtfs-sweden/sweden.zip?key=${TL_KEY}`;
const REGIONAL_ZIP = `https://opendata.samtrafiken.se/gtfs/${OP}/${OP}.zip?key=${TL_KEY}`;

let cache = { at: 0, data: null };
const TTL = 12 * 60 * 60 * 1000;

const parseCSV = (t) => Papa.parse(t, { header: true, skipEmptyLines: true }).data;
const hex = (s) => (s && s.trim() ? (s.startsWith("#") ? s : `#${s}`) : "#3388ff");

export default async function handler(req, res) {
  const debug = req.query.debug === "1";
  try {
    if (cache.data && Date.now() - cache.at < TTL) {
      res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=3600");
      return res.status(200).json(cache.data);
    }

    // Try Sweden-3, then Regional
    let r = await fetch(SWEDEN3_ZIP);
    if (!r.ok) {
      if (debug) console.warn("Sweden3 static failed, trying Regional:", r.status);
      r = await fetch(REGIONAL_ZIP);
    }
    if (!r.ok) throw new Error(`Static GTFS fetch failed: ${r.status} ${r.statusText}`);

    const buf = Buffer.from(await r.arrayBuffer());
    const zip = new AdmZip(buf);
    const read = (name) => zip.getEntry(name)?.getData().toString("utf8");

    const routes = parseCSV(read("routes.txt"));
    const trips  = parseCSV(read("trips.txt"));
    const shapes = parseCSV(read("shapes.txt"));

    // shape_id -> ordered points
    const shapePts = new Map();
    for (const row of shapes) {
      const sid = row.shape_id;
      if (!shapePts.has(sid)) shapePts.set(sid, []);
      shapePts.get(sid).push({
        seq: Number(row.shape_pt_sequence),
        lat: Number(row.shape_pt_lat),
        lon: Number(row.shape_pt_lon)
      });
    }
    for (const arr of shapePts.values()) arr.sort((a,b)=>a.seq-b.seq);

    // route_id -> set(shape_id)
    const routeShapes = new Map();
    for (const t of trips) {
      if (!t.route_id || !t.shape_id) continue;
      if (!routeShapes.has(t.route_id)) routeShapes.set(t.route_id, new Set());
      routeShapes.get(t.route_id).add(t.shape_id);
    }

    // GeoJSON per route
    const features = [];
    for (const rt of routes) {
      const sids = routeShapes.get(rt.route_id);
      if (!sids || sids.size === 0) continue;
      const lines = [];
      for (const sid of sids) {
        const pts = shapePts.get(sid);
        if (!pts || pts.length < 2) continue;
        lines.push(pts.map(p => [p.lon, p.lat]));
      }
      if (!lines.length) continue;
      features.push({
        type: "Feature",
        properties: {
          route_id: rt.route_id,
          short_name: rt.route_short_name || "",
          long_name: rt.route_long_name || "",
          color: hex(rt.route_color),
          text_color: hex(rt.route_text_color || "#000000")
        },
        geometry: { type: "MultiLineString", coordinates: lines }
      });
    }

    const payload = {
      routes: routes.map(r => ({
        route_id: r.route_id,
        short_name: r.route_short_name || "",
        long_name: r.route_long_name || "",
        color: hex(r.route_color),
        text_color: hex(r.route_text_color || "#000000")
      })),
      shapes: { type: "FeatureCollection", features }
    };

    cache = { at: Date.now(), data: payload };
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=3600");
    res.status(200).json(payload);
  } catch (err) {
    const msg = `Failed to build shapes: ${err?.message || err}`;
    if (debug) console.error("Shapes API error:", msg);
    // return empty shapes so UI still loads
    res.status(200).json({ routes: [], shapes: { type: "FeatureCollection", features: [] }, warning: msg });
  }
}
