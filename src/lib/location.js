/**
 * Location attachments.
 *
 * Two rules define this feature, and both are privacy rules rather than UX ones:
 *
 * 1. Nothing here ever contacts a third party. No tile server, no reverse
 *    geocoder, no IP-derived position. The coordinate pair is read from the
 *    device and shipped inside the encrypted payload; the map link is inert
 *    until the reader taps it.
 * 2. Reading a location must not tell anyone that a read happened. A rendered
 *    map embed would hand the reader's IP — and the fact that they care about
 *    this coordinate — to whatever tile server serves it, which is the exact
 *    trade this app exists to refuse.
 *
 * So there is deliberately no reverse geocoding: the only place name a location
 * message ever carries is one the sender typed themselves.
 */

export const LOCATION_PRECISION = {
  EXACT: "exact",
  APPROXIMATE: "approximate",
};

/**
 * Two decimal places is ~1.1km at the equator and the coarsest rounding that
 * still reads as "roughly where I am" rather than "somewhere in this region".
 * Three places (~110m) would be precise enough to find the house, which defeats
 * the point of asking for an approximation.
 */
const APPROXIMATE_DECIMALS = 2;

/** Geolocation can sit pending behind a permission prompt; don't leave it hanging. */
export const LOCATION_TIMEOUT_MS = 15_000;

function toFiniteNumber(value) {
  // Number("") and Number("  ") are both 0, so a blank field would otherwise
  // parse as a valid fix on Null Island. Only accept real numbers and numeric
  // strings that actually carry digits.
  if (typeof value === "string" && !value.trim()) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/** Latitude and longitude bounds, plus NaN rejection. */
export function isValidCoords(lat, lon) {
  const latNum = toFiniteNumber(lat);
  const lonNum = toFiniteNumber(lon);
  if (latNum === null || lonNum === null) return false;
  return latNum >= -90 && latNum <= 90 && lonNum >= -180 && lonNum <= 180;
}

/**
 * Round to a fixed number of decimals.
 *
 * Math.round is wrong for the negative hemisphere: Math.round(-1.005 * 100) is
 * -100, not -101, because the multiplication is already off by a bit. toFixed
 * rounds the decimal representation directly, which is what a human reading
 * coordinates expects.
 */
export function roundCoord(value, decimals) {
  const num = toFiniteNumber(value);
  if (num === null) return null;
  const places = Number.isInteger(decimals) && decimals >= 0 ? Math.min(decimals, 12) : 0;
  return Number(num.toFixed(places));
}

/** Snap a fix to the approximate grid. */
export function approximateCoords(lat, lon) {
  return {
    lat: roundCoord(lat, APPROXIMATE_DECIMALS),
    lon: roundCoord(lon, APPROXIMATE_DECIMALS),
  };
}

/**
 * Apply the sender's precision choice.
 *
 * Accuracy is dropped in the approximate case rather than rounded: a reported
 * accuracy of 4m next to coordinates rounded to the kilometre is an internal
 * contradiction that tells the reader the fix was far tighter than the
 * coordinate it sits on, which is the same leak as sending the exact fix.
 */
export function applyPrecision(lat, lon, accuracy, precision) {
  const latNum = toFiniteNumber(lat);
  const lonNum = toFiniteNumber(lon);
  if (!isValidCoords(latNum, lonNum)) return null;

  const accuracyNum = toFiniteNumber(accuracy);
  const approximate = precision === LOCATION_PRECISION.APPROXIMATE;
  if (approximate) {
    const snapped = approximateCoords(latNum, lonNum);
    return { ...snapped, accuracy: null, approximate: true };
  }
  return {
    lat: latNum,
    lon: lonNum,
    accuracy: accuracyNum !== null && accuracyNum >= 0 ? accuracyNum : null,
    approximate: false,
  };
}

/**
 * Ask the device where we are.
 *
 * Called only from an explicit user tap, never on mount — a permission prompt
 * with no context is its own small privacy leak.
 */
export function requestCurrentPosition({ timeoutMs = LOCATION_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("This browser cannot share your location."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords || {};
        if (!isValidCoords(latitude, longitude)) {
          reject(new Error("Received an unusable position."));
          return;
        }
        resolve({
          lat: Number(latitude),
          lon: Number(longitude),
          accuracy: toFiniteNumber(accuracy),
        });
      },
      (err) => {
        // The Geolocation API hands back opaque numeric codes; translate them so
        // the UI can say something useful instead of "code 1".
        if (err?.code === 1) reject(new Error("Location permission denied."));
        else if (err?.code === 2) reject(new Error("Position unavailable."));
        else if (err?.code === 3) reject(new Error("Timed out finding your position."));
        else reject(new Error("Unable to read your location."));
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

/**
 * Render coordinates the way a person would read them out: signed degrees with
 * hemisphere letters, not a raw decimal that flips sign between hemispheres.
 */
export function formatCoords(lat, lon) {
  const latNum = toFiniteNumber(lat);
  const lonNum = toFiniteNumber(lon);
  if (latNum === null || lonNum === null) return "";

  const latHemisphere = latNum >= 0 ? "N" : "S";
  const lonHemisphere = lonNum >= 0 ? "E" : "W";
  return `${Math.abs(latNum).toFixed(4)}° ${latHemisphere}, ${Math.abs(lonNum).toFixed(4)}° ${lonHemisphere}`;
}

export function formatAccuracy(meters) {
  const num = toFiniteNumber(meters);
  if (num === null || num < 0) return "";
  if (num < 1000) return `±${Math.round(num)}m`;
  return `±${(num / 1000).toFixed(1)}km`;
}

/**
 * An OpenStreetMap link the reader opens deliberately.
 *
 * Built here rather than handed out by a tile provider, and returned as a
 * plain string so the caller decides to render it as an anchor — nothing in the
 * message ever loads it on its own.
 */
export function osmMapUrl(lat, lon) {
  const latNum = toFiniteNumber(lat);
  const lonNum = toFiniteNumber(lon);
  if (latNum === null || lonNum === null) return "";
  const zoom = 16;
  return `https://www.openstreetmap.org/?mlat=${latNum}&mlon=${lonNum}#map=${zoom}/${latNum}/${lonNum}`;
}

/**
 * Build the wire payload. `label` is whatever the sender typed — there is no
 * lookup that could fill it in for us.
 */
export function buildLocationPayload({ lat, lon, accuracy, precision, label }) {
  const coords = applyPrecision(lat, lon, accuracy, precision);
  if (!coords) throw new Error("Invalid coordinates");

  const trimmedLabel = String(label || "")
    .trim()
    .slice(0, 120);

  const payload = {
    type: "location",
    text: trimmedLabel || "📍 Location",
    lat: coords.lat,
    lon: coords.lon,
    approximate: coords.approximate,
  };
  if (coords.accuracy !== null) payload.accuracy = coords.accuracy;
  if (trimmedLabel) payload.label = trimmedLabel;
  return payload;
}

/** True when a message row carries a usable coordinate pair. */
export function isLocationMessage(row) {
  if (row?.type !== "location") return false;
  return isValidCoords(row.lat, row.lon);
}
