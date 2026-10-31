import { useId } from 'react'
import type { Build2StageView, Build2Summary } from '@shared/types/build2'
import type { GameLang } from '@shared/types/settings'
import { useT } from '../../i18n'
import { BIco } from '../build/ui'

// Предпросмотр этапов (S66): что окажется в файле `.build` — по уровням: ноды, новые ключевые ноды, умения,
// подсказки к экипировке; ниже — что в файл не попадёт и почему (мета-камни, умения предметов, другая версия дерева).
// Подпись этапа — на языке интерфейса по виду этапа («Акт 2», «Интерлюдии», «Карты»), название автора из PoB — рядом
// в экспертном режиме. Имена камней и нод — на языке клиента из данных игры; RU-перевода нет — английское с пометкой EN.

type T = ReturnType<typeof useT>

/** Подпись этапа на языке интерфейса (общие слова словарей кампании и вкладки «Билд» PoE 1). */
export function stageLabel(s: Build2StageView, t: T): string {
  switch (s.kind) {
    case 'act':
      if (s.act) return s.act[1] > s.act[0] ? t('bd.stage.acts', { a: s.act[0], b: s.act[1] }) : t('act.short', { n: s.act[0] })
      return t('bd.stage.levels', { a: s.from, b: s.to })
    case 'interlude':
      return t('int.group')
    case 'maps':
      return t('bd.stage.maps')
    case 'endgame':
      return t('bd.stage.endgame')
    case 'level':
      return t('bd.stage.levels', { a: s.from, b: s.to })
    default:
      return t('build2.stages.all')
  }
}

/** Имя из данных игры на языке клиента; RU-перевода нет — английское с пометкой EN. */
export function GameName({ x, gameLang }: { x: { en: string; ru: string }; gameLang: GameLang }) {
  const t = useT()
  if (gameLang !== 'ru' || x.ru) return <>{gameLang === 'ru' ? x.ru : x.en}</>
  return (
    <>
      {x.en}
      <abbr className="b2-en" title={t('build2.en.tip')}>
        {t('build2.en')}
      </abbr>
    </>
  )
}

export function StagesPreview({ build, gameLang, expert }: { build: Build2Summary; gameLang: GameLang; expert: boolean }) {
  const t = useT()
  const id = useId()
  const r = build.report
  const skipped = [
    r.metaGems.length ? t('build2.report.meta', { names: r.metaGems.join(', ') }) : '',
    r.skippedGroups ? t('build2.report.groups', { n: r.skippedGroups }) : '',
    r.unknownNodes ? t('build2.report.nodes', { n: r.unknownNodes }) : '',
    r.unknownGems.length ? t('build2.report.gems', { names: r.unknownGems.join(', ') }) : ''
  ].filter(Boolean)
  return (
    <section className="ui-box b2-box" aria-labelledby={`${id}-t`}>
      <h2 className="b2-h" id={`${id}-t`}>
        <BIco name="step" />
        {t('build2.stages.title')}
      </h2>
      {build.primary === 'none' && <p className="b2-lead">{t('build2.stages.none')}</p>}
      <ol className="b2-stages">
        {build.stages.map((s, i) => (
          <li key={i} className="b2-stage">
            <div className="b2-stage__head">
              <b>{stageLabel(s, t)}</b>
              {expert && s.title && <span className="b2-muted" title={t('build2.stages.author')}>«{s.title}»</span>}
              <span className="ui-tag">{t('build2.stages.lv', { from: s.from, to: s.to })}</span>
              <span className="b2-muted">
                {t('build2.stages.points', { n: s.points })}
                {i > 0 && s.added > 0 && ` · ${t('build2.stages.added', { n: s.added })}`}
              </span>
            </div>
            {s.skills.length > 0 && (
              <div className="b2-stage__gems">
                {s.skills.map((g) => (
                  <span key={g.en} className={`ui-chip b2-gem${g.main ? ' is-main' : ''}`} title={expert ? t('build2.stages.sup', { n: g.supports }) : undefined}>
                    <BIco name="gem" size="sm" />
                    <GameName x={g} gameLang={gameLang} />
                    {g.main && <span className="ui-tag ui-tag--good">{t('build2.stages.main')}</span>}
                  </span>
                ))}
              </div>
            )}
            {s.key.length > 0 && (
              <div className="b2-muted b2-stage__key">
                <span>{t('build2.stages.key')}:</span>{' '}
                {s.key.map((k, j) => (
                  <span key={k.en} className="b2-node">
                    <GameName x={k} gameLang={gameLang} />
                    {j < s.key.length - 1 && ', '}
                  </span>
                ))}
              </div>
            )}
            {expert && s.items > 0 && <div className="b2-muted">{t('build2.stages.items', { n: s.items })}</div>}
          </li>
        ))}
      </ol>
      {skipped.length > 0 && (
        <div className="ui-hint b2-hint">
          <BIco name="info" />
          <span>
            {t('build2.report.lead')}: {skipped.join('; ')}.
          </span>
        </div>
      )}
    </section>
  )
}
