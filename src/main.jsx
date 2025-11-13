// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

import "leaflet/dist/leaflet.css";  // Leaflet CSS :contentReference[oaicite:2]{index=2}
import "./styles/bus.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
