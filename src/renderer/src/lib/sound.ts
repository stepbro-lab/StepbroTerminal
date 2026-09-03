import notificationUrl from '@/assets/StepbroNoti.mp3'
import { usePrefs } from '@/stores/prefs'

let clip: HTMLAudioElement | null = null

/** The notification sound at the level from Settings. Restarts from the top if it is still playing. */
export function playNotificationSound(volume = usePrefs.getState().prefs?.soundVolume ?? 80): void {
  if (!clip) {
    clip = new Audio(notificationUrl)
    clip.preload = 'auto'
  }
  clip.volume = Math.min(100, Math.max(0, volume)) / 100
  clip.currentTime = 0
  void clip.play().catch(() => {
    /* audio can be refused before the first user gesture; nothing to do */
  })
}
