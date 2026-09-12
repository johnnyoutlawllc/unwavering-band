/*
 * Geography helpers. The web site takes a foreground getCurrentPosition when
 * the person opts in. Native apps also run Always background tracking via the
 * Capacitor BackgroundLocation plugin (see docs/NATIVE.md).
 */

export type Reading = {
  lat: number;
  lng: number;
  accuracy_m: number;
};

export function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('This browser cannot share a location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 60000,
    });
  });
}

/*
 * The tooltip never says where anyone is, only how far apart you are. That
 * is the whole grammar of the site: distance, not address.
 */
export function distanceLabel(km: number): string {
  const miles = km * 0.621371;
  if (miles < 1) return 'less than a mile apart';
  if (miles < 10) return `${miles.toFixed(1)} miles apart`;
  return `${Math.round(miles).toLocaleString('en-US')} miles apart`;
}

/** Great circle distance in kilometres. */
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) *
      Math.cos((bLat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
