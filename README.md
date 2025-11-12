# Din Tur Bus Tracker

This repository contains a simple Next.js application that displays real‑time positions of buses operated by **Din Tur** (Västernorrland, Sweden). The data is pulled from Trafiklab’s GTFS‑Realtime feed for the operator `dintur` and visualised on an interactive map.

## Features

* **Real‑time vehicle positions** – The back‑end API fetches the `VehiclePositions.pb` feed from Trafiklab and decodes the protobuf data using the `gtfs‑realtime‑bindings` library.
* **Interactive map** – Positions are plotted on an OpenStreetMap layer using `react‑leaflet`. Clicking on a bus marker reveals its route, speed and bearing.
* **Auto‑refresh** – Vehicle data is refreshed every 10 seconds so positions remain up‑to‑date.

## Setup

1. **Obtain an API key:**
   * Register for a Trafiklab developer account at [Trafiklab.se](https://www.trafiklab.se) and request access to the GTFS‑Realtime APIs.
   * Once approved, you will receive an API key. The operator abbreviation for Din Tur is `dintur`【846768050519668†L214-L216】. The GTFS‑Realtime feeds can be accessed at `https://opendata.samtrafiken.se/gtfs‑rt/{operator}/VehiclePositions.pb?key={apikey}`【846768050519668†L328-L335】.

2. **Clone the repository and install dependencies:**

   ```bash
   git clone <your-fork-url>.git
   cd bus-tracker
   npm install
   ```

3. **Configure environment variables:**

   Create a `.env.local` file in the project root and add your Trafiklab API key:

   ```env
   TRAFIKLAB_API_KEY=your_api_key_here
   ```

4. **Run the development server:**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) in your browser to view the app.

## Deployment

This project is designed for easy deployment to [Vercel](https://vercel.com):

1. **Push the code to GitHub.**
2. **Create a new project on Vercel** and import your repository.
3. **Add the environment variable** `TRAFIKLAB_API_KEY` in the Vercel project settings.
4. **Deploy** – Vercel will build and host your site automatically.

## Notes

* The map centres on the Sundsvall region; you can modify the coordinates in `components/Map.js` to adjust the initial view.
* The polling interval is set to 10 seconds in `pages/index.js`. Feel free to tweak this value.
* The GTFS‑Realtime feed updates as frequently as every 2 seconds for some operators【846768050519668†L379-L383】, but fetching too often may exhaust your API quota. Make sure to check your plan’s rate limits.

## License

This project is released under the MIT License.