import notificationUrl from '@/assets/StepbroNoti.mp3'

let clip: HTMLAudioElement | null = null

/** The notification sound. Restarts from the top if it is still playing. */
export function playNotificationSound(): void {
  if (!clip) {
    clip = new Audio(notificationUrl)
    clip.preload = 'auto'
  }
  clip.currentTime = 0
  void clip.play().catch(() => {
    /* audio can be refused before the first user gesture; nothing to do */
  })
}
