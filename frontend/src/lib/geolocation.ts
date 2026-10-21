export type PreciseFix = {
  latitude: number;
  longitude: number;
  /** Horizontal accuracy radius in metres (smaller is better). */
  accuracy: number;
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  /** Time the device measured the fix (ms since epoch). */
  timestamp: number;
  /** True when the browser could only give a coarse (Wi-Fi / network) position. */
  approximate?: boolean;
};

export type LocationErrorCode = 'unsupported' | 'denied' | 'unavailable' | 'imprecise' | 'timeout' | 'insecure';

export class LocationError extends Error {
  code: LocationErrorCode;
  constructor(code: LocationErrorCode, message: string) {
    super(message);
    this.name = 'LocationError';
    this.code = code;
  }
}

/** Stop waiting as soon as a fix is this accurate (metres). */
const TARGET_ACCURACY_M = 25;
/** Never accept a fix worse than this (metres). Worse = IP / cell-tower guess. */
const MAX_ACCEPTABLE_ACCURACY_M = 500;
/**
 * Desktop browsers have no GPS and report a network-based position (typically
 * 100 m - 5 km). That is real device data and is good enough for weather and
 * "which city am I in", so it is accepted as an approximate fix up to this size.
 */
const MAX_APPROXIMATE_ACCURACY_M = 50_000;
/** Once any fix arrives, wait this long (ms) for a better one before settling. */
const SETTLE_AFTER_FIRST_FIX_MS = 8_000;
/** Longest we wait for a good fix (ms). */
const MAX_WAIT_MS = 25_000;
/** Wait for the network-based fallback request (ms). */
const FALLBACK_WAIT_MS = 12_000;
/** Fixes measured earlier than this many ms ago are treated as stale. */
const MAX_FIX_AGE_MS = 15_000;
/** The same fix is reused for this long so one answer does not trigger two scans. */
const REUSE_MS = 15_000;

let lastFix: PreciseFix | null = null;
let inFlight: Promise<PreciseFix> | null = null;

const toFix = (position: GeolocationPosition): PreciseFix => ({
  latitude: position.coords.latitude,
  longitude: position.coords.longitude,
  accuracy: position.coords.accuracy,
  altitude: position.coords.altitude,
  heading: position.coords.heading,
  speed: position.coords.speed,
  timestamp: position.timestamp,
});

const isValid = (fix: PreciseFix): boolean =>
  Number.isFinite(fix.latitude) &&
  Number.isFinite(fix.longitude) &&
  Math.abs(fix.latitude) <= 90 &&
  Math.abs(fix.longitude) <= 180 &&
  // (0, 0) is the classic "no data" placeholder, not a real place for this app.
  !(fix.latitude === 0 && fix.longitude === 0) &&
  Number.isFinite(fix.accuracy);

export const describeLocationError = (error: unknown): string => {
  if (error instanceof LocationError) return error.message;
  return 'The location could not be determined right now.';
};

const requestFix = (): Promise<PreciseFix> =>
  new Promise<PreciseFix>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new LocationError('unsupported', 'This browser does not support device location.'));
      return;
    }
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      reject(new LocationError('insecure', 'Device location only works on a secure (https) page.'));
      return;
    }

    let best: PreciseFix | null = null;
    let finished = false;
    let watchId: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (done: () => void) => {
      if (finished) return;
      finished = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (timer) clearTimeout(timer);
      if (settleTimer) clearTimeout(settleTimer);
      done();
    };

    const settleWithBest = () => {
      if (best && best.accuracy <= MAX_ACCEPTABLE_ACCURACY_M) {
        const fix = best;
        finish(() => resolve(fix));
      } else if (best && best.accuracy <= MAX_APPROXIMATE_ACCURACY_M) {
        const fix: PreciseFix = { ...best, approximate: true };
        finish(() => resolve(fix));
      } else if (best) {
        const metres = Math.round(best.accuracy);
        finish(() => reject(new LocationError(
          'imprecise',
          `The device could only locate you within about ${metres} m, which is not precise enough. ` +
          'Turn on GPS / precise location and try again.',
        )));
      } else {
        finish(() => reject(new LocationError('timeout', 'The device did not return a location in time.')));
      }
    };

    timer = setTimeout(settleWithBest, MAX_WAIT_MS);

    try {
      watchId = navigator.geolocation.watchPosition(
        position => {
          const fix = toFix(position);
          if (!isValid(fix)) return;
          if (Date.now() - fix.timestamp > MAX_FIX_AGE_MS) return; // stale / cached
          if (!best || fix.accuracy < best.accuracy) best = fix;
          if (fix.accuracy <= TARGET_ACCURACY_M) {
            const done = fix;
            finish(() => resolve(done));
          } else if (!settleTimer) {
            settleTimer = setTimeout(settleWithBest, SETTLE_AFTER_FIRST_FIX_MS);
          }
        },
        geoError => {
          if (geoError.code === geoError.PERMISSION_DENIED) {
            finish(() => reject(new LocationError(
              'denied',
              'Location permission is blocked for this site. Allow location in the browser site settings and try again.',
            )));
          } else if (best) {
            settleWithBest();
          } else if (geoError.code === geoError.TIMEOUT) {
            // Keep waiting: watchPosition retries on its own until our own timer ends.
          } else {
            finish(() => reject(new LocationError('unavailable', 'The device could not determine its position right now.')));
          }
        },
        { enableHighAccuracy: true, maximumAge: 0, timeout: MAX_WAIT_MS },
      );
    } catch {
      finish(() => reject(new LocationError('unavailable', 'The device could not determine its position right now.')));
    }
  });

/**
 * Second chance for devices (mostly desktops) where the high-accuracy request times out or
 * is unavailable: ask for a network-based position instead. It is always flagged approximate.
 */
const requestNetworkFix = (): Promise<PreciseFix> =>
  new Promise<PreciseFix>((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new LocationError('unsupported', 'This browser does not support device location.'));
      return;
    }
    try {
      navigator.geolocation.getCurrentPosition(
        position => {
          const fix = toFix(position);
          if (!isValid(fix)) {
            reject(new LocationError('unavailable', 'The device could not determine its position right now.'));
            return;
          }
          if (fix.accuracy > MAX_APPROXIMATE_ACCURACY_M) {
            reject(new LocationError(
              'imprecise',
              `The device could only locate you within about ${Math.round(fix.accuracy)} m, which is not precise enough. ` +
              'Turn on GPS / precise location and try again.',
            ));
            return;
          }
          resolve({ ...fix, approximate: fix.accuracy > MAX_ACCEPTABLE_ACCURACY_M });
        },
        geoError => {
          if (geoError.code === geoError.PERMISSION_DENIED) {
            reject(new LocationError(
              'denied',
              'Location permission is blocked for this site. Allow location in the browser site settings and try again.',
            ));
          } else if (geoError.code === geoError.TIMEOUT) {
            reject(new LocationError('timeout', 'The device did not return a location in time.'));
          } else {
            reject(new LocationError('unavailable', 'The device could not determine its position right now.'));
          }
        },
        { enableHighAccuracy: false, maximumAge: 0, timeout: FALLBACK_WAIT_MS },
      );
    } catch {
      reject(new LocationError('unavailable', 'The device could not determine its position right now.'));
    }
  });

const requestFixWithFallback = async (): Promise<PreciseFix> => {
  try {
    return await requestFix();
  } catch (error) {
    if (error instanceof LocationError && (error.code === 'timeout' || error.code === 'unavailable')) {
      return requestNetworkFix().catch(() => { throw error; });
    }
    throw error;
  }
};

/** Returns a fresh, accurate device fix, or throws a LocationError. */
export const getPreciseLocation = async (options: { forceFresh?: boolean } = {}): Promise<PreciseFix> => {
  if (!options.forceFresh && lastFix && Date.now() - lastFix.timestamp < REUSE_MS) return lastFix;
  if (inFlight) return inFlight;

  inFlight = requestFixWithFallback()
    .then(fix => {
      lastFix = fix;
      return fix;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
};

/** True when permission is already granted, so a silent background fix is allowed. */
export const isLocationPermissionGranted = async (): Promise<boolean> => {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return status?.state === 'granted';
  } catch {
    return false;
  }
};

/**
 * How detailed a reverse-geocoded address may be for a fix of the given accuracy.
 * A 3 km network guess must never be described as one specific street or village.
 */
export const reverseGeocodeZoomFor = (accuracyMeters: number | null | undefined): number => {
  const accuracy = typeof accuracyMeters === 'number' && Number.isFinite(accuracyMeters) ? accuracyMeters : 5000;
  if (accuracy <= 100) return 18;
  if (accuracy <= 500) return 17;
  if (accuracy <= 2_000) return 15;
  if (accuracy <= 10_000) return 13;
  return 10;
};
