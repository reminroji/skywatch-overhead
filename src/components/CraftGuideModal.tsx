import { useState } from 'react';
import { X } from 'lucide-react';
import type { CraftKind, VesselKind } from '../types/airspace';
import {
  craftAccentHex,
  craftKindLabel,
  vesselAccentHex,
  vesselKindLabel,
} from '../utils/airspaceFormat';
import { AircraftSilhouette, VesselSilhouette } from './AircraftIcons';

interface CraftGuideModalProps {
  onClose: () => void;
}

const AIR_GUIDE_ITEMS: Array<{ kind: CraftKind; codes: string; description: string }> = [
  {
    kind: 'commercial',
    codes: 'ADS-B A3 / A4 · B738, A320, E175, CRJ9',
    description:
      'Narrowbody regional and mainline passenger jets flying domestic or medium-haul corridors.',
  },
  {
    kind: 'heavy',
    codes: 'ADS-B A5 · B77W, B789, A359, A388, B748',
    description:
      'Widebody intercontinental airliners and heavy freighters exceeding 300,000 lbs max takeoff weight.',
  },
  {
    kind: 'helicopter',
    codes: 'ADS-B A7 · R44, EC35, B407, S76, AW139',
    description:
      'Rotorcraft including medical evacuation, law enforcement, news, sightseeing, and offshore helicopters.',
  },
  {
    kind: 'fighter',
    codes: 'ADS-B A6 / Military dbFlags · F16, F18, F35, EUFI, T38',
    description:
      'Supersonic fighter jets, tactical trainers, interceptors, and active military aircraft transmitting ADS-B.',
  },
  {
    kind: 'light',
    codes: 'ADS-B A1 / A2 · C172, SR22, PC12, GLF6',
    description:
      'General aviation piston singles/twins, turboprops, and private business jets operating at lower or cruise altitudes.',
  },
  {
    kind: 'special',
    codes: 'ADS-B B1–B6 · Gliders, Balloons, UAVs',
    description:
      'Sailplanes, lighter-than-air balloons, skydiving jump planes, and unmanned aerial vehicles.',
  },
];

const SEA_GUIDE_ITEMS: Array<{ kind: VesselKind; codes: string; description: string }> = [
  {
    kind: 'cruise',
    codes: 'AIS Type 60–69 · Passenger & Cruise Liners',
    description:
      'Ocean cruise ships, passenger ferries, and high-speed coastal passenger vessels broadcasting AIS.',
  },
  {
    kind: 'cargo',
    codes: 'AIS Type 70–79 · Container & Bulk Carriers',
    description:
      'Deep-sea container ships, dry bulk carriers, and general cargo freighters transiting major shipping lanes.',
  },
  {
    kind: 'tanker',
    codes: 'AIS Type 80–89 · Crude, LNG & Chemical Tankers',
    description:
      'Oil supertankers, LNG carriers, and product tankers cruising chokepoints like Hormuz, Malacca, and Suez.',
  },
  {
    kind: 'vos',
    codes: 'NOAA VOS · Global Ocean Ship Reports',
    description:
      'Live Voluntary Observing Ship positions across the Indian Ocean, Atlantic, and Pacific with wind, wave, and sea temp telemetry.',
  },
  {
    kind: 'tug',
    codes: 'AIS Type 30–37, 50–59 · Tugs, Fishing & Sailing',
    description:
      'Harbor tugs, pilot boats, commercial fishing vessels, offshore support ships, and ocean-going yachts.',
  },
];

export function CraftGuideModal({ onClose }: CraftGuideModalProps) {
  const [tab, setTab] = useState<'air' | 'sea'>('air');

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Aircraft and Vessel Classification Guide"
    >
      <div className="w-full max-w-xl bg-[#0B0E17] border border-slate-800 rounded-md shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold text-white">
              Air & Sea Classification Guide
            </h2>
            <p className="text-xs text-slate-400">
              How Skywatch identifies aircraft from ADS-B and vessels from AIS / ocean telemetry.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close guide"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-3 flex items-center gap-1">
          <div className="inline-flex items-center gap-1 p-0.5 bg-[#07090E] border border-slate-800 rounded-md">
            <button
              type="button"
              onClick={() => setTab('air')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                tab === 'air' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Aircraft (ADS-B)
            </button>
            <button
              type="button"
              onClick={() => setTab('sea')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${
                tab === 'sea' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Ships & Routes (AIS / VOS)
            </button>
          </div>
        </div>

        <div className="p-5 divide-y divide-slate-800/80 max-h-[65vh] overflow-y-auto telemetry-scroll">
          {tab === 'air'
            ? AIR_GUIDE_ITEMS.map((item) => {
                const color = craftAccentHex(item.kind);
                return (
                  <div key={item.kind} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded border border-slate-800 bg-[#07090E] flex items-center justify-center shrink-0">
                      <AircraftSilhouette kind={item.kind} color={color} size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <span style={{ color }}>{craftKindLabel(item.kind)}</span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span className="text-xs font-mono-tabular font-normal text-slate-400">
                          {item.codes}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-300 leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                );
              })
            : SEA_GUIDE_ITEMS.map((item) => {
                const color = vesselAccentHex(item.kind);
                return (
                  <div key={item.kind} className="py-3 first:pt-0 last:pb-0 flex items-start gap-3.5">
                    <div className="w-9 h-9 rounded border border-slate-800 bg-[#07090E] flex items-center justify-center shrink-0">
                      <VesselSilhouette kind={item.kind} color={color} size={20} heading={35} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white">
                        <span style={{ color }}>{vesselKindLabel(item.kind)}</span>
                        <span aria-hidden="true" className="text-slate-600">·</span>
                        <span className="text-xs font-mono-tabular font-normal text-slate-400">
                          {item.codes}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-300 leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    </div>
  );
}
