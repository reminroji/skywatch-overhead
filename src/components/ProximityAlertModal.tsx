import { Bell, BellOff, BellRing, Plane, Ship, Trash2, Volume2, VolumeX, X } from 'lucide-react';
import type {
  ObserverLocation,
  ProximityAlertConfig,
  ProximityAlertEvent,
  ProximityTargetMode,
} from '../types/airspace';
import {
  clampAlertRadiusNm,
  type BrowserNotifPermission,
} from '../utils/proximityAlerts';

interface ProximityAlertModalProps {
  observer: ObserverLocation;
  config: ProximityAlertConfig;
  notifPermission: BrowserNotifPermission;
  alertHistory: ProximityAlertEvent[];
  onChangeConfig: (next: ProximityAlertConfig) => void;
  onRequestNotifPermission: () => void;
  onSendTestAlert: () => void;
  onSelectEvent: (event: ProximityAlertEvent) => void;
  onClearHistory: () => void;
  onClose: () => void;
}

const ALERT_RADIUS_PRESETS = [1, 3, 5, 10, 25, 50, 100] as const;

const TARGET_OPTIONS: Array<{ id: ProximityTargetMode; label: string }> = [
  { id: 'both', label: 'Air + Sea' },
  { id: 'air', label: 'Aircraft Only' },
  { id: 'sea', label: 'Vessels Only' },
];

function formatAlertTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '--:--';
  }
}

export function ProximityAlertModal({
  observer,
  config,
  notifPermission,
  alertHistory,
  onChangeConfig,
  onRequestNotifPermission,
  onSendTestAlert,
  onSelectEvent,
  onClearHistory,
  onClose,
}: ProximityAlertModalProps) {
  const updateField = <K extends keyof ProximityAlertConfig>(
    key: K,
    value: ProximityAlertConfig[K]
  ) => {
    onChangeConfig({ ...config, [key]: value });
  };

  const handleToggleArmed = () => {
    const nextEnabled = !config.enabled;
    if (nextEnabled && notifPermission === 'default') {
      onRequestNotifPermission();
    }
    updateField('enabled', nextEnabled);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Proximity Alert Configuration"
    >
      <div className="w-full max-w-3xl bg-[#0B0E17] border border-slate-800 rounded-md shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
              {config.enabled ? (
                <BellRing className="w-4 h-4 text-amber-400 shrink-0" />
              ) : (
                <Bell className="w-4 h-4 text-slate-400 shrink-0" />
              )}
              <span>Proximity Alert Perimeter</span>
            </h2>
            <p className="text-xs text-slate-400 truncate">
              Notify when aircraft or vessels enter a custom radius around {observer.label}.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close proximity alert settings"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 grid grid-cols-1 lg:grid-cols-[1.2fr_0.95fr] gap-5 overflow-y-auto telemetry-scroll">
          {/* Left: Configuration */}
          <div className="space-y-4">
            {/* Master Arm Toggle */}
            <div className="p-3.5 rounded border border-slate-800 bg-[#07090E] flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white">
                  {config.enabled ? 'Perimeter Monitoring Armed' : 'Perimeter Monitoring Paused'}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {config.enabled
                    ? `Watching within ${config.radiusNm} NM (${(config.radiusNm * 1.852).toFixed(1)} km)`
                    : 'Arm monitoring to watch for incoming contacts'}
                </div>
              </div>
              <button
                type="button"
                onClick={handleToggleArmed}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  config.enabled
                    ? 'bg-amber-500/20 border-amber-400/60 text-amber-200 hover:bg-amber-500/30'
                    : 'bg-cyan-400 border-cyan-400 text-[#07090E] hover:bg-cyan-300'
                }`}
              >
                {config.enabled ? (
                  <>
                    <BellOff className="w-3.5 h-3.5" />
                    <span>Disarm</span>
                  </>
                ) : (
                  <>
                    <BellRing className="w-3.5 h-3.5" />
                    <span>Arm Alert</span>
                  </>
                )}
              </button>
            </div>

            {/* Radius Selector */}
            <div className="p-3.5 rounded border border-slate-800 bg-[#07090E] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="proximity-radius-input"
                  className="text-xs font-medium text-slate-200"
                >
                  Alert Radius
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    id="proximity-radius-input"
                    type="number"
                    min={0.5}
                    max={250}
                    step={0.5}
                    value={config.radiusNm}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!Number.isNaN(val)) {
                        updateField('radiusNm', clampAlertRadiusNm(val));
                      }
                    }}
                    className="w-20 px-2 py-1 text-right text-xs font-mono-tabular bg-[#0B0E17] border border-slate-700 rounded text-amber-300 focus:outline-none focus:border-amber-400"
                  />
                  <span className="text-xs font-mono-tabular text-slate-400">NM</span>
                </div>
              </div>

              <input
                type="range"
                min={0.5}
                max={250}
                step={0.5}
                value={config.radiusNm}
                onChange={(e) =>
                  updateField('radiusNm', clampAlertRadiusNm(parseFloat(e.target.value)))
                }
                aria-label="Proximity alert radius slider"
                className="w-full accent-amber-400 cursor-pointer"
              />

              <div className="flex flex-wrap items-center gap-1.5">
                {ALERT_RADIUS_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => updateField('radiusNm', preset)}
                    className={`px-2.5 py-1 text-xs font-mono-tabular rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      config.radiusNm === preset
                        ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                        : 'bg-[#0B0E17] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                    }`}
                  >
                    {preset} NM
                  </button>
                ))}
              </div>

              <div className="text-[11px] text-slate-400 font-mono-tabular">
                {(config.radiusNm * 1.15078).toFixed(1)} mi ·{' '}
                {(config.radiusNm * 1.852).toFixed(1)} km perimeter
                {config.radiusNm > 100 && (
                  <span className="text-slate-500">
                    {' '}
                    · ADS-B aircraft feed caps at 100 NM; vessels cover up to 250 NM
                  </span>
                )}
              </div>
            </div>

            {/* Targets & Behavior */}
            <div className="p-3.5 rounded border border-slate-800 bg-[#07090E] space-y-3">
              <div className="text-xs font-medium text-slate-200">Monitored Craft</div>
              <div className="grid grid-cols-3 gap-1 p-0.5 bg-[#0B0E17] border border-slate-800 rounded-md">
                {TARGET_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateField('targets', opt.id)}
                    className={`py-1.5 text-xs font-medium rounded border transition-colors whitespace-nowrap cursor-pointer ${
                      config.targets === opt.id
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                        : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="space-y-2 pt-1">
                {config.targets !== 'sea' && (
                  <label className="flex items-center justify-between gap-3 text-xs text-slate-300 cursor-pointer">
                    <span>Ignore parked / taxiing ground aircraft</span>
                    <input
                      type="checkbox"
                      checked={config.airborneOnly}
                      onChange={(e) => updateField('airborneOnly', e.target.checked)}
                      className="w-4 h-4 accent-amber-400 rounded cursor-pointer"
                    />
                  </label>
                )}

                <label className="flex items-center justify-between gap-3 text-xs text-slate-300 cursor-pointer">
                  <span className="inline-flex items-center gap-1.5">
                    {config.soundEnabled ? (
                      <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <VolumeX className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>Play subtle radar chime on entry</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={config.soundEnabled}
                    onChange={(e) => updateField('soundEnabled', e.target.checked)}
                    className="w-4 h-4 accent-amber-400 rounded cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* Browser Notifications & Test */}
            <div className="p-3.5 rounded border border-slate-800 bg-[#07090E] space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-200">Browser Notifications</span>
                <span
                  className={`text-xs font-mono-tabular ${
                    notifPermission === 'granted'
                      ? 'text-emerald-400'
                      : notifPermission === 'default'
                        ? 'text-amber-300'
                        : 'text-slate-400'
                  }`}
                >
                  {notifPermission === 'granted'
                    ? 'Permission Granted'
                    : notifPermission === 'default'
                      ? 'Permission Required'
                      : notifPermission === 'denied'
                        ? 'Blocked (In-App Active)'
                        : 'Unsupported (In-App Active)'}
                </span>
              </div>

              {notifPermission === 'denied' && (
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  OS notifications are blocked in this browser context or preview frame. In-app entry banners and chimes remain active whenever monitoring is armed.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {notifPermission === 'default' && (
                  <button
                    type="button"
                    onClick={onRequestNotifPermission}
                    className="px-3 py-1.5 text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#07090E] rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Allow Browser Notifications
                  </button>
                )}

                <button
                  type="button"
                  onClick={onSendTestAlert}
                  className="px-3 py-1.5 text-xs font-medium bg-[#0B0E17] border border-slate-700 hover:border-amber-400/60 text-slate-200 hover:text-amber-200 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Send Test Alert
                </button>
              </div>
            </div>
          </div>

          {/* Right: Recent Entry Alerts */}
          <div className="flex flex-col border border-slate-800 rounded bg-[#07090E] min-h-[280px] max-h-[460px]">
            <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-xs font-medium text-slate-200">
                Recent Perimeter Entries ({alertHistory.length})
              </span>
              {alertHistory.length > 0 && (
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {alertHistory.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-2">
                <Bell className="w-6 h-6 text-slate-600" />
                <p className="text-xs text-slate-400 leading-relaxed max-w-[240px]">
                  {config.enabled
                    ? 'Watching perimeter. New flights or vessels entering your radius will appear here.'
                    : 'Arm monitoring to log new aircraft and vessel entries into your perimeter.'}
                </p>
              </div>
            ) : (
              <ul className="flex-1 overflow-y-auto telemetry-scroll divide-y divide-slate-800/70">
                {alertHistory.map((ev) => {
                  const isTest = ev.entityId === '__test__';
                  return (
                    <li key={ev.id}>
                      <button
                        type="button"
                        disabled={isTest}
                        onClick={() => {
                          if (!isTest) {
                            onSelectEvent(ev);
                            onClose();
                          }
                        }}
                        className={`w-full text-left px-3.5 py-2.5 transition-colors ${
                          isTest ? 'cursor-default opacity-85' : 'hover:bg-slate-900/70 cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="inline-flex items-center gap-1.5 font-medium text-white truncate">
                            {ev.domain === 'sea' ? (
                              <Ship className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                            ) : (
                              <Plane className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            )}
                            <span className="truncate">{ev.title}</span>
                          </span>
                          <span className="font-mono-tabular text-[11px] text-slate-400 shrink-0">
                            {formatAlertTime(ev.timestamp)}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                          <span className="truncate">{ev.subtitle}</span>
                          <span className="font-mono-tabular text-amber-300 shrink-0">
                            {ev.distanceNm.toFixed(1)} NM {ev.compassDir}
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
