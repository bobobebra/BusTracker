// src/map/snapping.js

// Rough conversion around Sundsvall
const METERS_PER_DEG_LAT = 111320;
const METERS_PER_DEG_LON =
  111320 * Math.cos((62.39 * Math.PI) / 180); // Sundsvall latitude

function toXY(lat, lon) {
  return {
    x: lon * METERS_PER_DEG_LON,
    y: lat * METERS_PER_DEG_LAT,
  };
}

function projectOnSegment(lat, lon, aLat, aLon, bLat, bLon) {
  const P = toXY(lat, lon);
  const A = toXY(aLat, aLon);
  const B = toXY(bLat, bLon);

  const ABx = B.x - A.x;
  const ABy = B.y - A.y;
  const APx = P.x - A.x;
  const APy = P.y - A.y;

  const ab2 = ABx * ABx + ABy * ABy;
  if (ab2 === 0) {
    const dx = P.x - A.x;
    const dy = P.y - A.y;
    return {
      lat: aLat,
      lon: aLon,
      dist2: dx * dx + dy * dy,
    };
  }

  let t = (APx * ABx + APy * ABy) / ab2;
  if (t < 0) t = 0;
  if (t > 1) t = 1;

  const x = A.x + t * ABx;
  const y = A.y + t * ABy;

  const dx = P.x - x;
  const dy = P.y - y;

  return {
    lat: y / METERS_PER_DEG_LAT,
    lon: x / METERS_PER_DEG_LON,
    dist2: dx * dx + dy * dy,
  };
}

/**
 * routes: {
 *   "1": [ [ [lat, lon], ... ], [poly2], ... ],
 *   ...
 * }
 */
export function snapToRoutes(lat, lon, routes, maxDistanceMeters = 80) {
  let best = null;
  let bestDist2 = Infinity;
  let bestLine = null;

  if (!routes) {
    return { lat, lon, line: null, snapped: false };
  }

  for (const [line, polylines] of Object.entries(routes)) {
    for (const poly of polylines) {
      for (let i = 0; i < poly.length - 1; i++) {
        const [aLat, aLon] = poly[i];
        const [bLat, bLon] = poly[i + 1];
        const proj = projectOnSegment(lat, lon, aLat, aLon, bLat, bLon);
        if (proj.dist2 < bestDist2) {
          bestDist2 = proj.dist2;
          best = proj;
          bestLine = line;
        }
      }
    }
  }

  if (!best) {
    return { lat, lon, line: null, snapped: false };
  }

  const distanceMeters = Math.sqrt(bestDist2);
  if (distanceMeters > maxDistanceMeters) {
    // too far; don't snap
    return { lat, lon, line: null, snapped: false };
  }

  return {
    lat: best.lat,
    lon: best.lon,
    line: bestLine,
    snapped: true,
    distanceMeters,
  };
}
