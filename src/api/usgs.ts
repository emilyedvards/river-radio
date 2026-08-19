export type MeasurementKind = "flow" | "stage" | "temperature";

export type MeasurementPoint = {
  time: string;
  value: number;
};

export type Measurement = {
  kind: MeasurementKind;
  parameterCode: string;
  value: number;
  unit: string;
  time: string;
  history: MeasurementPoint[];
};

export type Station = {
  id: string;
  name: string;
  riverName: string;
  cityName?: string;
  location: string;
  stateName?: string;
  countyName?: string;
  countryName?: string;
};

export type ChannelData = {
  station: Station;
  measurements: Partial<Record<MeasurementKind, Measurement>>;
  movement: -1 | 0 | 1;
  measuredAt?: string;
};

const API_ROOT = "https://api.waterdata.usgs.gov/ogcapi/v0/collections";
const PARAMS: Record<MeasurementKind, string> = {
  flow: "00060",
  stage: "00065",
  temperature: "00010",
};

type Feature = {
  properties: Record<string, string | number | null>;
};

type FeatureCollection = {
  features?: Feature[];
};

const CACHE_TTL_MS = 4 * 60 * 1000;

class UsgsRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`USGS request failed (${status})`);
    this.status = status;
  }
}

const cacheKey = (url: URL) => `river-radio:${url.toString()}`;

const readCache = <T>(url: URL, maxAgeMs = CACHE_TTL_MS): T | undefined => {
  try {
    const raw = window.sessionStorage.getItem(cacheKey(url));
    if (!raw) return undefined;
    const cached = JSON.parse(raw) as { savedAt: number; value: T };
    if (Date.now() - cached.savedAt > maxAgeMs) return undefined;
    return cached.value;
  } catch {
    return undefined;
  }
};

const writeCache = <T>(url: URL, value: T) => {
  try {
    window.sessionStorage.setItem(cacheKey(url), JSON.stringify({ savedAt: Date.now(), value }));
  } catch {
    // Cache failure should never block the artwork.
  }
};

const toJson = async <T>(url: URL): Promise<T> => {
  const cached = readCache<T>(url);
  if (cached) return cached;

  let response = await fetch(url);
  if (response.status === 429 && !url.searchParams.has("api_key")) {
    const retryUrl = new URL(url);
    retryUrl.searchParams.set("api_key", "DEMO_KEY");
    const retryCached = readCache<T>(retryUrl);
    if (retryCached) return retryCached;
    response = await fetch(retryUrl);
    if (response.ok) {
      const value = await response.json() as T;
      writeCache(retryUrl, value);
      writeCache(url, value);
      return value;
    }
  }

  if (!response.ok) {
    if (response.status === 429) {
      const stale = readCache<T>(url, 60 * 60 * 1000);
      if (stale) return stale;
    }
    throw new UsgsRequestError(response.status);
  }
  const value = await response.json() as T;
  writeCache(url, value);
  return value;
};

const collectionUrl = (collection: string) =>
  new URL(`${API_ROOT}/${collection}/items`);

const parseValue = (value: unknown) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const getString = (props: Record<string, string | number | null>, key: string) => {
  const value = props[key];
  return value === null || value === undefined ? "" : String(value);
};

const kindFromParameter = (code: string): MeasurementKind | undefined =>
  (Object.keys(PARAMS) as MeasurementKind[]).find((kind) => PARAMS[kind] === code);

const cleanStationName = (name: string) =>
  name
    .replace(/\bRV\b/gi, "River")
    .replace(/\bR\b/gi, "River")
    .replace(/\bFK\b/gi, "Fork")
    .replace(/\bLK\b/gi, "Lake")
    .replace(/\bNR\b/gi, "near")
    .replace(/\bABV\b/gi, "above")
    .replace(/\bBLW\b/gi, "below")
    .replace(/\s+/g, " ")
    .trim();

const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split(" ")
    .map((word) => (word.length ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ")
    .replace(/\bAt\b/g, "at")
    .replace(/\bNear\b/g, "near");

const cityFromStationName = (rawName: string) => {
  const matches = [...rawName.matchAll(/\b(?:at|near|above|below)\s+([^,]+)/gi)];
  const place = matches[matches.length - 1]?.[1]
    .replace(/\b[A-Z]{2}$/i, "")
    .replace(/\b(?:River|Creek|Lake|Bridge|Gage|Canal|Channel)\b$/i, "")
    .trim();
  return place ? titleCase(place) : undefined;
};

const stationFromProperties = (props: Record<string, string | number | null>): Station => {
  const rawName = cleanStationName(getString(props, "monitoring_location_name"));
  const state = getString(props, "state_name");
  const country = getString(props, "country_name") || "United States";
  const county = getString(props, "county_name").replace(/\s+County$/i, "");
  const city = cityFromStationName(rawName) ?? county;
  const location = [city, state].filter(Boolean).join(", ") || rawName.match(/,\s*([A-Z]{2})$/)?.[1] || country;

  return {
    id: getString(props, "monitoring_location_id") || getString(props, "id"),
    name: titleCase(rawName),
    riverName: titleCase(rawName.split(/\bbelow\b|\babove\b|\bat\b|\bnear\b|,/i)[0]?.trim() || rawName),
    cityName: city ? titleCase(city) : undefined,
    location: titleCase(location),
    stateName: state,
    countyName: county,
    countryName: country === "United States of America" ? "United States" : titleCase(country),
  };
};

const uniqueStations = (features: Feature[]) => {
  const seen = new Map<string, Station>();
  for (const feature of features) {
    const station = stationFromProperties(feature.properties);
    if (station.id && !seen.has(station.id)) seen.set(station.id, station);
  }
  return [...seen.values()];
};

export const isRateLimitError = (error: unknown) =>
  error instanceof UsgsRequestError && error.status === 429;

export const searchStations = async (query: string): Promise<Station[]> => {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const terms = trimmed
    .replace(/\briver\b/gi, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);
  const filter =
    terms.length > 0
      ? terms.map((term) => `monitoring_location_name ILIKE '%${term.replace(/'/g, "''")}%'`).join(" AND ")
      : `monitoring_location_name ILIKE '%${trimmed.replace(/'/g, "''")}%'`;

  const url = collectionUrl("latest-continuous");
  url.searchParams.set("f", "json");
  url.searchParams.set("limit", "10");
  url.searchParams.set("parameter_code", `${PARAMS.flow},${PARAMS.stage}`);
  url.searchParams.set("filter", filter);

  const data = await toJson<FeatureCollection>(url);
  const candidates = uniqueStations(data.features ?? []).slice(0, 3);
  const stations = await Promise.allSettled(candidates.map((station) => fetchStation(station.id)));
  return stations.flatMap((result, index) =>
    result.status === "fulfilled" ? [result.value] : [candidates[index]],
  );
};

export const fetchStation = async (stationId: string): Promise<Station> => {
  const url = collectionUrl("monitoring-locations");
  url.searchParams.set("f", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("id", stationId);
  const data = await toJson<FeatureCollection>(url);
  const feature = data.features?.[0];
  if (!feature) throw new Error("Station not found");
  return stationFromProperties(feature.properties);
};

const fetchLatestMeasurements = async (stationId: string) => {
  const url = collectionUrl("latest-continuous");
  url.searchParams.set("f", "json");
  url.searchParams.set("limit", "12");
  url.searchParams.set("monitoring_location_id", stationId);
  url.searchParams.set("parameter_code", Object.values(PARAMS).join(","));
  const data = await toJson<FeatureCollection>(url);
  const measurements: Partial<Record<MeasurementKind, Measurement>> = {};

  for (const feature of data.features ?? []) {
    const code = getString(feature.properties, "parameter_code");
    const kind = kindFromParameter(code);
    const value = parseValue(feature.properties.value);
    if (!kind || value === undefined || measurements[kind]) continue;
    measurements[kind] = {
      kind,
      parameterCode: code,
      value,
      unit: getString(feature.properties, "unit_of_measure"),
      time: getString(feature.properties, "time"),
      history: [],
    };
  }

  return measurements;
};

const fetchRecentHistory = async (stationId: string, kind: MeasurementKind) => {
  const end = new Date();
  const start = new Date(end.getTime() - 36 * 60 * 60 * 1000);
  const url = collectionUrl("continuous");
  url.searchParams.set("f", "json");
  url.searchParams.set("limit", "160");
  url.searchParams.set("monitoring_location_id", stationId);
  url.searchParams.set("parameter_code", PARAMS[kind]);
  url.searchParams.set("datetime", `${start.toISOString()}/${end.toISOString()}`);

  try {
    const data = await toJson<FeatureCollection>(url);
    return (data.features ?? [])
      .map((feature) => ({
        time: getString(feature.properties, "time"),
        value: parseValue(feature.properties.value) ?? Number.NaN,
      }))
      .filter((point) => point.time && Number.isFinite(point.value))
      .sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
  } catch {
    return [];
  }
};

const inferMovement = (measurement?: Measurement): -1 | 0 | 1 => {
  if (!measurement || measurement.history.length < 5) return 0;
  const points = measurement.history;
  const early = points.slice(0, Math.ceil(points.length / 3));
  const late = points.slice(-Math.ceil(points.length / 3));
  const avg = (items: MeasurementPoint[]) =>
    items.reduce((sum, item) => sum + item.value, 0) / items.length;
  const first = avg(early);
  const last = avg(late);
  const spread = Math.max(...points.map((p) => p.value)) - Math.min(...points.map((p) => p.value));
  const threshold = Math.max(spread * 0.08, Math.abs(measurement.value) * 0.01, 0.02);
  if (last - first > threshold) return 1;
  if (first - last > threshold) return -1;
  return 0;
};

export const fetchChannelData = async (stationId: string, stationHint?: Station): Promise<ChannelData> => {
  const [station, latest] = await Promise.all([
    stationHint ? Promise.resolve(stationHint) : fetchStation(stationId),
    fetchLatestMeasurements(stationId),
  ]);

  const primaryKind = latest.flow ? "flow" : latest.stage ? "stage" : undefined;
  if (primaryKind) {
    const primary = latest[primaryKind];
    if (primary) primary.history = await fetchRecentHistory(stationId, primaryKind);
  }

  if (!latest.flow && !latest.stage) {
    throw new Error("No live channel found for this river. Try another location or river.");
  }

  const measuredAt = [latest.flow?.time, latest.stage?.time, latest.temperature?.time]
    .filter(Boolean)
    .sort((a, b) => Date.parse(b as string) - Date.parse(a as string))[0];

  return {
    station,
    measurements: latest,
    movement: inferMovement(latest.flow ?? latest.stage),
    measuredAt,
  };
};

export const usgsStationUrl = (stationId: string) =>
  `https://waterdata.usgs.gov/monitoring-location/${stationId.replace("USGS-", "")}/`;
