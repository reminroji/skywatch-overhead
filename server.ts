import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  Aircraft,
  AircraftMetadata,
  AircraftPhotoInfo,
  AirportEndpoint,
  CraftKind,
  FlightRouteInfo,
  ShippingLaneFeature,
  TrailPoint,
  Vessel,
  VesselKind,
  WeatherOverlaySnapshot,
  WeatherStationSample,
} from './src/types/airspace.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// In-memory flight trail buffer & caches
const TRAIL_WINDOW_MS = 15 * 60 * 1000;
const trailStore = new Map<string, { points: TrailPoint[]; updatedAt: number }>();
const metaCache = new Map<string, { data: unknown; expiresAt: number }>();
const photoCache = new Map<string, { photo: AircraftPhotoInfo | null; expiresAt: number }>();
const routeCache = new Map<string, { route: FlightRouteInfo | null; expiresAt: number }>();
const airportCache = new Map<string, { airport: AirportEndpoint | null; expiresAt: number }>();
const inFlightRoutes = new Map<string, Promise<FlightRouteInfo | null>>();

// Maritime shipping lanes & vessel caches
let shippingLanesCache: { features: ShippingLaneFeature[]; fetchedAt: number; expiresAt: number } | null = null;
let noaaVosCache: { vessels: Omit<Vessel, 'distanceNm' | 'bearingDeg' | 'compassDir'>[]; expiresAt: number } | null = null;
let digitrafficCache: { vessels: Omit<Vessel, 'distanceNm' | 'bearingDeg' | 'compassDir'>[]; expiresAt: number } | null = null;
const aisStreamStore = new Map<string, Omit<Vessel, 'distanceNm' | 'bearingDeg' | 'compassDir'>>();

// Real-time weather caches (RainViewer radar frames + MET Norway Locationforecast)
let rainViewerCache: {
  host: string;
  latestPath: string;
  latestTime: number;
  expiresAt: number;
} | null = null;
const metNoCache = new Map<
  string,
  {
    sample: Omit<WeatherStationSample, 'id' | 'label'>;
    expiresAt: number;
  }
>();

const HELICOPTER_TYPES = new Set([
  'R22', 'R44', 'R66', 'B06', 'B06T', 'B206', 'B212', 'B222', 'B230', 'B407',
  'B412', 'B427', 'B429', 'B430', 'B505', 'EC20', 'EC25', 'EC30', 'EC35', 'EC45',
  'EC55', 'EC75', 'H125', 'H130', 'H135', 'H145', 'H155', 'H160', 'H175', 'H215',
  'H225', 'AS32', 'AS50', 'AS55', 'AS65', 'S76', 'S92', 'S70', 'S61', 'S64',
  'S58', 'S55', 'S300', 'H60', 'UH60', 'SH60', 'MH60', 'HH60', 'AW09', 'A109',
  'A119', 'A139', 'A169', 'A189', 'A149', 'MD50', 'MD52', 'MD60', 'MD90', 'H500',
  'H269', 'EN28', 'EN48', 'CABR', 'G2CA', 'BK17', 'BO10', 'NH90', 'CH47', 'H47',
  'CH53', 'H53', 'V22', 'MI8', 'MI24', 'MI26', 'KA32', 'KMAX', 'ALH', 'LYNX',
  'EH10', 'GAZL', 'PUMA', 'TIGR', 'APAC', 'AH64', 'AH1', 'OH58', 'UH1', 'HUEY',
  'SYCA', 'EXPL', 'EXEC', 'F280', 'SCHW', 'WASP', 'SCOR',
]);

const FIGHTER_TYPES = new Set([
  'F16', 'F15', 'F18', 'FA18', 'EA18', 'F22', 'F35', 'EF20', 'EUFI', 'RFAL',
  'T38', 'T45', 'T6', 'TEX2', 'A10', 'B1', 'B2', 'B52', 'F5', 'F4', 'F14',
  'AV8B', 'HAWK', 'M2000', 'MIR2', 'TOR', 'GRPN', 'JAS3', 'SB39', 'SU27',
  'SU30', 'SU34', 'SU35', 'MIG29', 'MIG31', 'L39', 'L159', 'M346', 'PC21',
  'PC9', 'TUCA', 'AT27', 'ALPH', 'K8', 'JF17', 'J10', 'J20', 'F117', 'SR71', 'U2',
]);

const HEAVY_PREFIXES = [
  'A33', 'A34', 'A35', 'A38', 'B74', 'B76', 'B77', 'B78', 'B75', 'MD11', 'DC10',
  'C17', 'C5', 'AN12', 'A124', 'IL76', 'K35R', 'KC10', 'KC46', 'B52',
];

const COMMERCIAL_PREFIXES = [
  'A31', 'A32', 'A20N', 'A21N', 'A19N', 'A22', 'BCS', 'B71', 'B72', 'B73',
  'B37M', 'B38M', 'B39M', 'E17', 'E19', 'E75', 'E29', 'CRJ', 'DH8', 'AT7',
  'AT4', 'MD8', 'MD9', 'F100', 'F70', 'SU95', 'C919', 'ARJ', 'B190', 'JS31',
];

const LIGHT_PREFIXES = [
  'C15', 'C17', 'C18', 'C20', 'C21', 'C25', 'C51', 'C52', 'C55', 'C56', 'C65',
  'C68', 'C70', 'C75', 'PA2', 'PA3', 'PA4', 'SR2', 'DA2', 'DA4', 'DA6', 'BE2',
  'BE3', 'BE4', 'BE5', 'BE9', 'PC12', 'PC24', 'TBM', 'M20', 'RV', 'GLF', 'GLEX',
  'G550', 'G650', 'CL3', 'CL6', 'LJ3', 'LJ4', 'LJ6', 'LJ7', 'FA5', 'FA7', 'FA8',
  'HDJT', 'SF50', 'EA50', 'E50P', 'E55P', 'P28', 'DR40', 'AC11', 'C402', 'C414',
];

function classifyCraft(
  category: string | undefined,
  typeCode: string | undefined,
  isMilitary: boolean
): CraftKind {
  const cat = (category || '').toUpperCase().trim();
  const t = (typeCode || '').toUpperCase().trim();

  if (cat === 'A7' || (t && HELICOPTER_TYPES.has(t))) {
    return 'helicopter';
  }
  if (cat === 'A6' || (t && FIGHTER_TYPES.has(t))) {
    return 'fighter';
  }
  if (cat.startsWith('B') || cat.startsWith('C')) {
    return 'special';
  }
  if (cat === 'A5' || (t && HEAVY_PREFIXES.some((p) => t.startsWith(p)))) {
    return 'heavy';
  }
  if (cat === 'A3' || cat === 'A4' || (t && COMMERCIAL_PREFIXES.some((p) => t.startsWith(p)))) {
    return 'commercial';
  }
  if (cat === 'A1' || cat === 'A2' || (t && LIGHT_PREFIXES.some((p) => t.startsWith(p)))) {
    return 'light';
  }
  if (isMilitary) {
    return 'fighter';
  }
  return 'unknown';
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function computeBearingDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function bearingToCompass(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(deg / 22.5) % 16;
  return dirs[idx];
}

function updateTrail(
  hex: string,
  lat: number,
  lng: number,
  altFt: number,
  gsKts: number,
  now: number
): TrailPoint[] {
  const key = hex.toLowerCase();
  const existing = trailStore.get(key);
  const point: TrailPoint = { lat, lng, altFt, gsKts, ts: now };

  if (!existing) {
    const pts = [point];
    trailStore.set(key, { points: pts, updatedAt: now });
    return pts;
  }

  const cutoff = now - TRAIL_WINDOW_MS;
  while (existing.points.length > 0 && existing.points[0].ts < cutoff) {
    existing.points.shift();
  }

  const last = existing.points[existing.points.length - 1];
  if (!last) {
    existing.points.push(point);
  } else {
    const movedMeters = haversineMeters(last.lat, last.lng, lat, lng);
    const altChanged = Math.abs(altFt - last.altFt) >= 25;
    const speedChanged = Math.abs(gsKts - last.gsKts) >= 2;
    if (movedMeters >= 35 || altChanged || speedChanged || now - last.ts >= 5000) {
      existing.points.push(point);
      if (existing.points.length > 200) {
        existing.points.shift();
      }
    }
  }
  existing.updatedAt = now;
  return [...existing.points];
}

function pruneTrails(now: number): void {
  for (const [hex, entry] of trailStore.entries()) {
    if (now - entry.updatedAt > TRAIL_WINDOW_MS) {
      trailStore.delete(hex);
    }
  }
}

function isLikelyScheduledCallsign(callsign: string, registration: string | null): boolean {
  const cs = callsign.trim().toUpperCase();
  if (!cs || cs.length < 4) return false;
  if (registration && cs === registration.replace(/[^A-Z0-9]/g, '').toUpperCase()) return false;
  // Typically 3-letter ICAO airline prefix + digits/suffix (e.g., UAL123, DAL676, BAW117)
  return /^[A-Z]{3}[0-9]{1,4}[A-Z]{0,2}$/.test(cs);
}

async function fetchAirportByIcao(icao: string): Promise<AirportEndpoint | null> {
  const code = icao.trim().toUpperCase();
  if (!code) return null;

  const cached = airportCache.get(code);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.airport;
  }

  try {
    const res = await fetch(`https://hexdb.io/api/v1/airport/icao/${encodeURIComponent(code)}`, {
      signal: AbortSignal.timeout(3500),
      headers: { 'User-Agent': 'SkywatchOverhead/1.0' },
    });
    if (res.ok) {
      const json = (await res.json()) as {
        icao?: string;
        iata?: string;
        airport?: string;
        region_name?: string;
        country_code?: string;
        latitude?: number;
        longitude?: number;
      };
      if (typeof json.latitude === 'number' && typeof json.longitude === 'number') {
        const airport: AirportEndpoint = {
          icao: json.icao || code,
          iata: json.iata || null,
          name: json.airport || code,
          city: json.region_name || null,
          country: json.country_code || null,
          lat: json.latitude,
          lng: json.longitude,
        };
        airportCache.set(code, { airport, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
        return airport;
      }
    }
  } catch {
    // Fallback below
  }

  airportCache.set(code, { airport: null, expiresAt: Date.now() + 10 * 60 * 1000 });
  return null;
}

async function resolveFlightRoute(callsign: string): Promise<FlightRouteInfo | null> {
  const cs = callsign.trim().toUpperCase();
  if (!cs || cs.length < 3) return null;

  const cached = routeCache.get(cs);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.route;
  }

  const existingInFlight = inFlightRoutes.get(cs);
  if (existingInFlight) {
    return existingInFlight;
  }

  const task = (async (): Promise<FlightRouteInfo | null> => {
    // Primary: adsbdb.com (rich origin + destination airports + airline)
    try {
      const res = await fetch(`https://api.adsbdb.com/v0/callsign/${encodeURIComponent(cs)}`, {
        signal: AbortSignal.timeout(4000),
        headers: { 'User-Agent': 'SkywatchOverhead/1.0' },
      });
      if (res.ok) {
        const json = (await res.json()) as {
          response?: {
            flightroute?: {
              callsign_iata?: string;
              airline?: { name?: string };
              origin?: {
                iata_code?: string;
                icao_code?: string;
                name?: string;
                municipality?: string;
                country_name?: string;
                latitude?: number;
                longitude?: number;
              };
              destination?: {
                iata_code?: string;
                icao_code?: string;
                name?: string;
                municipality?: string;
                country_name?: string;
                latitude?: number;
                longitude?: number;
              };
            };
          };
        };

        const fr = json.response?.flightroute;
        if (
          fr?.origin &&
          fr?.destination &&
          typeof fr.origin.latitude === 'number' &&
          typeof fr.origin.longitude === 'number' &&
          typeof fr.destination.latitude === 'number' &&
          typeof fr.destination.longitude === 'number'
        ) {
          const route: FlightRouteInfo = {
            callsignIata: fr.callsign_iata || null,
            airlineName: fr.airline?.name || null,
            origin: {
              iata: fr.origin.iata_code || null,
              icao: fr.origin.icao_code || '',
              name: fr.origin.name || fr.origin.icao_code || 'Origin Airport',
              city: fr.origin.municipality || null,
              country: fr.origin.country_name || null,
              lat: fr.origin.latitude,
              lng: fr.origin.longitude,
            },
            destination: {
              iata: fr.destination.iata_code || null,
              icao: fr.destination.icao_code || '',
              name: fr.destination.name || fr.destination.icao_code || 'Destination Airport',
              city: fr.destination.municipality || null,
              country: fr.destination.country_name || null,
              lat: fr.destination.latitude,
              lng: fr.destination.longitude,
            },
            source: 'ADSBDB',
          };
          routeCache.set(cs, { route, expiresAt: Date.now() + 30 * 60 * 1000 });
          return route;
        }
      }
    } catch {
      // Fall back to hexdb.io
    }

    // Secondary: hexdb.io route + airport lookup
    try {
      const rtRes = await fetch(`https://hexdb.io/api/v1/route/icao/${encodeURIComponent(cs)}`, {
        signal: AbortSignal.timeout(3500),
        headers: { 'User-Agent': 'SkywatchOverhead/1.0' },
      });
      if (rtRes.ok) {
        const rtJson = (await rtRes.json()) as { route?: string };
        if (rtJson.route && rtJson.route.includes('-')) {
          const parts = rtJson.route.split('-').map((p) => p.trim()).filter(Boolean);
          if (parts.length >= 2) {
            const origCode = parts[0];
            const destCode = parts[parts.length - 1];
            const [origin, destination] = await Promise.all([
              fetchAirportByIcao(origCode),
              fetchAirportByIcao(destCode),
            ]);
            if (origin && destination) {
              const route: FlightRouteInfo = {
                callsignIata: null,
                airlineName: null,
                origin,
                destination,
                source: 'HexDB',
              };
              routeCache.set(cs, { route, expiresAt: Date.now() + 30 * 60 * 1000 });
              return route;
            }
          }
        }
      }
    } catch {
      // Not found
    }

    routeCache.set(cs, { route: null, expiresAt: Date.now() + 10 * 60 * 1000 });
    return null;
  })();

  inFlightRoutes.set(cs, task);
  try {
    return await task;
  } finally {
    inFlightRoutes.delete(cs);
  }
}

function warmRoutesInBackground(aircraft: Aircraft[]): void {
  const candidates = aircraft
    .filter((a) => !a.onGround && isLikelyScheduledCallsign(a.callsign, a.registration))
    .filter((a) => {
      const cached = routeCache.get(a.callsign);
      return !cached || cached.expiresAt <= Date.now();
    })
    .slice(0, 12);

  if (candidates.length === 0) return;
  void Promise.allSettled(candidates.map((c) => resolveFlightRoute(c.callsign)));
}

interface RawAdsbItem {
  hex?: string;
  flight?: string;
  r?: string;
  t?: string;
  desc?: string;
  ownOp?: string;
  category?: string;
  dbFlags?: number;
  lat?: number;
  lon?: number;
  alt_baro?: number | string;
  alt_geom?: number;
  gs?: number;
  track?: number;
  true_heading?: number;
  mag_heading?: number;
  baro_rate?: number;
  geom_rate?: number;
  squawk?: string;
  emergency?: string;
  seen?: number;
  rssi?: number;
  messages?: number;
}

async function fetchAdsbLol(lat: number, lon: number, radiusNm: number): Promise<RawAdsbItem[]> {
  const url = `https://api.adsb.lol/v2/lat/${lat.toFixed(5)}/lon/${lon.toFixed(5)}/dist/${Math.round(radiusNm)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7500);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SkywatchOverhead/1.0',
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`ADSB feed HTTP ${res.status}`);
    }
    const json = (await res.json()) as { ac?: RawAdsbItem[] };
    return Array.isArray(json.ac) ? json.ac : [];
  } finally {
    clearTimeout(timeout);
  }
}

const app = express();
app.use(express.json());

app.get('/api/config', (_req: Request, res: Response) => {
  const key = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
  res.json({ mapsApiKey: key });
});

app.get('/api/flights', async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const rawRadius = Number(req.query.radius || 25);
  const radiusNm = Math.min(Math.max(Number.isFinite(rawRadius) ? rawRadius : 25, 2), 100);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    res.status(400).json({ error: 'Invalid latitude or longitude.' });
    return;
  }

  try {
    const rawList = await fetchAdsbLol(lat, lon, radiusNm);
    const now = Date.now();
    pruneTrails(now);

    const aircraft: Aircraft[] = [];
    for (const item of rawList) {
      if (typeof item.lat !== 'number' || typeof item.lon !== 'number' || !item.hex) {
        continue;
      }

      const onGround = item.alt_baro === 'ground';
      const altBaroNum = typeof item.alt_baro === 'number' ? item.alt_baro : null;
      const altGeomNum = typeof item.alt_geom === 'number' ? item.alt_geom : null;
      const altitudeFt = onGround ? 0 : Math.max(0, Math.round(altBaroNum ?? altGeomNum ?? 0));

      const groundDistMeters = haversineMeters(lat, lon, item.lat, item.lon);
      const distanceNm = Number((groundDistMeters / 1852).toFixed(2));
      const bearingDeg = Math.round(computeBearingDeg(lat, lon, item.lat, item.lon));
      const compassDir = bearingToCompass(bearingDeg);

      const altMeters = altitudeFt * 0.3048;
      const elevationAngleDeg = onGround
        ? 0
        : groundDistMeters < 15
          ? 90
          : Math.round(toDeg(Math.atan2(altMeters, groundDistMeters)));

      const heading = Math.round(item.track ?? item.true_heading ?? item.mag_heading ?? 0);
      const isMilitary = Boolean((item.dbFlags ?? 0) & 1);
      const craftKind = classifyCraft(item.category, item.t, isMilitary);
      const callsign = (item.flight || '').trim() || (item.r || '').trim() || item.hex.toUpperCase();

      const overheadScore = onGround
        ? -distanceNm
        : elevationAngleDeg * 1.4 - distanceNm * 2.2;

      const groundSpeedKts = Math.round(item.gs ?? 0);
      const trail = updateTrail(item.hex, item.lat, item.lon, altitudeFt, groundSpeedKts, now);
      const cachedRoute = routeCache.get(callsign.toUpperCase());

      aircraft.push({
        hex: item.hex.toLowerCase(),
        callsign,
        registration: item.r ? item.r.trim() : null,
        aircraftType: item.t ? item.t.trim() : null,
        aircraftDesc: item.desc ? item.desc.trim() : null,
        operator: item.ownOp ? item.ownOp.trim() : null,
        categoryCode: item.category ? item.category.trim() : null,
        craftKind,
        isMilitary,
        lat: item.lat,
        lon: item.lon,
        altitudeFt,
        altitudeGeomFt: altGeomNum !== null ? Math.round(altGeomNum) : null,
        onGround,
        groundSpeedKts,
        heading,
        verticalRateFpm: Math.round(item.baro_rate ?? item.geom_rate ?? 0),
        squawk: item.squawk || null,
        emergency: item.emergency && item.emergency !== 'none' ? item.emergency : null,
        distanceNm,
        bearingDeg,
        compassDir,
        elevationAngleDeg,
        overheadScore,
        seenSec: Number((item.seen ?? 0).toFixed(1)),
        rssi: typeof item.rssi === 'number' ? Number(item.rssi.toFixed(1)) : null,
        messages: item.messages ?? 0,
        trail,
        route: cachedRoute && cachedRoute.expiresAt > now ? cachedRoute.route : null,
      });
    }

    aircraft.sort((a, b) => b.overheadScore - a.overheadScore);

    // Pre-warm route lookups for top airborne scheduled flights on initial load
    const uncachedCount = aircraft.filter(
      (a) => !a.onGround && isLikelyScheduledCallsign(a.callsign, a.registration) && !a.route
    ).length;
    if (uncachedCount > 0) {
      // Wait briefly (up to 700ms) on top 6 flights so first view already shows routes immediately
      const topToWait = aircraft
        .filter((a) => !a.onGround && isLikelyScheduledCallsign(a.callsign, a.registration) && !routeCache.has(a.callsign.toUpperCase()))
        .slice(0, 8);
      if (topToWait.length > 0) {
        await Promise.race([
          Promise.allSettled(
            topToWait.map(async (ac) => {
              const r = await resolveFlightRoute(ac.callsign);
              if (r) ac.route = r;
            })
          ),
          new Promise((resolve) => setTimeout(resolve, 1400)),
        ]);
      }
      warmRoutesInBackground(aircraft);
    }

    const counts = {
      all: aircraft.length,
      commercial: aircraft.filter((a) => a.craftKind === 'commercial' || a.craftKind === 'heavy').length,
      helicopter: aircraft.filter((a) => a.craftKind === 'helicopter').length,
      fighter: aircraft.filter((a) => a.craftKind === 'fighter' || a.isMilitary).length,
      light: aircraft.filter((a) => a.craftKind === 'light').length,
      special: aircraft.filter((a) => a.craftKind === 'special' || a.craftKind === 'unknown').length,
    };

    res.json({
      center: { lat, lon },
      radiusNm,
      fetchedAt: now,
      source: 'ADSB.lol Live Telemetry',
      totalCount: aircraft.length,
      counts,
      aircraft,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch live airspace data.';
    res.status(502).json({ error: message });
  }
});

const PHOTO_USER_AGENT = 'SkywatchOverheadRadar/1.0 (+https://skywatch.app/contact)';

interface PlanespottersResponse {
  photos?: Array<{
    thumbnail?: { src?: string };
    thumbnail_large?: { src?: string };
    link?: string;
    photographer?: string;
  }>;
}

async function fetchPlanespottersPhoto(
  kind: 'hex' | 'reg',
  value: string
): Promise<AircraftPhotoInfo | null> {
  const clean = value.trim();
  if (!clean) return null;
  try {
    const res = await fetch(
      `https://api.planespotters.net/pub/photos/${kind}/${encodeURIComponent(clean)}`,
      {
        signal: AbortSignal.timeout(4000),
        headers: {
          'User-Agent': PHOTO_USER_AGENT,
          Accept: 'application/json',
        },
      }
    );
    if (!res.ok) return null;
    const json = (await res.json()) as PlanespottersResponse;
    const first = json.photos?.[0];
    const src = first?.thumbnail_large?.src || first?.thumbnail?.src;
    if (!src) return null;
    return {
      url: src,
      fallbackUrl: null,
      source: 'Planespotters.net',
      isExactAirframe: true,
      photographer: first?.photographer || null,
      sourceLink: first?.link || null,
    };
  } catch {
    return null;
  }
}

async function fetchWikipediaModelPhoto(modelQuery: string): Promise<AircraftPhotoInfo | null> {
  const clean = modelQuery.trim();
  if (!clean || clean === 'Unidentified Aircraft') return null;

  const cacheKey = `wiki:${clean.toLowerCase()}`;
  const cached = photoCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.photo;
  }

  try {
    const url =
      'https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=' +
      encodeURIComponent(clean) +
      '&gsrlimit=4&prop=pageimages&piprop=thumbnail&pithumbsize=640&format=json';
    const res = await fetch(url, {
      signal: AbortSignal.timeout(3500),
      headers: {
        'User-Agent': PHOTO_USER_AGENT,
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      query?: {
        pages?: Record<
          string,
          {
            index?: number;
            title?: string;
            fullurl?: string;
            thumbnail?: { source?: string };
          }
        >;
      };
    };

    const pages = Object.values(json.query?.pages || {}).sort(
      (a, b) => (a.index ?? 99) - (b.index ?? 99)
    );
    const pick = pages.find((p) => {
      const src = p.thumbnail?.source;
      const title = (p.title || '').toLowerCase();
      if (!src) return false;
      if (src.toLowerCase().includes('.svg')) return false;
      if (/accident|crash|incident|disaster|hijack/.test(title)) return false;
      return true;
    });

    const photo: AircraftPhotoInfo | null = pick?.thumbnail?.source
      ? {
          url: pick.thumbnail.source,
          fallbackUrl: null,
          source: 'Wikimedia Commons',
          isExactAirframe: false,
          photographer: null,
          sourceLink: pick.title
            ? `https://en.wikipedia.org/wiki/${encodeURIComponent(pick.title.replace(/ /g, '_'))}`
            : null,
        }
      : null;

    photoCache.set(cacheKey, { photo, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
    return photo;
  } catch {
    return null;
  }
}

app.get('/api/aircraft-meta', async (req: Request, res: Response) => {
  const hex = String(req.query.hex || '').trim().toLowerCase();
  const callsign = String(req.query.callsign || '').trim().toUpperCase();
  const hintModel = String(req.query.model || '').trim();

  if (!hex) {
    res.status(400).json({ error: 'Missing hex parameter.' });
    return;
  }

  const cacheKey = `${hex}:${callsign}:${hintModel}`;
  const cached = metaCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.json(cached.data);
    return;
  }

  const result: AircraftMetadata = {
    hex,
    registration: null,
    manufacturer: null,
    type: null,
    icaoType: null,
    registeredOwners: null,
    registeredOwnerCountry: null,
    operatorFlagCode: null,
    photo: null,
    route: null,
  };

  let adsbdbPhotoUrl: string | null = null;

  const [, routeResult, psHexPhoto] = await Promise.allSettled([
    (async () => {
      try {
        const resAdsbdb = await fetch(`https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(hex)}`, {
          signal: AbortSignal.timeout(3500),
          headers: { 'User-Agent': PHOTO_USER_AGENT },
        });
        if (resAdsbdb.ok) {
          const json = (await resAdsbdb.json()) as {
            response?: {
              aircraft?: {
                registration?: string;
                manufacturer?: string;
                type?: string;
                icao_type?: string;
                registered_owner?: string;
                registered_owner_country_name?: string;
                registered_owner_operator_flag_code?: string;
                url_photo?: string | null;
                url_photo_thumbnail?: string | null;
              };
            };
          };
          const ac = json.response?.aircraft;
          if (ac) {
            result.registration = ac.registration || null;
            result.manufacturer = ac.manufacturer || null;
            result.type = ac.type || null;
            result.icaoType = ac.icao_type || null;
            result.registeredOwners = ac.registered_owner || null;
            result.registeredOwnerCountry = ac.registered_owner_country_name || null;
            result.operatorFlagCode = ac.registered_owner_operator_flag_code || null;
            adsbdbPhotoUrl = ac.url_photo || ac.url_photo_thumbnail || null;
            return;
          }
        }
      } catch {
        // Fallback to hexdb
      }

      try {
        const acRes = await fetch(`https://hexdb.io/api/v1/aircraft/${encodeURIComponent(hex)}`, {
          signal: AbortSignal.timeout(3500),
          headers: { 'User-Agent': PHOTO_USER_AGENT },
        });
        if (acRes.ok) {
          const acJson = (await acRes.json()) as Record<string, string | undefined>;
          result.registration = acJson.Registration || null;
          result.manufacturer = acJson.Manufacturer || null;
          result.type = acJson.Type || null;
          result.icaoType = acJson.ICAOTypeCode || null;
          result.registeredOwners = acJson.RegisteredOwners || null;
          result.operatorFlagCode = acJson.OperatorFlagCode || null;
        }
      } catch {
        // Graceful fallback
      }
    })(),
    callsign && callsign !== hex.toUpperCase() ? resolveFlightRoute(callsign) : Promise.resolve(null),
    fetchPlanespottersPhoto('hex', hex),
  ]);

  if (routeResult.status === 'fulfilled') {
    result.route = routeResult.value;
  }

  let primaryPhoto: AircraftPhotoInfo | null =
    psHexPhoto.status === 'fulfilled' ? psHexPhoto.value : null;

  if (!primaryPhoto && result.registration) {
    primaryPhoto = await fetchPlanespottersPhoto('reg', result.registration);
  }

  if (!primaryPhoto && adsbdbPhotoUrl) {
    primaryPhoto = {
      url: adsbdbPhotoUrl,
      fallbackUrl: null,
      source: 'Airport-Data',
      isExactAirframe: true,
      photographer: null,
      sourceLink: null,
    };
  }

  const resolvedModelName =
    result.manufacturer && result.type
      ? `${result.manufacturer} ${result.type}`
      : result.type || hintModel;

  const modelPhoto = resolvedModelName ? await fetchWikipediaModelPhoto(resolvedModelName) : null;

  if (primaryPhoto) {
    primaryPhoto.fallbackUrl = modelPhoto?.url || null;
    result.photo = primaryPhoto;
  } else if (modelPhoto) {
    result.photo = modelPhoto;
  }

  metaCache.set(cacheKey, { data: result, expiresAt: Date.now() + 10 * 60 * 1000 });
  res.json(result);
});

const OCEAN_SEARCH_CENTERS: Record<string, { lat: number; lng: number; label: string }> = {
  'indian ocean': { lat: -8.5, lng: 76.0, label: 'Indian Ocean' },
  'arabian sea': { lat: 15.5, lng: 64.5, label: 'Arabian Sea, Indian Ocean' },
  'bay of bengal': { lat: 14.0, lng: 88.0, label: 'Bay of Bengal, Indian Ocean' },
  'strait of malacca': { lat: 2.5, lng: 101.2, label: 'Strait of Malacca' },
  'malacca strait': { lat: 2.5, lng: 101.2, label: 'Strait of Malacca' },
  'red sea': { lat: 20.0, lng: 38.5, label: 'Red Sea' },
  'gulf of aden': { lat: 12.5, lng: 48.0, label: 'Gulf of Aden' },
  'persian gulf': { lat: 26.5, lng: 52.0, label: 'Persian Gulf' },
  'gulf of oman': { lat: 24.5, lng: 58.5, label: 'Gulf of Oman' },
  'suez canal': { lat: 30.0, lng: 32.55, label: 'Suez Canal, Egypt' },
  'cape of good hope': { lat: -34.5, lng: 18.5, label: 'Cape of Good Hope' },
  'mediterranean sea': { lat: 35.5, lng: 18.0, label: 'Mediterranean Sea' },
  'mediterranean': { lat: 35.5, lng: 18.0, label: 'Mediterranean Sea' },
  'baltic sea': { lat: 58.5, lng: 20.0, label: 'Baltic Sea' },
  'north sea': { lat: 56.0, lng: 3.5, label: 'North Sea' },
  'north atlantic': { lat: 36.0, lng: -40.0, label: 'North Atlantic Ocean' },
  'atlantic ocean': { lat: 20.0, lng: -40.0, label: 'Atlantic Ocean' },
  'south atlantic': { lat: -20.0, lng: -15.0, label: 'South Atlantic Ocean' },
  'pacific ocean': { lat: 10.0, lng: -155.0, label: 'Pacific Ocean' },
  'north pacific': { lat: 30.0, lng: -160.0, label: 'North Pacific Ocean' },
  'south china sea': { lat: 12.0, lng: 114.0, label: 'South China Sea' },
};

function classifyOceanRegion(lat: number, lon: number): string {
  if (lat >= 53 && lat <= 66 && lon >= 9 && lon <= 31) return 'Baltic / Kattegat';
  if (lat >= 51 && lat <= 62 && lon >= -4 && lon <= 9) return 'North Sea';
  if (lat >= 30 && lat <= 46 && lon >= -6 && lon <= 37) return 'Mediterranean Sea';
  if (lat >= 12 && lat <= 30 && lon >= 32 && lon <= 44) return 'Red Sea';
  if (lat >= 10 && lat <= 15 && lon >= 43 && lon <= 54) return 'Gulf of Aden';
  if (lat >= 23 && lat <= 31 && lon >= 47 && lon <= 60) return 'Persian Gulf / Oman';
  if (lat >= 5 && lat <= 26 && lon >= 50 && lon <= 77) return 'Arabian Sea';
  if (lat >= 5 && lat <= 23 && lon >= 79 && lon <= 98) return 'Bay of Bengal';
  if (lat >= -2 && lat <= 8 && lon >= 95 && lon <= 105) return 'Strait of Malacca';
  if (lat >= 0 && lat <= 24 && lon >= 104 && lon <= 122) return 'South China Sea';
  if (lat >= -55 && lat <= 25 && lon >= 20 && lon <= 120) return 'Indian Ocean';
  if (lat < -55) return 'Southern Ocean';
  if (lat > 66) return 'Arctic Ocean';
  if (lon >= -80 && lon <= 20) return lat >= 0 ? 'North Atlantic' : 'South Atlantic';
  return lat >= 0 ? 'North Pacific' : 'South Pacific';
}

function classifyAisShipType(shipType: number | null): VesselKind {
  if (shipType === null || !Number.isFinite(shipType)) return 'other';
  if (shipType >= 60 && shipType <= 69) return 'cruise';
  if (shipType >= 70 && shipType <= 79) return 'cargo';
  if (shipType >= 80 && shipType <= 89) return 'tanker';
  if (shipType === 30) return 'fishing';
  if (shipType === 31 || shipType === 32 || (shipType >= 50 && shipType <= 59)) return 'tug';
  if (shipType === 36 || shipType === 37) return 'sailing';
  return 'other';
}

function aisNavStatusText(code: number | undefined): string | null {
  switch (code) {
    case 0:
      return 'Under way using engine';
    case 1:
      return 'At anchor';
    case 2:
      return 'Not under command';
    case 3:
      return 'Restricted manoeuvrability';
    case 5:
      return 'Moored';
    case 7:
      return 'Engaged in fishing';
    case 8:
      return 'Under way sailing';
    default:
      return null;
  }
}

function simplifyAndSplitLane(rawCoords: number[][]): Array<Array<{ lat: number; lng: number }>> {
  const segments: Array<Array<{ lat: number; lng: number }>> = [];
  let current: Array<{ lat: number; lng: number }> = [];

  for (let i = 0; i < rawCoords.length; i++) {
    const pair = rawCoords[i];
    const lng = pair[0];
    const lat = pair[1];
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    if (current.length === 0) {
      current.push({ lat, lng });
      continue;
    }

    const prev = current[current.length - 1];
    if (Math.abs(lng - prev.lng) > 180) {
      if (current.length >= 2) segments.push(current);
      current = [{ lat, lng }];
      continue;
    }

    const isLast = i === rawCoords.length - 1;
    const distDeg = Math.hypot(lat - prev.lat, lng - prev.lng);
    if (isLast || distDeg >= 0.2) {
      current.push({ lat, lng });
    }
  }

  if (current.length >= 2) segments.push(current);
  return segments;
}

async function getShippingLanes(): Promise<{ features: ShippingLaneFeature[]; fetchedAt: number }> {
  const now = Date.now();
  if (shippingLanesCache && shippingLanesCache.expiresAt > now) {
    return { features: shippingLanesCache.features, fetchedAt: shippingLanesCache.fetchedAt };
  }

  const res = await fetch(
    'https://raw.githubusercontent.com/newzealandpaul/Shipping-Lanes/main/data/Shipping_Lanes_v1.geojson',
    {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': 'SkywatchOverhead/1.0' },
    }
  );
  if (!res.ok) {
    throw new Error(`Shipping lanes source returned HTTP ${res.status}`);
  }

  const geo = (await res.json()) as {
    features?: Array<{
      properties?: { Type?: string };
      geometry?: { type?: string; coordinates?: number[][][] };
    }>;
  };

  const features: ShippingLaneFeature[] = [];
  for (const f of geo.features || []) {
    const rawTier = f.properties?.Type;
    const tier: 'Major' | 'Middle' | 'Minor' =
      rawTier === 'Major' ? 'Major' : rawTier === 'Middle' ? 'Middle' : 'Minor';
    const multiCoords = f.geometry?.coordinates || [];
    const paths: Array<Array<{ lat: number; lng: number }>> = [];
    for (const line of multiCoords) {
      const split = simplifyAndSplitLane(line);
      for (const s of split) paths.push(s);
    }
    features.push({ tier, paths });
  }

  shippingLanesCache = {
    features,
    fetchedAt: now,
    expiresAt: now + 24 * 60 * 60 * 1000,
  };
  return { features, fetchedAt: now };
}

async function fetchNoaaVosVessels(): Promise<Array<Omit<Vessel, 'distanceNm' | 'bearingDeg' | 'compassDir'>>> {
  const now = Date.now();
  if (noaaVosCache && noaaVosCache.expiresAt > now) {
    return noaaVosCache.vessels;
  }

  try {
    const res = await fetch('https://www.ndbc.noaa.gov/ship_obs.php?uom=E&time=6', {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'SkywatchOverhead/1.0' },
    });
    if (!res.ok) return noaaVosCache?.vessels || [];
    const html = await res.text();
    const matches = html.matchAll(/<span>([^<]+)<\/span>/g);

    const byCell = new Map<string, Omit<Vessel, 'distanceNm' | 'bearingDeg' | 'compassDir'>>();
    for (const m of matches) {
      const parts = m[1].trim().split(/\s+/);
      if (parts.length < 13) continue;
      const lat = Number(parts[2]);
      const lon = Number(parts[3]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -85 || lat > 85 || lon < -180 || lon > 180) {
        continue;
      }

      const cellKey = `${lat.toFixed(1)},${lon.toFixed(1)}`;
      if (byCell.has(cellKey)) continue;

      const parseNum = (val: string | undefined): number | null => {
        if (!val || val === '-' || val === 'MM') return null;
        const n = Number(val);
        return Number.isFinite(n) ? n : null;
      };

      const oceanRegion = classifyOceanRegion(lat, lon);
      const id = `vos-${lat.toFixed(2)}-${lon.toFixed(2)}`;
      const hourNum = Number(parts[1]);
      const reportDate = new Date(now);
      if (Number.isFinite(hourNum)) {
        reportDate.setUTCHours(hourNum, 0, 0, 0);
        if (reportDate.getTime() > now + 3600 * 1000) {
          reportDate.setUTCDate(reportDate.getUTCDate() - 1);
        }
      }

      byCell.set(cellKey, {
        id,
        mmsi: null,
        imo: null,
        name: `VOS Ship (${oceanRegion})`,
        callsign: parts[0] && parts[0] !== 'SHIP' ? parts[0] : null,
        destination: null,
        vesselKind: 'vos',
        shipTypeCode: null,
        lat,
        lon,
        sogKts: null,
        cogDeg: null,
        heading: null,
        draughtM: null,
        navStatus: 'At sea (VOS weather report)',
        oceanRegion,
        reportedAt: reportDate.getTime(),
        source: 'NOAA VOS',
        windDirDeg: parseNum(parts[4]),
        windSpeedKts: parseNum(parts[5]),
        waveHeightFt: parseNum(parts[7]),
        pressureIn: parseNum(parts[9]),
        waterTempF: parseNum(parts[12]),
      });
    }

    const list = Array.from(byCell.values());
    noaaVosCache = { vessels: list, expiresAt: now + 3 * 60 * 1000 };
    return list;
  } catch {
    return noaaVosCache?.vessels || [];
  }
}

async function fetchDigitrafficVessels(): Promise<Array<Omit<Vessel, 'distanceNm' | 'bearingDeg' | 'compassDir'>>> {
  const now = Date.now();
  if (digitrafficCache && digitrafficCache.expiresAt > now) {
    return digitrafficCache.vessels;
  }

  try {
    const fromTs = now - 12 * 60 * 1000;
    const [locRes, metaRes] = await Promise.all([
      fetch(`https://meri.digitraffic.fi/api/ais/v1/locations?from=${fromTs}`, {
        signal: AbortSignal.timeout(7000),
        headers: { 'Digitraffic-User': 'SkywatchOverhead/1.0' },
      }),
      fetch('https://meri.digitraffic.fi/api/ais/v1/vessels', {
        signal: AbortSignal.timeout(7000),
        headers: { 'Digitraffic-User': 'SkywatchOverhead/1.0' },
      }),
    ]);

    if (!locRes.ok) return digitrafficCache?.vessels || [];

    const locJson = (await locRes.json()) as {
      features?: Array<{
        mmsi?: number;
        geometry?: { coordinates?: [number, number] };
        properties?: {
          mmsi?: number;
          sog?: number;
          cog?: number;
          navStat?: number;
          heading?: number;
          timestampExternal?: number;
        };
      }>;
    };

    const metaMap = new Map<
      number,
      {
        name?: string;
        callSign?: string;
        destination?: string;
        imo?: number;
        shipType?: number;
        draught?: number;
      }
    >();

    if (metaRes.ok) {
      const metaList = (await metaRes.json()) as Array<{
        mmsi?: number;
        name?: string;
        callSign?: string;
        destination?: string;
        imo?: number;
        shipType?: number;
        draught?: number;
      }>;
      for (const m of metaList) {
        if (typeof m.mmsi === 'number') metaMap.set(m.mmsi, m);
      }
    }

    const list: Array<Omit<Vessel, 'distanceNm' | 'bearingDeg' | 'compassDir'>> = [];
    for (const f of locJson.features || []) {
      const mmsi = f.mmsi ?? f.properties?.mmsi;
      const coords = f.geometry?.coordinates;
      if (!mmsi || !coords || coords.length < 2) continue;
      const [lon, lat] = coords;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const meta = metaMap.get(mmsi);
      const shipType = typeof meta?.shipType === 'number' ? meta.shipType : null;
      const vesselKind = classifyAisShipType(shipType);
      const rawHeading = f.properties?.heading;
      const cog = typeof f.properties?.cog === 'number' ? Math.round(f.properties.cog) : null;
      const heading =
        typeof rawHeading === 'number' && rawHeading >= 0 && rawHeading <= 360
          ? Math.round(rawHeading)
          : cog;
      const cleanName = (meta?.name || '').trim() || `MMSI ${mmsi}`;
      const cleanDest = (meta?.destination || '').trim().replace(/^@+/, '') || null;

      list.push({
        id: `ais-${mmsi}`,
        mmsi: String(mmsi),
        imo: meta?.imo && meta.imo > 0 ? String(meta.imo) : null,
        name: cleanName,
        callsign: meta?.callSign?.trim() || null,
        destination: cleanDest,
        vesselKind,
        shipTypeCode: shipType,
        lat,
        lon,
        sogKts: typeof f.properties?.sog === 'number' ? Number(f.properties.sog.toFixed(1)) : null,
        cogDeg: cog,
        heading,
        draughtM: typeof meta?.draught === 'number' && meta.draught > 0 ? Number((meta.draught / 10).toFixed(1)) : null,
        navStatus: aisNavStatusText(f.properties?.navStat),
        oceanRegion: classifyOceanRegion(lat, lon),
        reportedAt: f.properties?.timestampExternal || now,
        source: 'Digitraffic AIS',
        windSpeedKts: null,
        windDirDeg: null,
        waveHeightFt: null,
        waterTempF: null,
        pressureIn: null,
      });
    }

    digitrafficCache = { vessels: list, expiresAt: now + 60 * 1000 };
    return list;
  } catch {
    return digitrafficCache?.vessels || [];
  }
}

function startAisStreamIfConfigured(): void {
  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey || apiKey === 'MY_AISSTREAM_API_KEY') return;

  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const connect = () => {
    try {
      const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            APIKey: apiKey,
            BoundingBoxes: [[[-75, -180], [82, 180]]],
            FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
          })
        );
      };
      ws.onmessage = async (ev) => {
        try {
          const text = typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text();
          const msg = JSON.parse(text) as {
            MessageType?: string;
            MetaData?: { MMSI?: number; ShipName?: string; latitude?: number; longitude?: number };
            Message?: {
              PositionReport?: { Sog?: number; Cog?: number; TrueHeading?: number; NavigationalStatus?: number };
              ShipStaticData?: { ImoNumber?: number; CallSign?: string; Destination?: string; Type?: number; MaximumStaticDraught?: number };
            };
          };
          const mmsi = msg.MetaData?.MMSI;
          if (!mmsi) return;
          const id = `aisstream-${mmsi}`;
          const prev = aisStreamStore.get(id);
          const now = Date.now();
          const lat = msg.MetaData?.latitude ?? prev?.lat;
          const lon = msg.MetaData?.longitude ?? prev?.lon;
          if (typeof lat !== 'number' || typeof lon !== 'number') return;

          const pos = msg.Message?.PositionReport;
          const stat = msg.Message?.ShipStaticData;
          const shipType = stat?.Type ?? prev?.shipTypeCode ?? null;
          const rawHeading = pos?.TrueHeading;
          const cog = typeof pos?.Cog === 'number' ? Math.round(pos.Cog) : prev?.cogDeg ?? null;
          const heading =
            typeof rawHeading === 'number' && rawHeading >= 0 && rawHeading <= 360
              ? Math.round(rawHeading)
              : cog ?? prev?.heading ?? null;

          aisStreamStore.set(id, {
            id,
            mmsi: String(mmsi),
            imo: stat?.ImoNumber ? String(stat.ImoNumber) : prev?.imo ?? null,
            name: msg.MetaData?.ShipName?.trim() || prev?.name || `MMSI ${mmsi}`,
            callsign: stat?.CallSign?.trim() || prev?.callsign || null,
            destination: stat?.Destination?.trim() || prev?.destination || null,
            vesselKind: classifyAisShipType(shipType),
            shipTypeCode: shipType,
            lat,
            lon,
            sogKts: typeof pos?.Sog === 'number' ? Number(pos.Sog.toFixed(1)) : prev?.sogKts ?? null,
            cogDeg: cog,
            heading,
            draughtM:
              typeof stat?.MaximumStaticDraught === 'number' && stat.MaximumStaticDraught > 0
                ? Number((stat.MaximumStaticDraught / 10).toFixed(1))
                : prev?.draughtM ?? null,
            navStatus: pos ? aisNavStatusText(pos.NavigationalStatus) : prev?.navStatus ?? null,
            oceanRegion: classifyOceanRegion(lat, lon),
            reportedAt: now,
            source: 'AISStream',
            windSpeedKts: null,
            windDirDeg: null,
            waveHeightFt: null,
            waterTempF: null,
            pressureIn: null,
          });

          if (aisStreamStore.size > 5000) {
            const cutoff = now - 30 * 60 * 1000;
            for (const [k, v] of aisStreamStore.entries()) {
              if (v.reportedAt < cutoff) aisStreamStore.delete(k);
            }
          }
        } catch {
          // Ignore malformed frame
        }
      };
      ws.onclose = () => {
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, 15000);
        }
      };
      ws.onerror = () => ws.close();
    } catch {
      // Non-fatal optional stream
    }
  };
  connect();
}

app.get('/api/shipping-lanes', async (_req: Request, res: Response) => {
  try {
    const data = await getShippingLanes();
    res.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load shipping lanes.';
    res.status(502).json({ error: message });
  }
});

app.get('/api/vessels', async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const rawRadius = Number(req.query.radius);
  const scope = req.query.scope === 'radius' ? 'radius' : 'global';
  const radiusNm = Math.min(Math.max(Number.isFinite(rawRadius) ? rawRadius : 1200, 10), 6000);

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    res.status(400).json({ error: 'Invalid latitude or longitude.' });
    return;
  }

  try {
    const [vosList, digitrafficList] = await Promise.all([
      fetchNoaaVosVessels(),
      fetchDigitrafficVessels(),
    ]);

    const now = Date.now();
    const aisStreamList = Array.from(aisStreamStore.values()).filter(
      (v) => now - v.reportedAt <= 30 * 60 * 1000
    );

    const combined = new Map<string, Omit<Vessel, 'distanceNm' | 'bearingDeg' | 'compassDir'>>();
    for (const v of vosList) combined.set(v.id, v);
    for (const v of digitrafficList) combined.set(v.id, v);
    for (const v of aisStreamList) combined.set(v.id, v);

    const enriched: Vessel[] = [];
    for (const base of combined.values()) {
      const distMeters = haversineMeters(lat, lon, base.lat, base.lon);
      const distanceNm = Number((distMeters / 1852).toFixed(1));
      if (scope === 'radius' && distanceNm > radiusNm) continue;
      const bearingDeg = Math.round(computeBearingDeg(lat, lon, base.lat, base.lon));
      enriched.push({
        ...base,
        distanceNm,
        bearingDeg,
        compassDir: bearingToCompass(bearingDeg),
      });
    }

    enriched.sort((a, b) => a.distanceNm - b.distanceNm);
    const sliced = scope === 'global' ? enriched.slice(0, 750) : enriched.slice(0, 600);

    const activeSources: string[] = [];
    if (vosList.length > 0) activeSources.push('NOAA VOS Global');
    if (digitrafficList.length > 0) activeSources.push('Fintraffic AIS');
    if (aisStreamList.length > 0) activeSources.push('AISStream');

    const counts = {
      all: sliced.length,
      cruise: sliced.filter((v) => v.vesselKind === 'cruise').length,
      cargo: sliced.filter((v) => v.vesselKind === 'cargo').length,
      tanker: sliced.filter((v) => v.vesselKind === 'tanker').length,
      vos: sliced.filter((v) => v.vesselKind === 'vos').length,
      other: sliced.filter(
        (v) => v.vesselKind === 'fishing' || v.vesselKind === 'tug' || v.vesselKind === 'sailing' || v.vesselKind === 'other'
      ).length,
    };

    res.json({
      center: { lat, lon },
      radiusNm,
      scope,
      fetchedAt: now,
      sources: activeSources,
      totalCount: sliced.length,
      counts,
      vessels: sliced,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch vessel telemetry.';
    res.status(502).json({ error: message });
  }
});

app.get('/api/geocode-city', async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.status(400).json({ error: 'City query is required.' });
    return;
  }

  const oceanMatch = OCEAN_SEARCH_CENTERS[q.toLowerCase()];
  if (oceanMatch) {
    res.json(oceanMatch);
    return;
  }

  const key = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
  if (key) {
    try {
      const gUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${encodeURIComponent(key)}`;
      const gRes = await fetch(gUrl, { signal: AbortSignal.timeout(4500) });
      if (gRes.ok) {
        const gData = (await gRes.json()) as {
          status?: string;
          results?: Array<{
            formatted_address?: string;
            geometry?: { location?: { lat: number; lng: number } };
          }>;
        };
        const hit = gData.results?.[0];
        if (gData.status === 'OK' && hit?.geometry?.location) {
          res.json({
            lat: hit.geometry.location.lat,
            lng: hit.geometry.location.lng,
            label: hit.formatted_address || q,
          });
          return;
        }
      }
    } catch {
      // Fall through to OpenStreetMap Nominatim
    }
  }

  try {
    const nUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const nRes = await fetch(nUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'SkywatchOverhead/1.0' },
    });
    if (nRes.ok) {
      const items = (await nRes.json()) as Array<{
        lat?: string;
        lon?: string;
        display_name?: string;
      }>;
      const first = items[0];
      if (first?.lat && first?.lon) {
        const shortLabel = first.display_name
          ? first.display_name.split(',').slice(0, 2).join(',').trim()
          : q;
        res.json({
          lat: Number(first.lat),
          lng: Number(first.lon),
          label: shortLabel,
        });
        return;
      }
    }
  } catch {
    // Not found
  }

  res.status(404).json({ error: `Could not find coordinates for "${q}".` });
});

app.get('/api/reverse-geocode', async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const key = process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !key) {
    res.json({ label: null });
    return;
  }

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&result_type=locality|neighborhood|administrative_area_level_1&key=${encodeURIComponent(key)}`;
    const geoRes = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!geoRes.ok) {
      res.json({ label: null });
      return;
    }
    const data = (await geoRes.json()) as {
      status?: string;
      results?: Array<{ formatted_address?: string; address_components?: Array<{ short_name: string; types: string[] }> }>;
    };
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const first = data.results[0];
      const locality = first.address_components?.find((c) => c.types.includes('locality'))?.short_name;
      const admin = first.address_components?.find((c) => c.types.includes('administrative_area_level_1'))?.short_name;
      const label = locality && admin ? `${locality}, ${admin}` : first.formatted_address || null;
      res.json({ label });
      return;
    }
  } catch {
    // Fallback to null
  }
  res.json({ label: null });
});

async function fetchRainViewerLatest(): Promise<{
  host: string;
  latestPath: string;
  latestTime: number;
} | null> {
  const now = Date.now();
  if (rainViewerCache && rainViewerCache.expiresAt > now) {
    return {
      host: rainViewerCache.host,
      latestPath: rainViewerCache.latestPath,
      latestTime: rainViewerCache.latestTime,
    };
  }

  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json', {
      signal: AbortSignal.timeout(4500),
      headers: { 'User-Agent': 'SkywatchOverheadRadar/1.0 (+https://skywatch.app)' },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      host?: string;
      radar?: { past?: Array<{ time?: number; path?: string }> };
    };
    const past = json.radar?.past;
    const latest = Array.isArray(past) && past.length > 0 ? past[past.length - 1] : null;
    if (json.host && latest?.path && typeof latest.time === 'number') {
      rainViewerCache = {
        host: json.host,
        latestPath: latest.path,
        latestTime: latest.time,
        expiresAt: now + 3 * 60 * 1000,
      };
      return {
        host: rainViewerCache.host,
        latestPath: rainViewerCache.latestPath,
        latestTime: rainViewerCache.latestTime,
      };
    }
  } catch {
    // Graceful fallback if RainViewer temporarily unreachable
  }
  return null;
}

async function fetchMetNoWeatherPoint(
  lat: number,
  lon: number,
  id: string,
  label: string
): Promise<WeatherStationSample | null> {
  const clampedLat = Math.max(-82, Math.min(82, lat));
  const wrappedLon = ((((lon + 180) % 360) + 360) % 360) - 180;
  const cacheKey = `${clampedLat.toFixed(1)},${wrappedLon.toFixed(1)}`;
  const now = Date.now();

  const cached = metNoCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return {
      id,
      label,
      ...cached.sample,
    };
  }

  try {
    const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${clampedLat.toFixed(3)}&lon=${wrappedLon.toFixed(3)}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5500),
      headers: {
        'User-Agent': 'SkywatchOverheadRadar/1.0 (+https://skywatch.app/contact)',
        Accept: 'application/json',
      },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      properties?: {
        timeseries?: Array<{
          data?: {
            instant?: {
              details?: {
                air_temperature?: number;
                wind_speed?: number;
                wind_from_direction?: number;
                cloud_area_fraction?: number;
                relative_humidity?: number;
                air_pressure_at_sea_level?: number;
              };
            };
            next_1_hours?: {
              summary?: { symbol_code?: string };
              details?: { precipitation_amount?: number };
            };
          };
        }>;
      };
    };

    const first = json.properties?.timeseries?.[0]?.data;
    const details = first?.instant?.details;
    if (!details || typeof details.air_temperature !== 'number') return null;

    const tempC = Math.round(details.air_temperature * 10) / 10;
    const tempF = Math.round(tempC * 1.8 + 32);
    const windMs = typeof details.wind_speed === 'number' ? details.wind_speed : 0;
    const windKts = Math.round(windMs * 1.94384);
    const windDirDeg = Math.round(
      typeof details.wind_from_direction === 'number' ? details.wind_from_direction : 0
    );
    const precipMm1h =
      typeof first?.next_1_hours?.details?.precipitation_amount === 'number'
        ? Math.round(first.next_1_hours.details.precipitation_amount * 10) / 10
        : 0;
    const cloudCoverPct = Math.round(
      typeof details.cloud_area_fraction === 'number' ? details.cloud_area_fraction : 0
    );
    const humidityPct = Math.round(
      typeof details.relative_humidity === 'number' ? details.relative_humidity : 0
    );
    const pressureHpa = Math.round(
      typeof details.air_pressure_at_sea_level === 'number' ? details.air_pressure_at_sea_level : 1013
    );
    const symbolCode = first?.next_1_hours?.summary?.symbol_code || 'cloudy';

    const sample: Omit<WeatherStationSample, 'id' | 'label'> = {
      lat: clampedLat,
      lng: wrappedLon,
      tempC,
      tempF,
      windKts,
      windDirDeg,
      precipMm1h,
      cloudCoverPct,
      humidityPct,
      pressureHpa,
      symbolCode,
    };

    metNoCache.set(cacheKey, {
      sample,
      expiresAt: now + 10 * 60 * 1000,
    });

    return {
      id,
      label,
      ...sample,
    };
  } catch {
    return null;
  }
}

app.get('/api/weather', async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const radiusRaw = Number(req.query.radius);
  const radiusNm = Number.isFinite(radiusRaw) ? Math.max(5, Math.min(250, radiusRaw)) : 25;

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    res.status(400).json({ error: 'Valid lat and lon query parameters are required.' });
    return;
  }

  const clampedLat = Math.max(-82, Math.min(82, lat));
  const cosLat = Math.max(0.25, Math.cos((clampedLat * Math.PI) / 180));
  // Spread regional sampling stations proportional to radar radius (~0.35° to ~2.2°)
  const deltaLat = Math.max(0.28, Math.min(2.2, radiusNm / 55));
  const deltaLon = Math.min(3.5, deltaLat / cosLat);

  const stationTargets = [
    { id: 'center', label: 'Center', lat: clampedLat, lon },
    { id: 'north', label: 'N', lat: clampedLat + deltaLat, lon },
    { id: 'south', label: 'S', lat: clampedLat - deltaLat, lon },
    { id: 'east', label: 'E', lat: clampedLat, lon: lon + deltaLon },
    { id: 'west', label: 'W', lat: clampedLat, lon: lon - deltaLon },
  ];

  try {
    const [radar, ...stationResults] = await Promise.all([
      fetchRainViewerLatest(),
      ...stationTargets.map((t) => fetchMetNoWeatherPoint(t.lat, t.lon, t.id, t.label)),
    ]);

    const current = stationResults[0];
    if (!current) {
      res.status(502).json({ error: 'Weather telemetry provider did not return center forecast.' });
      return;
    }

    const gridPoints = stationResults
      .slice(1)
      .filter((s): s is WeatherStationSample => s !== null);

    const payload: WeatherOverlaySnapshot = {
      center: { lat: clampedLat, lng: lon },
      fetchedAt: Date.now(),
      radarHost: radar?.host ?? null,
      radarPath: radar?.latestPath ?? null,
      radarTime: radar?.latestTime ?? null,
      current,
      gridPoints,
    };

    res.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch live weather overlay.';
    res.status(502).json({ error: message });
  }
});

async function startServer() {
  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Skywatch Overhead server listening on http://0.0.0.0:${PORT}`);
    startAisStreamIfConfigured();
  });
}

startServer();
