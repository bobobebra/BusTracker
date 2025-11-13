// pages/api/vehicles.js

export default async function handler(req, res) {
  try {
    // TODO: replace with real Trafiklab GTFS-RT or your backend
    // For now, a static demo bus near Navet
    const demo = [
      {
        id: "demo-1",
        route: "2",
        lat: 62.392,
        lon: 17.305,
        destination: "Kuben",
        delayMinutes: 0
      }
    ];

    res.status(200).json(demo);
  } catch (err) {
    console.error("vehicles API error", err);
    res.status(500).json({ error: "Failed to fetch vehicles" });
  }
}
