/**
 * Client-side notification and reminder audio service
 * Uses Web Audio API for synthetic audio chime and HTML5 Notification API for device alerts.
 */

let audioContext: AudioContext | null = null;

export function playReminderChime(isEmergency = false) {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;

    if (!audioContext || audioContext.state === 'suspended') {
      audioContext = new AudioCtx();
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {});
    }

    const now = audioContext.currentTime;

    if (isEmergency) {
      // 3 urgent ascending beeps
      [0, 0.2, 0.4].forEach((delay, i) => {
        const osc = audioContext!.createOscillator();
        const gain = audioContext!.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(880 + i * 150, now + delay);

        gain.gain.setValueAtTime(0.2, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.15);

        osc.connect(gain);
        gain.connect(audioContext!.destination);

        osc.start(now + delay);
        osc.stop(now + delay + 0.16);
      });
    } else {
      // Gentle chime (two harmonic bells: D5 -> A5)
      const freqs = [587.33, 880];
      freqs.forEach((freq, idx) => {
        const osc = audioContext!.createOscillator();
        const gain = audioContext!.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.18);

        gain.gain.setValueAtTime(0.25, now + idx * 0.18);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.7);

        osc.connect(gain);
        gain.connect(audioContext!.destination);

        osc.start(now + idx * 0.18);
        osc.stop(now + idx * 0.18 + 0.75);
      });
    }
  } catch (e) {
    console.warn('Audio chime notice:', e);
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  try {
    const perm = await Notification.requestPermission();
    return perm;
  } catch {
    return Notification.permission;
  }
}

export function sendDeviceNotification(title: string, options?: NotificationOptions) {
  if (typeof window === 'undefined' || !('Notification' in window)) return null;

  if (Notification.permission === 'granted') {
    try {
      const notif = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options,
      });

      notif.onclick = () => {
        window.focus();
        notif.close();
      };

      return notif;
    } catch (e) {
      console.warn('Device notification error:', e);
    }
  }
  return null;
}
