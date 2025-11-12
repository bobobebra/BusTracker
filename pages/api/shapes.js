import AdmZip from "adm-zip";
import Papa from "papaparse";

let cache = { at: 0, data: null };
const TTL_MS = 12 * 60 * 60 * 1000;

const parseCSV = (text) =>
  Papa.parse(text, { header: true, skipEmptyLines: true }).data;

const hex = (s) =>
  s && s.trim() ? (s.startsWith("#") ? s : `#${s}`) : "#3388ff";

export default async function handler(req, res) {
  try {
    if (cache.data && Date.now() - cache.at < TTL_MS) {
      return res.status(200).json(cache.data);
    }
    const apiKey = process.env.TRAFIKLAB_API_KEY;
    const zipUrl = `https://opendata.samtrafiken.se/gtfs/dintur/dintur.zip?key=${apiKey}`;
    const r = await fetch(zipUrl);
    if (!r.ok) throw new Error(`GTFS static fetch failed: ${r.status}`);

    const buf = Buffer.from(await r.arrayBuffer());
    const zip = new AdmZip(buf);

    const read = (name) => zip.getEntry(name)?.getData().toString("utf8");

    const routes = parseCSV(read("routes.txt"));
    const trips = parseCSV(read("trips.txt"));
    const shapes = parseCSV(read("shapes.txt"));

    // shape_id -> ordered points
    const shapePoints = new Map();
    for (const row of shapes) {
      const sid = row.shape_id;
      if (!shapePoints.has(sid)) shapePoints.set(sid, []);
      shapePoints.get(sid).push({
        seq: Number(row.shape_pt_sequence),
        lat: Number(row.shape_pt_lat),
        lon: Number(row.shape_pt_lon)
      });
    }
    for (const [sid, arr] of shapePoints) arr.sort((a, b) => a.seq - b.seq);

    // route_id -> set(shape_id)
    const routeShapes = new Map();
    for (const t of trips) {
      if (!t.route_id || !t.shape_id) continue;
      if (!routeShapes.has(t.route_id)) routeShapes.set(t.route_id, new Set());
      routeShapes.get(t.route_id).add(t.shape_id);
    }

    // GeoJSON features per route
    const features = [];
    for (const rt of routes) {
      const shapeSet = routeShapes.get(rt.route_id);
      if (!shapeSet || shapeSet.size === 0) continue;

      const lines = [];
      for (const sid of shapeSet) {
        const pts = shapePoints.get(sid);
        if (!pts || pts.length < 2) continue;
        lines.push(pts.map((p) => [p.lon, p.lat]));
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
      routes: routes.map((r) => ({
        route_id: r.route_id,
        short_name: r.route_short_name || "",
        long_name: r.route_long_name || "",
        color: hex(r.route_color),
        text_color: hex(r.route_text_color || "#000000")
      })),
      shapes: { type: "FeatureCollection", features }
    };

    cache = { at: Date.now(), data: payload };
    res.status(200).json(payload);
  } catch (err) {
    console.error("Shapes API error:", err);
    res.status(500).json({ error: "Failed to build shapes" });
  }
}
