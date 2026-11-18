import { usePrefs } from '@/stores/prefs'
import { TopitoCanvas } from '../topito/TopitoCanvas'
import { useTopitoElsewhere } from '../topito/Topito'
import { Toggle } from './controls'
import { t } from '@/lib/i18n'

export function TopitoCard() {
  useTopitoElsewhere()
  const on = usePrefs((s) => s.prefs?.topito === true)
  const set = usePrefs((s) => s.set)
  return (
    <section className="topito-card mb-8">
      <div className="topito-card-art">
        <TopitoCanvas key={on ? 'on' : 'off'} clip={on ? 'hello' : 'sleep'} cell={4} rows={15} />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">Topito</h3>
        <p className="mt-1 max-w-[440px] text-[12.5px] leading-[1.5] text-muted">
          {t('Your sidekick at the foot of the sidebar: he does whatever your agents are doing, pops out at the corner of the terminal when one needs you, and answers when you click him.')}
        </p>
        <p className="mt-1.5 text-[12px] text-secondary">
          {on ? t('Out at the foot of the sidebar. Click him there to ask what is going on.') : t('Asleep. Turn him on and he moves in at the foot of the sidebar.')}
        </p>
      </div>
      <Toggle value={on} label={t('Show Topito')} onChange={(topito) => void set({ topito })} />
    </section>
  )
}
