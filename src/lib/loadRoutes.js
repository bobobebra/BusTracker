// src/lib/loadRoutes.js
import pako from "pako";

export async function loadRoutes() {
  const res = await fetch("/routes-sundsvall.json.gz");
  if (!res.ok) {
    throw new Error("Failed to fetch routes-sundsvall.json.gz");
  }

  const arrayBuffer = await res.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);

  // ungzip -> string
  const jsonString = pako.ungzip(uint8, { to: "string" });
  const data = JSON.parse(jsonString);

  // Expecting shape: { "1": [ [ [lat, lon], ... ], [poly2], ... ], ... }
  return data;
}
