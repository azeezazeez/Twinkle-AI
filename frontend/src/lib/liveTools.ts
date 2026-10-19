import { fetchWithAuth, type WeatherSnapshot } from './api';

export type LiveToolResult = Record<string, unknown>;

export type LiveToolEffects = {
  /** Called with a weather lookup so the Live Talk screen can show a card. */
  onWeather?: (snapshot: WeatherSnapshot) => void;
};

/* ------------------------------------------------------------------ */
/*  Declarations sent to Gemini in the Live `setup` message            */
/* ------------------------------------------------------------------ */

export const LIVE_TOOL_DECLARATIONS = [
  {
    name: 'get_current_datetime',
    description:
      "Returns the user's exact current local date, day of week, time and timezone. " +
      'Call it for ANY question about the time, date, day, month, year or timezone, ' +
      'and whenever you need to know "today" or "now".',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'get_user_location',
    description:
      "Returns the user's real current location from their device (village or locality, " +
      'mandal / subdistrict, district, state, country). Call it for "where am I", "my location", ' +
      '"near me", "nearby", "nearest", "which district / mandal / village" and similar. ' +
      'The browser asks the user for permission the first time. Do not read out latitude/longitude ' +
      'unless the user explicitly asks for coordinates.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'get_weather',
    description:
      'Returns LIVE weather (current conditions plus a 3-day forecast: temperature, feels-like, ' +
      'humidity, wind, rain chance, sunrise and sunset). Call it for ANY question about weather, ' +
      'temperature, rain, umbrella, wind, humidity, forecast, sunrise or sunset, or how hot/cold it is. ' +
      "If the user names a place, pass it in `place`. If they do not, omit `place` and the user's " +
      'current device location is used.',
    parameters: {
      type: 'OBJECT',
      properties: {
        place: {
          type: 'STRING',
          description:
            'Optional city, town or village, for example "Chennai" or "Paris, France". ' +
            "Omit to use the user's current location.",
        },
      },
    },
  },
  {
    name: 'search_knowledge_base',
    description:
      "Searches the documents the user has uploaded to their personal knowledge base and returns an " +
      'answer grounded in them. Call it when the user asks about their own documents, files, notes, ' +
      'PDFs, resume or knowledge base.',
    parameters: {
      type: 'OBJECT',
      properties: {
        question: {
          type: 'STRING',
          description: 'The question to answer from the uploaded documents, written as a complete sentence.',
        },
      },
      required: ['question'],
    },
  },
] as const;

/** Short, speakable status shown while a tool runs. */
export const LIVE_TOOL_ACTIVITY: Record<string, string> = {
  get_current_datetime: 'Checking the time',
  get_user_location: 'Finding your location',
  get_weather: 'Checking the weather',
  search_knowledge_base: 'Searching your documents',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const TOOL_TIMEOUT_MS = 20_000;
const POSITION_CACHE_MS = 5 * 60_000;

// WMO weather codes -> words the model can speak, and an icon for the UI.
export const describeWeatherCode = (code: number, isDay = true): { label: string; icon: string } => {
  if (code === 0) return { label: isDay ? 'Clear sky' : 'Clear night', icon: isDay ? '☀️' : '🌙' };
  if (code === 1 || code === 2) return { label: 'Partly cloudy', icon: isDay ? '⛅' : '☁️' };
  if (code === 3) return { label: 'Overcast', icon: '☁️' };
  if (code === 45 || code === 48) return { label: 'Foggy', icon: '🌫️' };
  if (code >= 51 && code <= 57) return { label: 'Drizzle', icon: '🌦️' };
  if (code >= 61 && code <= 67) return { label: 'Rain', icon: '🌧️' };
  if (code >= 71 && code <= 77) return { label: 'Snow', icon: '🌨️' };
  if (code >= 80 && code <= 82) return { label: 'Rain showers', icon: '🌦️' };
  if (code === 85 || code === 86) return { label: 'Snow showers', icon: '🌨️' };
  if (code >= 95) return { label: 'Thunderstorm', icon: '⛈️' };
  return { label: 'Unknown conditions', icon: '🌡️' };
};

const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const roundTo = (value: unknown, digits = 0): number | null => {
  const n = num(value);
  if (n === null) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

// "2026-10-18T06:02" -> "6:02 AM" (the time is already local to the place).
const clockFromIso = (iso: unknown): string | null => {
  const match = /T(\d{2}):(\d{2})/.exec(String(iso ?? ''));
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes} ${suffix}`;
};

const withTimeout = <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      value => { window.clearTimeout(timer); resolve(value); },
      error => { window.clearTimeout(timer); reject(error); },
    );
  });

const fetchJson = async (url: string, ms = 8000): Promise<any> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    window.clearTimeout(timer);
  }
};

/* ------------------------------------------------------------------ */
/*  Location                                                           */
/* ------------------------------------------------------------------ */

type ResolvedLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  label: string;
  parts: { locality?: string; subdistrict?: string; district?: string; state?: string; country?: string };
  at: number;
};

let cachedLocation: ResolvedLocation | null = null;
let locationPromise: Promise<ResolvedLocation> | null = null;

class ToolError extends Error {}

const getBrowserPosition = async (): Promise<GeolocationPosition> => {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new ToolError('This browser does not support location. Do not guess the location.');
  }

  // Fail fast, with useful advice, when location is already blocked.
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (status?.state === 'denied') {
      throw new ToolError(
        'Location permission is blocked for this site. Tell the user to allow location in the browser ' +
        'address-bar site settings and ask again. Do not guess the location.',
      );
    }
  } catch (error) {
    if (error instanceof ToolError) throw error;
    /* The Permissions API is unavailable: just try. */
  }

  return new Promise<GeolocationPosition>((resolve, reject) => {
    try {
      navigator.geolocation.getCurrentPosition(
        resolve,
        geoError => {
          reject(new ToolError(
            geoError.code === geoError.PERMISSION_DENIED
              ? 'The user did not allow location access. Tell them to allow location for this site and ask again. Do not guess the location.'
              : 'The location could not be determined right now. Do not guess the location.',
          ));
        },
        { enableHighAccuracy: false, timeout: 12_000, maximumAge: POSITION_CACHE_MS },
      );
    } catch {
      reject(new ToolError('The location could not be determined right now. Do not guess the location.'));
    }
  });
};

const reverseGeocode = async (latitude: number, longitude: number): Promise<{ label: string; parts: ResolvedLocation['parts'] }> => {
  const parts: ResolvedLocation['parts'] = {};
  try {
    const reverse = await fetchJson(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=18&addressdetails=1&accept-language=en`,
      7000,
    );
    const address = reverse?.address || {};
    parts.locality = address.village || address.hamlet || address.suburb || address.neighbourhood || address.town || address.city;
    parts.subdistrict = address.mandal || address.tehsil || address.subdistrict || address.municipality || address.county || address.city_district;
    parts.district = address.state_district || address.district;
    parts.state = address.state || address.region;
    parts.country = address.country;
  } catch {
    /* Keep whatever was resolved; the label falls back below. */
  }

  const ordered = [parts.locality, parts.subdistrict, parts.district, parts.state, parts.country]
    .filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
  return { label: ordered.join(', '), parts };
};

const resolveCurrentLocation = async (): Promise<ResolvedLocation> => {
  if (cachedLocation && Date.now() - cachedLocation.at < POSITION_CACHE_MS) return cachedLocation;
  if (locationPromise) return locationPromise;

  locationPromise = (async () => {
    const position = await getBrowserPosition();
    const { latitude, longitude, accuracy } = position.coords;
    const { label, parts } = await reverseGeocode(latitude, longitude);
    const resolved: ResolvedLocation = {
      latitude,
      longitude,
      accuracyMeters: roundTo(accuracy),
      label: label || 'your current location',
      parts,
      at: Date.now(),
    };
    cachedLocation = resolved;
    return resolved;
  })().finally(() => {
    locationPromise = null;
  });

  return locationPromise;
};

/* ------------------------------------------------------------------ */
/*  Tools                                                              */
/* ------------------------------------------------------------------ */

const toolGetCurrentDateTime = (): LiveToolResult => {
  const now = new Date();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';
  return {
    fullDateTime: new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long' }).format(now),
    dayOfWeek: new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(now),
    date: new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(now),
    time: new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }).format(now),
    timezone,
    utc: now.toISOString(),
    note: "This is the user's own local date and time. Use it, not any other timezone, unless asked.",
  };
};

const toolGetUserLocation = async (): Promise<LiveToolResult> => {
  const location = await resolveCurrentLocation();
  return {
    readableLocation: location.label,
    locality: location.parts.locality ?? null,
    mandalOrSubdistrict: location.parts.subdistrict ?? null,
    district: location.parts.district ?? null,
    state: location.parts.state ?? null,
    country: location.parts.country ?? null,
    coordinates: {
      latitude: roundTo(location.latitude, 4),
      longitude: roundTo(location.longitude, 4),
      accuracyMeters: location.accuracyMeters,
    },
    note:
      'Say the location in ordinary words, from the most local level to the broadest. ' +
      'Never invent a village or mandal that is null here. Do not read coordinates unless asked.',
  };
};

type PlaceMatch = { latitude: number; longitude: number; label: string };

const geocodePlace = async (place: string): Promise<PlaceMatch | null> => {
  const [name, ...rest] = place.split(',').map(part => part.trim()).filter(Boolean);
  if (!name) return null;
  const hints = rest.join(' ').toLowerCase();

  const geo = await fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=8&language=en&format=json`,
  );
  const results: any[] = Array.isArray(geo?.results) ? geo.results : [];
  const usable = results.filter(r => Number.isFinite(r?.latitude) && Number.isFinite(r?.longitude));
  if (!usable.length) return null;

  // "Paris, Texas" / "Springfield, USA": prefer the result whose region or country matches the hint.
  const best =
    (hints && usable.find(r =>
      [r.admin1, r.admin2, r.country, r.country_code].filter(Boolean).some(v => hints.includes(String(v).toLowerCase())),
    )) || usable[0];

  return {
    latitude: best.latitude,
    longitude: best.longitude,
    label: [best.name, best.admin1, best.country].filter(Boolean).join(', '),
  };
};

const toolGetWeather = async (args: Record<string, unknown>, effects: LiveToolEffects): Promise<LiveToolResult> => {
  const requestedPlace = typeof args.place === 'string' ? args.place.trim() : '';
  const usesCurrentLocation = !requestedPlace || /^(here|my location|near me|the area|current location)$/i.test(requestedPlace);

  let latitude: number;
  let longitude: number;
  let label: string;

  if (!usesCurrentLocation) {
    let match: PlaceMatch | null = null;
    try {
      match = await geocodePlace(requestedPlace);
    } catch {
      return { error: `The place lookup service is not reachable right now, so the weather for "${requestedPlace}" could not be retrieved. Say so; do not invent conditions.` };
    }
    if (!match) {
      return { error: `No place called "${requestedPlace}" was found. Ask the user to repeat or spell the place name.` };
    }
    ({ latitude, longitude, label } = match);
  } else {
    const location = await resolveCurrentLocation();
    ({ latitude, longitude } = location);
    label = location.label;
  }

  let weather: any;
  try {
    weather = await fetchJson(
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}` +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset' +
      '&timezone=auto&forecast_days=3',
    );
  } catch {
    return { error: 'Live weather could not be retrieved right now. Say so clearly; do not invent current conditions.' };
  }

  const current = weather?.current;
  if (!current) {
    return { error: 'The weather service returned no data. Say so clearly; do not invent current conditions.' };
  }

  const isDay = Number(current.is_day) !== 0;
  const daily = weather.daily || {};
  const days: string[] = Array.isArray(daily.time) ? daily.time : [];

  effects.onWeather?.({
    label: usesCurrentLocation ? 'Your location' : label,
    at: Date.now(),
    current,
    daily,
  });

  return {
    location: label,
    isUsersCurrentLocation: usesCurrentLocation,
    timezone: weather.timezone ?? null,
    now: {
      conditions: describeWeatherCode(Number(current.weather_code), isDay).label,
      temperatureC: roundTo(current.temperature_2m, 1),
      feelsLikeC: roundTo(current.apparent_temperature, 1),
      humidityPercent: roundTo(current.relative_humidity_2m),
      windSpeedKmh: roundTo(current.wind_speed_10m),
      cloudCoverPercent: roundTo(current.cloud_cover),
      rainRightNowMm: roundTo(current.precipitation, 1),
      isDaytime: isDay,
    },
    forecast: days.map((date, index) => ({
      date,
      weekday: index === 0 ? 'Today' : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' }),
      conditions: describeWeatherCode(Number(daily.weather_code?.[index]), true).label,
      highC: roundTo(daily.temperature_2m_max?.[index]),
      lowC: roundTo(daily.temperature_2m_min?.[index]),
      chanceOfRainPercent: roundTo(daily.precipitation_probability_max?.[index]),
      sunrise: clockFromIso(daily.sunrise?.[index]),
      sunset: clockFromIso(daily.sunset?.[index]),
    })),
    note: 'Metric units. Speak it naturally and briefly (for example "about 31 degrees and partly cloudy"); never read codes or raw numbers lists.',
  };
};

const toolSearchKnowledgeBase = async (args: Record<string, unknown>): Promise<LiveToolResult> => {
  const question = typeof args.question === 'string' ? args.question.trim() : '';
  if (!question) return { error: 'No question was provided for the knowledge base search.' };

  try {
    const result = (await fetchWithAuth('/api/rag/ask', {
      method: 'POST',
      body: JSON.stringify({ question: question.slice(0, 4000) }),
    })) as { answer?: string; sources?: Array<{ documentName?: string }> } | null;

    // Citation markers like [1] are for reading, not for speaking.
    const answer = String(result?.answer ?? '').replace(/\s*\[\d+\]/g, '').trim();
    const sources = Array.from(new Set((result?.sources ?? []).map(s => s?.documentName).filter(Boolean)));
    if (!answer) return { error: 'The knowledge base returned no answer.' };
    return {
      answer: answer.length > 1800 ? `${answer.slice(0, 1800)}…` : answer,
      sourceDocuments: sources,
      note: 'Answer only from this. If it says nothing relevant was found, say so.',
    };
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'The knowledge base could not be searched.';
    return { error: `${message} Tell the user briefly; do not guess the content of their documents.` };
  }
};

/* ------------------------------------------------------------------ */
/*  Dispatcher                                                         */
/* ------------------------------------------------------------------ */

export const runLiveTool = async (
  name: string,
  args: Record<string, unknown> | undefined,
  effects: LiveToolEffects = {},
): Promise<LiveToolResult> => {
  const input = args && typeof args === 'object' ? args : {};

  const run = async (): Promise<LiveToolResult> => {
    switch (name) {
      case 'get_current_datetime':
        return toolGetCurrentDateTime();
      case 'get_user_location':
        return toolGetUserLocation();
      case 'get_weather':
        return toolGetWeather(input, effects);
      case 'search_knowledge_base':
        return toolSearchKnowledgeBase(input);
      default:
        return { error: `Unknown tool "${name}".` };
    }
  };

  try {
    return await withTimeout(run(), TOOL_TIMEOUT_MS, 'The lookup took too long. Tell the user and offer to try again.');
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'The lookup failed.';
    return { error: message };
  }
};
