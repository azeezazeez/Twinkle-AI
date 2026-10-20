import { fetchWithAuth, type WeatherSnapshot } from './api';
import { getPreciseLocation, isLocationPermissionGranted, describeLocationError } from './geolocation';

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
      'and whenever you need to know "today" or "now". If the user asks the time or date in another ' +
      'city or country (for example "what time is it in London"), pass it in `place`. Omit `place` for ' +
      "the user's own local time.",
    parameters: {
      type: 'OBJECT',
      properties: {
        place: {
          type: 'STRING',
          description: 'Optional city or country whose current time is wanted, for example "Tokyo" or "New York". Omit for the user\'s own time.',
        },
      },
    },
  },
  {
    name: 'get_user_location',
    description:
      "Returns the user's live, pinpoint location measured by their device GPS (village or locality, " +
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
    name: 'search_web',
    description:
      'Looks up general facts on the web (people, places, companies, events, science, history, sports, ' +
      'definitions, "who is", "what is", "tell me about"). Call it for any factual question you are not ' +
      'completely sure about, or that may have changed recently. Use a short, specific query.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'A short search query, for example "Chandrayaan 3" or "Sundar Pichai".',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_exchange_rate',
    description:
      'Returns the LIVE currency exchange rate and converts an amount. Call it for any question about ' +
      'currency conversion, dollar / rupee / euro rates, or "how much is X in Y".',
    parameters: {
      type: 'OBJECT',
      properties: {
        from: { type: 'STRING', description: 'Three-letter source currency code, for example "USD".' },
        to: { type: 'STRING', description: 'Three-letter target currency code, for example "INR".' },
        amount: { type: 'NUMBER', description: 'Amount to convert. Defaults to 1.' },
      },
      required: ['from', 'to'],
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
  search_web: 'Looking that up',
  get_exchange_rate: 'Checking the exchange rate',
  search_knowledge_base: 'Searching your documents',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const TOOL_TIMEOUT_MS = 20_000;
// Live location: a fix is only reused for a few seconds, never minutes.
const POSITION_CACHE_MS = 20_000;

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
  /** Always the device position. IP-based guesses are never used. */
  source: 'gps';
  at: number;
};

let cachedLocation: ResolvedLocation | null = null;
let locationPromise: Promise<ResolvedLocation> | null = null;

class ToolError extends Error {}

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
    try {
      // A fresh, high-accuracy device fix. No cached or IP-based fallback exists.
      const fix = await getPreciseLocation();
      const { label, parts } = await reverseGeocode(fix.latitude, fix.longitude);
      const resolved: ResolvedLocation = {
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracyMeters: roundTo(fix.accuracy),
        label: label || 'your current location',
        parts,
        source: 'gps',
        at: Date.now(),
      };
      cachedLocation = resolved;
      return resolved;
    } catch (error) {
      throw new ToolError(`${describeLocationError(error)} Do not guess the location.`);
    }
  })().finally(() => {
    locationPromise = null;
  });

  return locationPromise;
};

/**
 * Starts resolving the user's location in the background so the voice session
 * already knows roughly where they are on the first question. It never shows a
 * permission prompt: the device position is used only if it was already allowed,
 * otherwise nothing is guessed.
 */
let warmLocation: ResolvedLocation | null = null;
export const warmLiveContext = async (): Promise<void> => {
  try {
    // Only runs silently when permission was already granted; never prompts, never guesses.
    if (await isLocationPermissionGranted()) warmLocation = await resolveCurrentLocation();
  } catch {
    warmLocation = null;
  }
};

/** One sentence describing what is already known about the user's whereabouts. */
export const getLiveContextLine = (): string => {
  if (!warmLocation) return '';
  const meters = warmLocation.accuracyMeters;
  const precision = meters !== null ? `accurate to about ${meters} m` : 'from the device';
  return `Known location of the user (device GPS, ${precision}): ${warmLocation.label}. Use it for "near me" and local questions; call get_user_location for the exact, current answer.`;
};

/* ------------------------------------------------------------------ */
/*  Tools                                                              */
/* ------------------------------------------------------------------ */

const formatDateTime = (now: Date, timeZone?: string): Record<string, string> => {
  const zone = timeZone ? { timeZone } : {};
  return {
    fullDateTime: new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeStyle: 'long', ...zone }).format(now),
    dayOfWeek: new Intl.DateTimeFormat(undefined, { weekday: 'long', ...zone }).format(now),
    date: new Intl.DateTimeFormat(undefined, { dateStyle: 'long', ...zone }).format(now),
    time: new Intl.DateTimeFormat(undefined, { timeStyle: 'short', ...zone }).format(now),
  };
};

const toolGetCurrentDateTime = async (args: Record<string, unknown>): Promise<LiveToolResult> => {
  const now = new Date();
  const requestedPlace = typeof args.place === 'string' ? args.place.trim() : '';
  const ownZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown';

  if (requestedPlace && !/^(here|my location|local|my time|current location)$/i.test(requestedPlace)) {
    try {
      const match = await geocodePlace(requestedPlace);
      if (match?.timezone) {
        return {
          place: match.label,
          ...formatDateTime(now, match.timezone),
          timezone: match.timezone,
          utc: now.toISOString(),
          note: `This is the current date and time in ${match.label}, not the user's own time.`,
        };
      }
    } catch { /* fall through to the user's own time below */ }
    return {
      ...formatDateTime(now),
      timezone: ownZone,
      utc: now.toISOString(),
      note: `The time zone of "${requestedPlace}" could not be looked up. Give the user's own local time below and say so in one short phrase; do not refuse.`,
    };
  }

  return {
    ...formatDateTime(now),
    timezone: ownZone,
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
    locationSource: 'device GPS (live, high accuracy)',
    note:
      'This is the live position measured by the device just now. ' +
      'Say the location in ordinary words, from the most local level to the broadest. ' +
      'Never invent a village or mandal that is null here. Do not read coordinates unless asked.',
  };
};

type PlaceMatch = { latitude: number; longitude: number; label: string; timezone?: string };

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
    timezone: typeof best.timezone === 'string' ? best.timezone : undefined,
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
    let location: ResolvedLocation;
    try {
      location = await resolveCurrentLocation();
    } catch (locationError) {
      const message = locationError instanceof Error ? locationError.message : 'Location is unavailable.';
      return { error: `${message} Ask the user which city they want the weather for, then call get_weather again with that place.` };
    }
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

const toolSearchWeb = async (args: Record<string, unknown>): Promise<LiveToolResult> => {
  const query = typeof args.query === 'string' ? args.query.trim() : '';
  if (!query) return { error: 'No search query was provided.' };

  try {
    const data = await fetchJson(
      'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search' +
      `&gsrsearch=${encodeURIComponent(query)}&gsrlimit=3&prop=extracts&exintro=1&explaintext=1&exchars=650&redirects=1`,
      8000,
    );
    const pages: any[] = Object.values(data?.query?.pages ?? {});
    const results = pages
      .sort((a, b) => Number(a?.index ?? 99) - Number(b?.index ?? 99))
      .map(page => ({ title: String(page?.title ?? ''), summary: String(page?.extract ?? '').trim() }))
      .filter(item => item.title && item.summary);

    if (!results.length) {
      return {
        results: [],
        note: 'Nothing matching was found online. Answer from your own knowledge as helpfully and confidently as you can, and say briefly if it may not be the latest. Never reply with just "I don\'t know".',
      };
    }
    return {
      query,
      results,
      note:
        'Reference summaries from Wikipedia. Answer the question directly from the most relevant one in one or two spoken sentences. ' +
        'For breaking news, live scores or prices these may be slightly out of date: say so in a few words rather than refusing.',
    };
  } catch {
    return {
      error: 'The web lookup is not reachable right now. Answer from your own knowledge as helpfully as you can, note briefly that it may not be the very latest, and never reply with just "I don\'t know".',
    };
  }
};

const toolGetExchangeRate = async (args: Record<string, unknown>): Promise<LiveToolResult> => {
  const from = String(args.from ?? '').trim().toUpperCase();
  const to = String(args.to ?? '').trim().toUpperCase();
  const amount = num(args.amount) ?? 1;
  if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
    return { error: 'Use three-letter currency codes such as USD, INR, EUR. Work out the right codes and call again.' };
  }

  try {
    const data = await fetchJson(`https://open.er-api.com/v6/latest/${from}`, 8000);
    const rate = num(data?.rates?.[to]);
    if (data?.result === 'error' || rate === null) {
      return { error: `No exchange rate was found for ${from} to ${to}. Check the currency codes.` };
    }
    return {
      from,
      to,
      amount,
      rate: roundTo(rate, 4),
      converted: roundTo(amount * rate, 2),
      updated: typeof data?.time_last_update_utc === 'string' ? data.time_last_update_utc : null,
      note: 'Say the converted amount naturally, for example "about 83 rupees". Rates change during the day.',
    };
  } catch {
    return { error: 'The live exchange rate could not be retrieved right now. Say so briefly and offer to try again.' };
  }
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
        return toolGetCurrentDateTime(input);
      case 'get_user_location':
        return toolGetUserLocation();
      case 'get_weather':
        return toolGetWeather(input, effects);
      case 'search_web':
        return toolSearchWeb(input);
      case 'get_exchange_rate':
        return toolGetExchangeRate(input);
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
