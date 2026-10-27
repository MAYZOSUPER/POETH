import { useEffect, useState } from 'react'
import type { Deal, DealLang, DealsConfig, ReplyKind } from '@shared/types'
import { CARD_ACTIONS, REPLY_KINDS, chatCommand, type DealAction } from '@shared/deals/commands'
import { DEFAULT_TEMPLATES } from '@shared/deals/history'
import { useLang, useT } from '../../i18n'
import { useDealsStore } from '../../store/useDealsStore'
import { Box, Hint, Ico, Rich, Seg, useSimple, type IcoName } from './common'

// «Ответы»: шаблоны быстрых ответов RU/EN («спасибо», «продано», «ещё актуально?», «подожди
// минуту»), язык ответов и справка по кнопкам карточки (одна кнопка — одна команда в чат).

const ACTION_ICONS: Record<DealAction, IcoName> = {
  invite: 'invite',
  trade: 'trade',
  kick: 'kick',
  whois: 'search',
  hideout: 'home',
  thanks: 'heart',
  sold: 'sold',
  still: 'ask',
  wait: 'pause'
}

export function RepliesPage() {
  const t = useT()
  const uiLang = useLang()
  const simple = useSimple()
  const config = useDealsStore((s) => s.state?.config)
  const setConfig = useDealsStore((s) => s.setConfig)
  const [editLang, setEditLang] = useState<DealLang>(uiLang)
  if (!config) return null

  const sample = (lang: DealLang): Deal => ({
    id: 'sample',
    dir: 'in',
    player: t('deals.replies.sample.player'),
    item: t('deals.replies.sample.item'),
    price: '2 divine',
    league: 'Settlers',
    bulk: false,
    lang,
    ts: 0,
    status: 'new'
  })

  return (
    <div className="dl-two">
      <div className="dl-stack">
        <Box title={t('deals.replies.title')} icon="chat">
          <label className="dl-field">
            <span className="ui-field__label">{t('deals.replies.lang')}</span>
            <Seg
              value={config.replyLang}
              onChange={(v) => void setConfig({ replyLang: v })}
              options={[
                { value: 'auto', label: t('deals.replies.auto') },
                { value: 'ru', label: 'Русский' },
                { value: 'en', label: 'English' }
              ]}
            />
          </label>
          <label className="dl-field">
            <span className="ui-field__label">{t('deals.replies.editLang')}</span>
            <Seg
              value={editLang}
              onChange={setEditLang}
              options={[
                { value: 'ru', label: 'RU' },
                { value: 'en', label: 'EN' }
              ]}
            />
          </label>
          {REPLY_KINDS.map((k) => (
            <TemplateField
              key={`${editLang}-${k}`}
              kind={k}
              lang={editLang}
              config={config}
              sample={sample(editLang)}
              onSave={(v) => void setConfig({ templates: { [editLang]: { [k]: v } } })}
            />
          ))}
          <span className="ui-field__help">
            <Rich text={t('deals.replies.vars')} />
          </span>
          <div className="dl-row">
            <button
              type="button"
              className="ui-btn ui-btn--sm ui-btn--ghost"
              onClick={() => void setConfig({ templates: { [editLang]: { ...DEFAULT_TEMPLATES[editLang] } } })}
            >
              <Ico name="refresh" />
              {t('deals.replies.reset')}
            </button>
          </div>
        </Box>
      </div>
      <div className="dl-stack">
        <Box title={t('deals.commands.title')} icon="trade">
          {simple && <Hint text={t('deals.commands.help')} />}
          {(['in', 'out'] as const).map((dir) => (
            <div key={dir} className="dl-cmds">
              <span className="ui-label">{t(`deals.cmd.${dir}`)}</span>
              {CARD_ACTIONS[dir].map((a) => (
                <div key={a} className="dl-cmd">
                  <span className="dl-cmd__name">
                    <Ico name={ACTION_ICONS[a]} />
                    {t(`deals.cmd.${a}`)}
                  </span>
                  <code className="dl-cmd__text">{chatCommand(a, { ...sample(uiLang), dir }, config)}</code>
                </div>
              ))}
            </div>
          ))}
        </Box>
      </div>
    </div>
  )
}

function TemplateField({
  kind,
  lang,
  config,
  sample,
  onSave
}: {
  kind: ReplyKind
  lang: DealLang
  config: DealsConfig
  sample: Deal
  onSave: (v: string) => void
}) {
  const t = useT()
  const saved = config.templates[lang][kind]
  const [value, setValue] = useState(saved)
  useEffect(() => setValue(saved), [saved])
  const preview = chatCommand(kind, sample, {
    ...config,
    replyLang: lang,
    templates: { ...config.templates, [lang]: { ...config.templates[lang], [kind]: value } }
  })
  const commit = (): void => {
    if (value !== saved) onSave(value)
  }
  return (
    <div className="ui-field">
      <span className="ui-field__label">
        {t(`deals.reply.${kind}`)} <span className="dl-faint">· {t(`deals.reply.${kind}.help`)}</span>
      </span>
      <input
        className="ui-input ui-input--lg"
        value={value}
        maxLength={200}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
        }}
      />
      <span className="ui-field__help">
        {t('deals.replies.preview')} <code className="dl-code">{preview}</code>
      </span>
    </div>
  )
}
