import type {
  Aircraft,
  AircraftMetadata,
  CraftKind,
  FlightCategory,
  FlightRouteInfo,
  VesselKind,
} from '../types/airspace';

const ICAO_TYPE_NAMES: Record<string, string> = {
  A319: 'Airbus A319',
  A320: 'Airbus A320',
  A20N: 'Airbus A320neo',
  A321: 'Airbus A321',
  A21N: 'Airbus A321neo',
  A306: 'Airbus A300-600 Freighter',
  A332: 'Airbus A330-200',
  A333: 'Airbus A330-300',
  A339: 'Airbus A330-900neo',
  A359: 'Airbus A350-900',
  A35K: 'Airbus A350-1000',
  A388: 'Airbus A380-800',
  BCS1: 'Airbus A220-100',
  BCS3: 'Airbus A220-300',
  B737: 'Boeing 737-700',
  B738: 'Boeing 737-800',
  B739: 'Boeing 737-900',
  B38M: 'Boeing 737 MAX 8',
  B39M: 'Boeing 737 MAX 9',
  B752: 'Boeing 757-200',
  B763: 'Boeing 767-300',
  B772: 'Boeing 777-200',
  B77L: 'Boeing 777-200LR / Freighter',
  B77W: 'Boeing 777-300ER',
  B788: 'Boeing 787-8 Dreamliner',
  B789: 'Boeing 787-9 Dreamliner',
  B78X: 'Boeing 787-10 Dreamliner',
  B744: 'Boeing 747-400',
  B748: 'Boeing 747-8',
  B74F: 'Boeing 747 Freighter',
  MD11: 'McDonnell Douglas MD-11',
  E170: 'Embraer E170',
  E175: 'Embraer E175',
  E75L: 'Embraer 175 Long Wing',
  E190: 'Embraer E190',
  CRJ7: 'Bombardier CRJ-700',
  CRJ9: 'Bombardier CRJ-900',
  C172: 'Cessna 172 Skyhawk',
  C182: 'Cessna 182 Skylane',
  C208: 'Cessna 208 Caravan',
  C25A: 'Cessna Citation CJ2',
  C25B: 'Cessna Citation CJ3',
  C25C: 'Cessna Citation CJ4',
  C510: 'Cessna Citation Mustang',
  C525: 'Cessna CitationJet',
  C550: 'Cessna Citation II',
  C560: 'Cessna Citation V / Ultra',
  C56X: 'Cessna Citation Excel / XLS',
  C680: 'Cessna Citation Sovereign',
  C68A: 'Cessna Citation Latitude',
  C700: 'Cessna Citation Longitude',
  C750: 'Cessna Citation X',
  CL30: 'Bombardier Challenger 300',
  CL35: 'Bombardier Challenger 350',
  CL60: 'Bombardier Challenger 600 / 650',
  E50P: 'Embraer Phenom 100',
  E55P: 'Embraer Phenom 300',
  E545: 'Embraer Praetor 500 / Legacy 450',
  E550: 'Embraer Praetor 600 / Legacy 500',
  E35L: 'Embraer Legacy 600 / 650',
  FA50: 'Dassault Falcon 50',
  FA7X: 'Dassault Falcon 7X',
  FA8X: 'Dassault Falcon 8X',
  F2TH: 'Dassault Falcon 2000',
  F900: 'Dassault Falcon 900',
  G280: 'Gulfstream G280',
  GA5C: 'Gulfstream G500',
  GA6C: 'Gulfstream G600',
  GA7C: 'Gulfstream G700',
  GLF4: 'Gulfstream G-IV / G450',
  GLF5: 'Gulfstream G550',
  GLF6: 'Gulfstream G650',
  GLEX: 'Bombardier Global Express',
  GL5T: 'Bombardier Global 5000',
  GL7T: 'Bombardier Global 7500',
  HDJT: 'HondaJet HA-420',
  LJ35: 'Learjet 35',
  LJ45: 'Learjet 45',
  LJ60: 'Learjet 60',
  LJ75: 'Learjet 75',
  PC24: 'Pilatus PC-24',
  SF50: 'Cirrus Vision SF50 Jet',
  SR22: 'Cirrus SR22',
  PC12: 'Pilatus PC-12',
  TBM9: 'Daher TBM 900 / 940',
  R22: 'Robinson R22 Helicopter',
  R44: 'Robinson R44 Helicopter',
  R66: 'Robinson R66 Helicopter',
  B06: 'Bell 206 JetRanger',
  B407: 'Bell 407 Helicopter',
  B412: 'Bell 412 Helicopter',
  B429: 'Bell 429 GlobalRanger',
  EC30: 'Airbus H130 Helicopter',
  EC35: 'Airbus H135 Helicopter',
  EC45: 'Airbus H145 Helicopter',
  AS50: 'Airbus H125 AStar',
  S76: 'Sikorsky S-76 Helicopter',
  S92: 'Sikorsky S-92 Helicopter',
  H60: 'Sikorsky UH-60 Black Hawk',
  UH60: 'Sikorsky UH-60 Black Hawk',
  A109: 'Leonardo AW109 Helicopter',
  A139: 'Leonardo AW139 Helicopter',
  V22: 'Bell Boeing V-22 Osprey',
  F16: 'General Dynamics F-16 Fighting Falcon',
  F15: 'McDonnell Douglas F-15 Eagle',
  F18: 'Boeing F/A-18 Hornet',
  FA18: 'Boeing F/A-18 Super Hornet',
  EA18: 'Boeing EA-18G Growler',
  F22: 'Lockheed Martin F-22 Raptor',
  F35: 'Lockheed Martin F-35 Lightning II',
  EUFI: 'Eurofighter Typhoon',
  EF20: 'Eurofighter Typhoon',
  RFAL: 'Dassault Rafale',
  T38: 'Northrop T-38 Talon',
  T45: 'Boeing T-45 Goshawk',
  T6: 'Beechcraft T-6 Texan II',
  TEX2: 'Beechcraft T-6 Texan II',
  A10: 'Fairchild Republic A-10 Thunderbolt II',
  HAWK: 'BAE Systems Hawk',
  TOR: 'Panavia Tornado',
  GRPN: 'Panavia Tornado',
  M2000: 'Dassault Mirage 2000',
  MIR2: 'Dassault Mirage 2000',
  SB39: 'Saab JAS 39 Gripen',
  JAS3: 'Saab JAS 39 Gripen',
  B1: 'Rockwell B-1B Lancer',
  B2: 'Northrop Grumman B-2 Spirit',
  B52: 'Boeing B-52 Stratofortress',
  C17: 'Boeing C-17 Globemaster III',
  C130: 'Lockheed C-130 Hercules',
  C30J: 'Lockheed Martin C-130J Super Hercules',
  K35R: 'Boeing KC-135 Stratotanker',
  H64: 'Boeing AH-64 Apache',
  LYNX: 'Westland Lynx Helicopter',
};

export function resolveTypeName(typeCode: string | null, desc: string | null): string {
  if (desc) return desc;
  if (!typeCode) return 'Unidentified Aircraft';
  const upper = typeCode.toUpperCase();
  return ICAO_TYPE_NAMES[upper] || upper;
}

export function craftKindLabel(kind: CraftKind): string {
  switch (kind) {
    case 'helicopter':
      return 'Helicopter';
    case 'fighter':
      return 'Fighter / Tactical';
    case 'heavy':
      return 'Heavy Jet';
    case 'commercial':
      return 'Airliner';
    case 'light':
      return 'Light / GA';
    case 'special':
      return 'Special / Drone';
    default:
      return 'Unclassified';
  }
}

export function craftAccentHex(kind: CraftKind): string {
  switch (kind) {
    case 'helicopter':
      return '#F59E0B'; // Telemetry Amber
    case 'fighter':
      return '#F43F5E'; // Fighter Rose-Crimson
    case 'heavy':
      return '#38BDF8'; // Sky Blue
    case 'commercial':
      return '#06B6D4'; // Phosphor Cyan
    case 'light':
      return '#34D399'; // Emerald
    case 'special':
      return '#A78BFA'; // Violet
    default:
      return '#94A3B8'; // Slate
  }
}

export function formatAltitude(altFt: number, onGround: boolean): string {
  if (onGround) return 'GND';
  if (altFt >= 18000) {
    return `FL${Math.round(altFt / 100)}`;
  }
  return `${altFt.toLocaleString()} ft`;
}

export function formatVerticalRate(fpm: number): { symbol: string; text: string; toneClass: string } {
  if (fpm > 150) {
    return { symbol: '▲', text: `+${fpm.toLocaleString()} fpm`, toneClass: 'text-emerald-400' };
  }
  if (fpm < -150) {
    return { symbol: '▼', text: `${fpm.toLocaleString()} fpm`, toneClass: 'text-amber-400' };
  }
  return { symbol: '—', text: 'Level', toneClass: 'text-slate-400' };
}

export function formatCoord(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`;
}

export function describeOverheadSightline(ac: Aircraft): string {
  if (ac.onGround) {
    return `On ground ${ac.distanceNm.toFixed(1)} NM ${ac.compassDir}`;
  }
  if (ac.elevationAngleDeg >= 72) {
    return `Nearly straight up (${ac.elevationAngleDeg}° elevation) · ${ac.compassDir}`;
  }
  if (ac.elevationAngleDeg >= 35) {
    return `Look ${ac.compassDir} (${ac.bearingDeg}°) · ${ac.elevationAngleDeg}° above horizon`;
  }
  return `Low on ${ac.compassDir} horizon (${ac.elevationAngleDeg}° elevation)`;
}

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function vesselKindLabel(kind: VesselKind): string {
  switch (kind) {
    case 'cruise':
      return 'Cruise / Passenger';
    case 'cargo':
      return 'Cargo Vessel';
    case 'tanker':
      return 'Tanker';
    case 'fishing':
      return 'Fishing Vessel';
    case 'tug':
      return 'Tug / Pilot';
    case 'sailing':
      return 'Sailing / Yacht';
    case 'vos':
      return 'Ocean VOS Ship';
    default:
      return 'Marine Vessel';
  }
}

export function vesselAccentHex(kind: VesselKind): string {
  switch (kind) {
    case 'cruise':
      return '#2DD4BF'; // Seafoam Teal
    case 'cargo':
      return '#60A5FA'; // Maritime Blue
    case 'tanker':
      return '#FB923C'; // Amber-Orange
    case 'fishing':
      return '#A3E635'; // Lime
    case 'tug':
      return '#FBBF24'; // Gold
    case 'sailing':
      return '#C084FC'; // Lavender
    case 'vos':
      return '#38BDF8'; // Ocean Sky
    default:
      return '#94A3B8'; // Slate
  }
}

export function formatTimeAgo(ts: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.round(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

const CARGO_AIRLINE_PREFIXES = new Set([
  'FDX', 'UPS', 'BCS', 'DHK', 'DHL', 'BOX', 'GTI', 'CKS', 'KFS', 'CLX', 'ICV',
  'PAC', 'ABX', 'ATN', 'NCA', 'AZG', 'MPH', 'SQC', 'CAO', 'CKK', 'CJT', 'SWN',
  'FPO', 'TAY', 'MNB', 'LYC', 'GEC', 'HKC', 'SOO', 'VDA', 'ADB', 'KZU', 'TNO',
]);

const CARGO_TYPE_CODES = new Set([
  'B74F', 'B77F', 'B76F', 'B75F', 'B73F', 'A30F', 'A306', 'A33F', 'MD11', 'DC10',
  'B46F', 'AN12', 'A124', 'IL76', 'SH36', 'SW4', 'AT7F',
]);

const PRIVATE_JET_TYPE_CODES = new Set([
  'GLF2', 'GLF3', 'GLF4', 'GLF5', 'GLF6', 'G150', 'G200', 'G280', 'GA5C', 'GA6C',
  'GA7C', 'GA8C', 'G500', 'G550', 'G650', 'G700', 'GLEX', 'GL5T', 'GL7T', 'CL30',
  'CL35', 'CL60', 'C25A', 'C25B', 'C25C', 'C25M', 'C500', 'C501', 'C510', 'C525',
  'C550', 'C551', 'C560', 'C56X', 'C650', 'C680', 'C68A', 'C700', 'C750', 'LJ23',
  'LJ24', 'LJ25', 'LJ31', 'LJ35', 'LJ36', 'LJ40', 'LJ45', 'LJ55', 'LJ60', 'LJ70',
  'LJ75', 'FA10', 'FA20', 'FA50', 'FA7X', 'FA8X', 'F2TH', 'F900', 'F6X', 'E50P',
  'E55P', 'E545', 'E550', 'E35L', 'HDJT', 'PC24', 'PRM1', 'BE40', 'MU30', 'H25A',
  'H25B', 'H25C', 'HA4T', 'GALX', 'ASTR', 'WW24', 'SBR1', 'SBR2', 'EA50', 'SF50',
]);

const PRIVATE_JET_OPERATORS = new Set([
  'EJA', 'NJE', 'LXJ', 'VJT', 'XOJ', 'WUP', 'JTL', 'EJM', 'GAJ', 'TWY', 'FLJ',
  'EDG', 'TMC', 'AOJ', 'PJS', 'FTH', 'ASP', 'BKA', 'JAS', 'NSH', 'PWA',
]);

const WIDEBODY_PREFIXES = ['A33', 'A34', 'A35', 'A38', 'B74', 'B76', 'B77', 'B78', 'MD11'];
const REGIONAL_PREFIXES = ['E17', 'E19', 'E75', 'E29', 'E13', 'E14', 'CRJ', 'DH8', 'AT7', 'AT4', 'SF34', 'B190'];

export interface FlightProfileSummary {
  modelDisplay: string;
  icaoTypeCode: string | null;
  category: FlightCategory;
  categoryToneClass: string;
  flightKind: string;
  phaseLabel: string;
  registeredOwner: string | null;
  operatingCompany: string | null;
  ownerCountry: string | null;
}

export function classifyFlightProfile(
  aircraft: Aircraft,
  meta: AircraftMetadata | null,
  activeRoute: FlightRouteInfo | null
): FlightProfileSummary {
  const icaoTypeCode = (meta?.icaoType || aircraft.aircraftType || '').toUpperCase().trim() || null;
  const modelDisplay =
    meta?.manufacturer && meta?.type
      ? `${meta.manufacturer} ${meta.type}`
      : meta?.type || resolveTypeName(aircraft.aircraftType, aircraft.aircraftDesc);

  const registeredOwner = meta?.registeredOwners || aircraft.operator || null;
  const operatingCompany = activeRoute?.airlineName || aircraft.operator || null;
  const ownerCountry = meta?.registeredOwnerCountry || null;

  const callsign = aircraft.callsign.toUpperCase().trim();
  const callsignPrefix3 = /^[A-Z]{3}\d/.test(callsign) ? callsign.slice(0, 3) : '';
  const opFlag = (meta?.operatorFlagCode || '').toUpperCase().trim();
  const combinedText = `${callsign} ${registeredOwner || ''} ${operatingCompany || ''} ${modelDisplay} ${aircraft.aircraftDesc || ''}`.toLowerCase();

  let phaseLabel = 'Cruising';
  if (aircraft.onGround) {
    phaseLabel = aircraft.groundSpeedKts > 5 ? 'Taxiing / Ground Roll' : 'Parked on Ground';
  } else if (aircraft.verticalRateFpm > 350) {
    phaseLabel = 'Climbing';
  } else if (aircraft.verticalRateFpm < -350) {
    phaseLabel = 'Descending / Approach';
  } else if (aircraft.altitudeFt >= 25000) {
    phaseLabel = 'High-Altitude Cruise';
  } else if (aircraft.altitudeFt < 5000) {
    phaseLabel = 'Low-Altitude Transit';
  }

  let category: FlightCategory;
  let categoryToneClass = 'text-cyan-300';
  let flightKind: string;

  const isCargo =
    CARGO_AIRLINE_PREFIXES.has(callsignPrefix3) ||
    CARGO_AIRLINE_PREFIXES.has(opFlag) ||
    (icaoTypeCode ? CARGO_TYPE_CODES.has(icaoTypeCode) : false) ||
    /\b(cargo|freight|freighter|fedex|federal express|ups|dhl|parcel|express air|air freight)\b/.test(combinedText);

  const isBizJet =
    (icaoTypeCode ? PRIVATE_JET_TYPE_CODES.has(icaoTypeCode) : false) ||
    PRIVATE_JET_OPERATORS.has(callsignPrefix3) ||
    PRIVATE_JET_OPERATORS.has(opFlag) ||
    /\b(gulfstream|citation|learjet|falcon|challenger|global express|phenom|praetor|hondajet|netjets|flexjet|vistajet|wheels up|executive jet)\b/.test(combinedText);

  if (aircraft.craftKind === 'helicopter') {
    category = 'Helicopter';
    categoryToneClass = 'text-amber-300';
    if (/\b(medevac|life|aircare|stat|careflight|ems|ambulance|hospital|rescue|merc)\b/.test(combinedText)) {
      flightKind = 'Air Ambulance / Medevac Helicopter';
    } else if (/\b(police|sheriff|patrol|trooper|nypd|lapd|highway|state police)\b/.test(combinedText)) {
      flightKind = 'Law Enforcement / Patrol Helicopter';
    } else if (/\b(coast guard|uscg|navy|army|air force|marines)\b/.test(combinedText) || aircraft.isMilitary) {
      flightKind = 'Military / Coast Guard Rotorcraft';
    } else if (/\b(news|tv|nbc|cbs|abc|fox|helicopter)\b/.test(combinedText)) {
      flightKind = 'Utility / Broadcast Rotorcraft';
    } else {
      flightKind = 'Rotary-Wing Helicopter';
    }
  } else if (aircraft.isMilitary || aircraft.craftKind === 'fighter') {
    category = 'Military Flight';
    categoryToneClass = 'text-rose-300';
    if (aircraft.craftKind === 'fighter') {
      flightKind = 'Tactical Fighter / Military Trainer';
    } else if (/\b(tanker|kc-135|kc-46|kc-10|k35r|stratotanker)\b/.test(combinedText)) {
      flightKind = 'Military Aerial Refueling Tanker';
    } else if (/\b(c-17|c-130|c-5|globemaster|hercules|galaxy|airlift|reach)\b/.test(combinedText)) {
      flightKind = 'Military Airlift / Transport';
    } else {
      flightKind = 'Defense / Government Military Flight';
    }
  } else if (isCargo) {
    category = 'Cargo Flight';
    categoryToneClass = 'text-amber-300';
    flightKind =
      /\b(fedex|ups|dhl|express|parcel)\b/.test(combinedText)
        ? 'Dedicated Express Parcel Freighter'
        : 'Commercial Air Cargo Freighter';
  } else if (isBizJet) {
    category = 'Private Jet';
    categoryToneClass = 'text-violet-300';
    if (PRIVATE_JET_OPERATORS.has(callsignPrefix3) || /\b(netjets|flexjet|vistajet|charter|fractional|wheels up|xojet)\b/.test(combinedText)) {
      flightKind = 'Private Charter / Fractional Business Jet';
    } else if (
      icaoTypeCode &&
      ['GLF5', 'GLF6', 'GA5C', 'GA6C', 'GA7C', 'GA8C', 'GLEX', 'GL5T', 'GL7T', 'FA7X', 'FA8X'].includes(icaoTypeCode)
    ) {
      flightKind = 'Ultra-Long-Range Private Business Jet';
    } else {
      flightKind = 'Private / Corporate Business Jet';
    }
  } else if (aircraft.craftKind === 'special') {
    category = 'Special / Utility';
    categoryToneClass = 'text-violet-300';
    flightKind = 'Special Mission / Survey / Unmanned Craft';
  } else if (
    aircraft.craftKind === 'commercial' ||
    aircraft.craftKind === 'heavy' ||
    Boolean(activeRoute) ||
    Boolean(callsignPrefix3)
  ) {
    category = 'Commercial Flight';
    categoryToneClass = 'text-cyan-300';
    if (icaoTypeCode && WIDEBODY_PREFIXES.some((p) => icaoTypeCode.startsWith(p))) {
      flightKind = 'Widebody Long-Haul Passenger Airliner';
    } else if (icaoTypeCode && REGIONAL_PREFIXES.some((p) => icaoTypeCode.startsWith(p))) {
      flightKind = 'Regional Commuter Airliner';
    } else {
      flightKind = 'Scheduled Commercial Passenger Airliner';
    }
  } else if (aircraft.craftKind === 'light') {
    category = 'General Aviation';
    categoryToneClass = 'text-emerald-300';
    if (/\b(flight school|academy|training|aviation|university|college|club)\b/.test(combinedText)) {
      flightKind = 'Flight Training / Aviation Academy';
    } else {
      flightKind = 'Private General Aviation Piston / Turboprop';
    }
  } else {
    category = 'General Aviation';
    categoryToneClass = 'text-slate-300';
    flightKind = activeRoute ? 'Scheduled Commercial Flight' : 'Civil / Private Flight';
  }

  return {
    modelDisplay,
    icaoTypeCode,
    category,
    categoryToneClass,
    flightKind,
    phaseLabel,
    registeredOwner,
    operatingCompany,
    ownerCountry,
  };
}
