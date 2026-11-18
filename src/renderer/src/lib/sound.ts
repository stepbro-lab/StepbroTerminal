import notificationUrl from '@/assets/StepbroNoti.mp3'
import { usePrefs } from '@/stores/prefs'

let clip: HTMLAudioElement | null = null

export function playNotificationSound(volume = usePrefs.getState().prefs?.soundVolume ?? 80): void {
  if (!clip) {
    clip = new Audio(notificationUrl)
    clip.preload = 'auto'
  }
  clip.volume = Math.min(100, Math.max(0, volume)) / 100
  clip.currentTime = 0
  void clip.play().catch(() => {})
}
