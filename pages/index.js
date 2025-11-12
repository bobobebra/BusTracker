import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
const MapGoogle = dynamic(() => import("../components/MapGoogle"), { ssr: false });

// 🌍 Hardcode your Google Maps JS key on the client.
// NOTE: Client-side keys are visible; lock them with HTTP referrer restrictions.
const GOOGLE_KEY = "AIzaSyDFKrkWw6zRBVP2DAHJfSG4sV8Bu8IagDQ";

export default function Home() {
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [shapes, setShapes] = useState(null);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [selectedBus, setSelectedBus] = useState(null);
  const [routeQuery, setRouteQuery] = useState("");

  // Vehicles every 5s
  useEffect(() => {
    let cancel = false;
    async function loadVehicles() {
      try {
        console.log("🔄 fetching vehicles…");
        const res = await fetch("/api/vehicles", { cache: "no-store" });
        const data = await res.json();
        if (!cancel) setVehicles(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error("vehicles error", e);
      }
    }
    loadVehicles();
    const id = setInterval(loadVehicles, 5000);
    return () => { cancel = true; clearInterval(id); };
  }, []);

  // Routes + shapes once
  useEffect(() => {
    (async () => {
      try {
        console.log("🗺️ fetching shapes…");
        const r = await fetch("/api/shapes");
        const j = await r.json();
        setRoutes(j.routes || []);
        setShapes(j.shapes || null);
      } catch (e) {
        console.error("shapes error", e);
      }
    })();
  }, []);

  const filteredRoutes = useMemo(() => {
    const q = routeQuery.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter((r) =>
      (r.short_name || "").toLowerCase().includes(q) ||
      (r.long_name || "").toLowerCase().includes(q) ||
      (r.route_id || "").toLowerCase().includes(q)
    );
  }, [routes, routeQuery]);

  const visibleVehicles = useMemo(
    () => (selectedRouteId ? vehicles.filter((v) => String(v.route) === String(selectedRouteId)) : vehicles),
    [vehicles, selectedRouteId]
  );

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <aside style={{ width: 300, background: "#0f1115", color: "#fff", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 10, borderBottom: "1px solid #222", position: "sticky", top: 0, background: "#0f1115", zIndex: 1 }}>
          <input
            placeholder="Search route… e.g. 84"
            value={routeQuery}
            onChange={(e) => setRouteQuery(e.target.value)}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid #333", background: "#151821", color: "#eee", fontSize: 14 }}
          />
        </div>

        <div style={{ display: "flex", gap: 0, flex: 1, overflow: "hidden" }}>
          <div style={{ width: "55%", borderRight: "1px solid #222", overflowY: "auto", padding: 10 }}>
            <h3 style={{ margin: "6px 0", fontSize: 13, opacity: .8 }}>Routes</h3>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {filteredRoutes.map((r) => (
                <li
                  key={r.route_id}
                  onClick={() => { setSelectedRouteId(r.route_id === selectedRouteId ? null : r.route_id); setSelectedBus(null); }}
                  style={{
                    padding: "6px 8px",
                    marginBottom: 6,
                    borderRadius: 6,
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                    border: `1px solid ${r.route_id === selectedRouteId ? "#3a4a7a" : "#222"}`,
                    background: r.route_id === selectedRouteId ? "#1a1f2e" : "transparent"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 12, height: 12, borderRadius: 2, background: r.color || "#888", display: "inline-block" }} />
                    <strong style={{ fontSize: 14 }}>{r.short_name || r.route_id}</strong>
                  </div>
                  {r.long_name && <div style={{ fontSize: 12, opacity: .7 }}>{r.long_name}</div>}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ width: "45%", overflowY: "auto", padding: 10 }}>
            <h3 style={{ margin: "6px 0", fontSize: 13, opacity: .8 }}>Buses</h3>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {visibleVehicles.map((bus) => (
                <li
                  key={bus.id}
                  onClick={() => setSelectedBus(bus)}
                  style={{ padding: "6px 8px", marginBottom: 6, borderRadius: 6, cursor: "pointer", border: "1px solid #222" }}
                >
                  <strong style={{ fontSize: 14 }}>Bus {bus.route}</strong>
                  <div style={{ fontSize: 12, opacity: .75 }}>
                    ID: {bus.id}{bus.label ? ` • ${bus.label}` : ""}{typeof bus.bearing === "number" ? ` • ${Math.round(bus.bearing)}°` : ""}
                  </div>
                </li>
              ))}
              {visibleVehicles.length === 0 && <li style={{ fontSize: 12, opacity: .6 }}>No buses for this filter…</li>}
            </ul>
          </div>
        </div>
      </aside>

      <div style={{ flex: 1 }}>
        <MapGoogle
          apiKey={GOOGLE_KEY}
          vehicles={visibleVehicles}
          shapes={shapes}
          selectedRouteId={selectedRouteId}
          selectedBus={selectedBus}
          showRoutes={true}
        />
      </div>
    </div>
  );
}
