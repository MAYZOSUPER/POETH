import { useId } from 'react'
import type { Build2Summary } from '@shared/types/build2'
import type { GameLang } from '@shared/types/settings'
import { useT } from '../../i18n'
import { BIco } from '../build/ui'

// Предпросмотр этапов (S66): что окажется в файле `.build` — по уровням: ноды, новые ключевые ноды, умения,
// подсказки к экипировке; ниже — что в файл не попадёт и почему (мета-камни, умения предметов, другая версия дерева).

export function StagesPreview({ build, gameLang, expert }: { build: Build2Summary; gameLang: GameLang; expert: boolean }) {
  const t = useT()
  const id = useId()
  const name = (x: { en: string; ru: string }): string => (gameLang === 'ru' && x.ru ? x.ru : x.en)
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
              <b>{s.title || t('build2.stages.all')}</b>
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
                    {name(g)}
                    {g.main && <span className="ui-tag ui-tag--good">{t('build2.stages.main')}</span>}
                  </span>
                ))}
              </div>
            )}
            {s.key.length > 0 && (
              <div className="b2-muted b2-stage__key">
                <span>{t('build2.stages.key')}:</span> {s.key.map((k) => name(k)).join(', ')}
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
