import type { ProximityAlertConfig, ProximityTargetMode } from '../types/airspace';

const STORAGE_KEY = 'skywatch:proximity-alert-v1';

export const DEFAULT_PROXIMITY_CONFIG: ProximityAlertConfig = {
  enabled: false,
  radiusNm: 10,
  targets: 'both',
  airborneOnly: true,
  soundEnabled: true,
};

export function clampAlertRadiusNm(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_PROXIMITY_CONFIG.radiusNm;
  return Math.round(Math.min(250, Math.max(0.5, value)) * 10) / 10;
}

export function loadProximityConfig(): ProximityAlertConfig {
  if (typeof window === 'undefined') return DEFAULT_PROXIMITY_CONFIG;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PROXIMITY_CONFIG;
    const parsed = JSON.parse(raw) as Partial<ProximityAlertConfig>;
    const targets: ProximityTargetMode =
      parsed.targets === 'air' || parsed.targets === 'sea' || parsed.targets === 'both'
        ? parsed.targets
        : DEFAULT_PROXIMITY_CONFIG.targets;
    return {
      enabled: Boolean(parsed.enabled),
      radiusNm: clampAlertRadiusNm(Number(parsed.radiusNm ?? DEFAULT_PROXIMITY_CONFIG.radiusNm)),
      targets,
      airborneOnly:
        typeof parsed.airborneOnly === 'boolean'
          ? parsed.airborneOnly
          : DEFAULT_PROXIMITY_CONFIG.airborneOnly,
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean'
          ? parsed.soundEnabled
          : DEFAULT_PROXIMITY_CONFIG.soundEnabled,
    };
  } catch {
    return DEFAULT_PROXIMITY_CONFIG;
  }
}

export function saveProximityConfig(config: ProximityAlertConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

export type BrowserNotifPermission = NotificationPermission | 'unsupported';

export function getBrowserNotificationPermission(): BrowserNotifPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotifPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await window.Notification.requestPermission();
    return result;
  } catch {
    return window.Notification.permission || 'denied';
  }
}

export function sendBrowserNotification(
  title: string,
  body: string,
  tag?: string
): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (window.Notification.permission !== 'granted') {
    return false;
  }
  try {
    const notif = new window.Notification(title, {
      body,
      tag,
      silent: false,
    });
    window.setTimeout(() => {
      try {
        notif.close();
      } catch {
        // Ignore close errors
      }
    }, 8000);
    return true;
  } catch {
    return false;
  }
}

let sharedAudioCtx: AudioContext | null = null;

export function playProximityChime(): void {
  if (typeof window === 'undefined') return;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume();
    }

    const now = sharedAudioCtx.currentTime;
    const tones = [
      { freq: 880, start: 0, duration: 0.14 },
      { freq: 1174.66, start: 0.11, duration: 0.22 },
    ];

    for (const tone of tones) {
      const osc = sharedAudioCtx.createOscillator();
      const gain = sharedAudioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(tone.freq, now + tone.start);

      gain.gain.setValueAtTime(0.0001, now + tone.start);
      gain.gain.exponentialRampToValueAtTime(0.08, now + tone.start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.start + tone.duration);

      osc.connect(gain);
      gain.connect(sharedAudioCtx.destination);
      osc.start(now + tone.start);
      osc.stop(now + tone.start + tone.duration + 0.02);
    }
  } catch {
    // Ignore autoplay / AudioContext restrictions
  }
}
