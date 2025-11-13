// lib/loadRoutes.js

const ROUTES_URL =
  "https://pnsnaaduo2m27rir.public.blob.vercel-storage.com/routes-sundsvall.json";

export async function loadRoutes() {
  const res = await fetch(ROUTES_URL, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`Failed to fetch routes: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data; // { "2": [ [ [lat, lon], ... ], ... ], ... }
}
