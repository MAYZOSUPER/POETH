import { Fragment, useEffect, type ReactNode } from 'react'
import type { BlacklistHit, Deal, UiLang } from '@shared/types'
import { blacklistReasonKey } from '@shared/deals/blacklist'
import { translate } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'

// Общие куски вкладки «Сделки» по макету «Золото компаса»: иконки из спрайта, переключатель,
// сегменты, карточка-блок, текст с <b>, форматирование, звук входящей сделки.

// ---------------------------------------------------------------- иконки

let spriteLoad: Promise<void> | null = null

/** Спрайт resources/brand/icons-sprite.svg (poeth://brand/) — один раз в документ (как во вкладке Regex). */
function ensureSprite(): Promise<void> {
  if (!spriteLoad) {
    spriteLoad = fetch('poeth://brand/icons-sprite.svg')
      .then((r) => (r.ok ? r.text() : ''))
      .then((svg) => {
        if (!svg || document.getElementById('i-check')) return
        const holder = document.createElement('div')
        holder.setAttribute('aria-hidden', 'true')
        holder.style.display = 'none'
        holder.innerHTML = svg
        document.body.prepend(holder)
      })
      .catch(() => undefined)
  }
  return spriteLoad
}

export type IcoName =
  | 'chat'
  | 'invite'
  | 'trade'
  | 'kick'
  | 'heart'
  | 'sold'
  | 'ask'
  | 'home'
  | 'grid'
  | 'help'
  | 'warn'
  | 'copy'
  | 'refresh'
  | 'search'
  | 'export'
  | 'trash'
  | 'history'
  | 'volume'
  | 'shield'
  | 'close'
  | 'check'
  | 'info'
  | 'pause'
  | 'folder'
  | 'edit'
  | 'layers'

export function Ico({ name, size }: { name: IcoName; size?: 'sm' | 'lg' }) {
  useEffect(() => {
    void ensureSprite()
  }, [])
  return (
    <svg className={`ui-ico${size ? ` ui-ico--${size}` : ''}`} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  )
}

// ---------------------------------------------------------------- контролы

/** Простой режим (по умолчанию): подсказки новичку, кнопки с подписями. */
export function useSimple(): boolean {
  return useAppStore((s) => s.settings?.ui.simpleMode ?? true)
}

export function Switch({
  on,
  onChange,
  children,
  disabled
}: {
  on: boolean
  onChange: (v: boolean) => void
  children: ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      className="ui-switch"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
    >
      <span className="ui-switch__track" />
      {children}
    </button>
  )
}

export function Seg<T extends string | number>({
  value,
  options,
  onChange,
  label
}: {
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (v: T) => void
  label?: string
}) {
  return (
    <div className="ui-seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Карточка с подписью раздела («box» макета). */
export function Box({ title, icon, aside, children }: { title: string; icon?: IcoName; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="dl-box">
      <div className="dl-box__h">
        {icon && <Ico name={icon} />}
        <span className="ui-label">{title}</span>
        <span className="ui-label__grow" />
        {aside}
      </div>
      <div className="dl-box__b">{children}</div>
    </section>
  )
}

/** Текст перевода с <b>…</b> → элементы React (без innerHTML). */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/<b>(.*?)<\/b>/g)
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>))}
    </>
  )
}

export function Hint({ text }: { text: string }) {
  return (
    <div className="ui-hint dl-hint">
      <Ico name="info" />
      <span>
        <Rich text={text} />
      </span>
    </div>
  )
}

// ---------------------------------------------------------------- форматирование

const pad = (n: number): string => String(n).padStart(2, '0')

/** «21:40» сегодня, иначе «28.10 21:40». */
export function formatTime(ts: number, now = Date.now()): string {
  const d = new Date(ts)
  const n = new Date(now)
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
  return sameDay ? hm : `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${hm}`
}

export function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Значок монеты по названию валюты (своя графика из дизайн-системы). */
export function coinClass(currency: string | undefined): string {
  const c = (currency ?? '').toLowerCase()
  if (/div|боже/.test(c)) return 'ui-coin ui-coin--div'
  if (/exa|возвыш/.test(c)) return 'ui-coin ui-coin--ex'
  if (/chaos|хаос/.test(c)) return 'ui-coin ui-coin--chaos'
  return 'ui-coin'
}

/** Тег статуса: класс ui-tag и текст. Чёрный список важнее статуса. */
export function statusTag(d: Deal, lang: UiLang): { cls: string; text: string } {
  const t = (k: string): string => translate(lang, k)
  if (d.blacklist && d.status === 'new') return { cls: 'ui-tag--bad', text: t('deals.status.black') }
  switch (d.status) {
    case 'new':
      return { cls: 'ui-tag--warn', text: t('deals.status.new') }
    case 'invited':
      return { cls: 'ui-tag--person', text: t('deals.status.invited') }
    case 'traded':
      return { cls: 'ui-tag--good', text: t(d.dir === 'in' ? 'deals.status.traded.in' : 'deals.status.traded.out') }
    case 'sold':
      return { cls: 'ui-tag--good', text: t('deals.status.sold') }
    default:
      return { cls: '', text: t('deals.status.ignored') }
  }
}

/** Причина из списка PoE Hub на языке интерфейса (неизвестная — как в списке). */
export function reasonText(reason: string, lang: UiLang): string {
  const key = blacklistReasonKey(reason)
  return key ? translate(lang, `deals.bl.reason.${key}`) : reason
}

/** «⚠ в чёрном списке PoE Hub: <причина>» (или «возможно…» при совпадении по персонажу). */
export function blacklistWarning(hit: BlacklistHit, lang: UiLang): string {
  const reason = reasonText(hit.reason, lang)
  return hit.matchedBy === 'account'
    ? translate(lang, 'deals.bl.hit', { reason })
    : translate(lang, 'deals.bl.hitMaybe', { reason, account: hit.account })
}

// ---------------------------------------------------------------- звук

let audio: AudioContext | null = null
let lastChime = 0

/** Короткий двухтоновый сигнал (WebAudio, без файлов). Не чаще раза в 1.5 с. */
export function playChime(volume: number): void {
  const now = Date.now()
  if (now - lastChime < 1500 || volume <= 0) return
  lastChime = now
  try {
    audio ??= new AudioContext()
    const ctx = audio
    const t0 = ctx.currentTime
    for (const [i, freq] of [660, 990].entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = t0 + i * 0.12
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.25 * volume, start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35)
      osc.connect(gain).connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.4)
    }
  } catch {
    // нет аудиоустройства — молча
  }
}
