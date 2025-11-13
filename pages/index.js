// pages/index.js
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const Map = dynamic(() => import("../components/Map"), { ssr: false });

const UPDATE_INTERVAL_MS = 15000;

export default function HomePage() {
  const [vehicles, setVehicles] = useState([]);
  const [selectedBus, setSelectedBus] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadVehicles() {
      try {
        const res = await fetch("/api/vehicles");
        if (!res.ok) throw new Error(`Bad status: ${res.status}`);
        const data = await res.json();
        setVehicles(data);
        setError(null);
      } catch (err) {
        console.error("Failed to load vehicles", err);
        setError("Failed to load bus data");
      }
    }

    loadVehicles();
    const id = setInterval(loadVehicles, UPDATE_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#111",
        color: "#eee",
        fontFamily: "system-ui, sans-serif"
      }}
    >
      <div
        style={{
          width: "280px",
          borderRight: "1px solid #333",
          padding: "8px",
          overflowY: "auto"
        }}
      >
        <h2 style={{ textAlign: "center", marginTop: 0 }}>🚌 Sundsvall buses</h2>
        {error && <p style={{ color: "red" }}>{error}</p>}
        {!error && vehicles.length === 0 && <p>No vehicles found...</p>}

        <ul style={{ listStyle: "none", padding: 0 }}>
          {vehicles.map((bus) => (
            <li
              key={bus.id}
              onClick={() => setSelectedBus(bus)}
              style={{
                background:
                  selectedBus?.id === bus.id ? "#333" : "transparent",
                padding: "6px",
                margin: "4px 0",
                borderRadius: "6px",
                cursor: "pointer"
              }}
            >
              <strong>Line {bus.route}</strong>
              <br />
              <small>ID: {bus.id}</small>
            </li>
          ))}
        </ul>
      </div>

      <div style={{ flex: 1 }}>
        <Map vehicles={vehicles} selectedBus={selectedBus} />
      </div>
    </div>
  );
}
