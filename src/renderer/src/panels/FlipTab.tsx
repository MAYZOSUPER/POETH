import { useEffect, useState } from "react";
import type { FlipFilters, FlipRoute, FlipState } from "@shared/types";
import { topFlips } from "@shared/flip/routes";
import { useT } from "../i18n";
import { useAppStore } from "../store/useAppStore";
import { useFlipStore } from "./flip/useFlipStore";
import { useNameOf } from "./wealth/names";
import { WIco } from "./wealth/ui";
import {
  baseKey,
  goldTotal,
  itemNs,
  KIND_LABEL,
  num,
  pct,
  pips,
} from "./flip/format";
import "./flip/flip.css";

// Вкладка «Обмен» (PoE1, S13): помощник по флиппингу валюты у Фаустуса по почасовому фиду обмена GGG. Курс
// divine:chaos с коридорами, до 5 флипов на 10 ордеров («купи X по ≤a, продай по ≥b, ~P c/ч, уверенность»), для
// новичка — как сделать флип у Фаустуса; в эксперте — все маршруты, фильтры и отсеянные. Только оценка по
// прошлым часам: ордера игрок выставляет сам. Макет дизайнера ещё в работе — пока по docs/design-system.md.

type T = ReturnType<typeof useT>;
type NameOf = (r: FlipRoute) => string;

function Pips({ value }: { value: number }) {
  const n = pips(value);
  return (
    <span className="ui-pips" title={`${Math.round(value * 100)}%`}>
      {[0, 1, 2].map((i) => (
        <i key={i} className={i < n ? "on" : undefined} />
      ))}
    </span>
  );
}

function Rate({ s, t, lang }: { s: FlipState; t: T; lang: string }) {
  const d = s.divine;
  if (!d) return null;
  return (
    <div className="fl-rate">
      <span className="ui-label">{t("flip.rate")}</span>
      <b className="fl-rate__value">
        <i className="ui-coin ui-coin--div" />1 div = {num(d.current, lang)} c
      </b>
      <span className="fl-rate__meta">
        {d.day &&
          t("flip.rate.day", {
            lo: num(d.day.lo, lang),
            hi: num(d.day.hi, lang),
          })}
        {d.week &&
          ` · ${t("flip.rate.week", { lo: num(d.week.lo, lang), hi: num(d.week.hi, lang) })}`}
      </span>
      {d.outside && (
        <span
          className="ui-tag ui-tag--warn"
          title={t("flip.rate.outside.title", { n: num(d.lastHour, lang) })}
        >
          {t(d.outside === "above" ? "flip.rate.above" : "flip.rate.below")}
        </span>
      )}
    </div>
  );
}

function Steps({
  r,
  t,
  lang,
  name,
}: {
  r: FlipRoute;
  t: T;
  lang: string;
  name: string;
}) {
  // в шагах — полные названия валют, как в окне Фаустуса
  const b1 = t(`flip.baseName.${r.buy.base}`);
  const b2 = t(`flip.baseName.${r.sell.base}`);
  return (
    <ol className="fl-steps">
      <li>{t("flip.how.1")}</li>
      <li>
        {t("flip.how.2", {
          item: name,
          base: b1,
          give: r.buy.order.give,
          get: r.buy.order.get,
          units: r.units,
        })}
      </li>
      <li>
        {t("flip.how.3", {
          item: name,
          item2: name,
          base: b2,
          give: r.sell.order.give,
          get: r.sell.order.get,
        })}
      </li>
      <li>{t("flip.how.4", { gold: num(goldTotal(r), lang) })}</li>
      <li>{t("flip.how.5")}</li>
    </ol>
  );
}

function FlipCard({
  r,
  t,
  lang,
  nameOf,
  expert,
}: {
  r: FlipRoute;
  t: T;
  lang: string;
  nameOf: NameOf;
  expert: boolean;
}) {
  const [open, setOpen] = useState(false);
  const name = nameOf(r);
  const b1 = t(baseKey(r.buy.base));
  const b2 = t(baseKey(r.sell.base));
  return (
    <li className="fl-card">
      <div className="fl-card__head">
        <span className="ui-item ui-item--currency fl-card__name">{name}</span>
        <span className="ui-tag" title={t(`flip.kind.${r.kind}`)}>
          {KIND_LABEL[r.kind]}
        </span>
        <span className="fl-grow" />
        <span className="fl-conf">
          {t("flip.confidence")} <Pips value={r.confidence} />
        </span>
      </div>
      <div className="fl-card__line">
        {t("flip.line", {
          buy: num(r.buy.price, lang),
          b1,
          sell: num(r.sell.price, lang),
          b2,
        })}
        <b className="fl-card__per">
          {t("flip.perHour", { n: num(r.perHour, lang) })}
        </b>
      </div>
      <div className="fl-card__meta">
        <span>
          {t("flip.order.buy", {
            give: r.buy.order.give,
            base: b1,
            get: r.buy.order.get,
          })}
        </span>
        <span>
          {t("flip.order.sell", {
            give: r.sell.order.give,
            get: r.sell.order.get,
            base: b2,
          })}
        </span>
        <span>{t("flip.size", { n: r.units })}</span>
        <span>
          {t("flip.profit", { n: num(r.profit, lang), roi: pct(r.roi, lang) })}
        </span>
        <span title={t("flip.gold.title")}>
          {t("flip.gold", {
            n: num(goldTotal(r), lang),
            k: num(r.per1000Gold, lang),
          })}
        </span>
        {expert && (
          <span>
            {t("flip.stats", {
              liq: num(r.liquidity, lang),
              act: r.activeHours,
              vol: pct(r.volatility, lang),
              trend: pct(r.trend, lang),
            })}
          </span>
        )}
      </div>
      {!expert && (
        <div>
          <button
            type="button"
            className="ui-btn ui-btn--sm ui-btn--ghost"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <WIco name="help" />
            {t(open ? "flip.how.hide" : "flip.how")}
          </button>
          {open && <Steps r={r} t={t} lang={lang} name={name} />}
        </div>
      )}
    </li>
  );
}

function RoutesTable({
  routes,
  t,
  lang,
  nameOf,
  showRejects,
}: {
  routes: FlipRoute[];
  t: T;
  lang: string;
  nameOf: NameOf;
  showRejects?: boolean;
}) {
  return (
    <div className="fl-scroll ui-scroll">
      <table className="ui-table fl-table">
        <thead>
          <tr>
            <th>{t("flip.col.item")}</th>
            <th>{t("flip.col.kind")}</th>
            <th className="is-num">{t("flip.col.buy")}</th>
            <th className="is-num">{t("flip.col.sell")}</th>
            <th className="is-num">{t("flip.col.profit")}</th>
            <th className="is-num">{t("flip.col.gold")}</th>
            <th className="is-num">{t("flip.col.perHour")}</th>
            <th className="is-num">
              {showRejects ? t("flip.col.rejects") : t("flip.col.conf")}
            </th>
          </tr>
        </thead>
        <tbody>
          {routes.map((r) => (
            <tr key={r.id}>
              <td>
                <span className="ui-item ui-item--currency">{nameOf(r)}</span>
              </td>
              <td>{KIND_LABEL[r.kind]}</td>
              <td className="is-num">
                {num(r.buy.price, lang)} {t(baseKey(r.buy.base))}
              </td>
              <td className="is-num">
                {num(r.sell.price, lang)} {t(baseKey(r.sell.base))}
              </td>
              <td className={`is-num ${r.profit > 0 ? "is-good" : "is-bad"}`}>
                {num(r.profit, lang)} c
              </td>
              <td className="is-num">{num(r.per1000Gold, lang)}</td>
              <td className="is-num">{num(r.perHour, lang)}</td>
              <td className="is-num">
                {showRejects ? (
                  r.rejects.map((x) => t(`flip.reject.${x}`)).join(", ")
                ) : (
                  <Pips value={r.confidence} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const FILTER_FIELDS: Array<{
  key: keyof FlipFilters;
  step: number;
  scale?: number;
}> = [
  { key: "budgetDiv", step: 1 },
  { key: "minLiquidityDiv", step: 0.5 },
  { key: "minActiveHours", step: 1 },
  { key: "minSpread", step: 1, scale: 100 },
  { key: "maxSpread", step: 1, scale: 100 },
  { key: "maxVolatility", step: 1, scale: 100 },
  { key: "maxTrend", step: 1, scale: 100 },
  { key: "depthMultiple", step: 1 },
];

function Filters({ s, t }: { s: FlipState; t: T }) {
  const setFilters = useFlipStore((st) => st.setFilters);
  return (
    <div className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <WIco name="gear" size="sm" />
          {t("flip.filters")}
        </span>
      </div>
      <div className="ui-box__body fl-filters">
        {FILTER_FIELDS.map((f) => {
          const v = s.filters[f.key];
          const shown = f.scale ? Math.round(v * f.scale * 10) / 10 : v;
          return (
            <label key={f.key} className="ui-field">
              <span className="ui-field__label">{t(`flip.f.${f.key}`)}</span>
              <input
                className="ui-input ui-input--num"
                type="number"
                step={f.step}
                min={0}
                defaultValue={shown}
                onBlur={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n))
                    void setFilters({ [f.key]: f.scale ? n / f.scale : n });
                }}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function FlipTab() {
  const t = useT();
  const lang = useAppStore((s) => s.settings?.uiLang ?? "ru");
  const expert = !useAppStore((s) => s.settings?.ui.simpleMode ?? true);
  const s = useFlipStore((st) => st.state);
  const busy = useFlipStore((st) => st.busy);
  const init = useFlipStore((st) => st.init);
  const refresh = useFlipStore((st) => st.refresh);
  const nameOfItem = useNameOf(lang);
  // карты Таро — в DIVINATION_CARD, но «колода» и прочее из той же папки — обычные предметы
  const nameOf: NameOf = (r) => {
    const ns = itemNs(r);
    const n = nameOfItem({ name: r.name, ns });
    return n === r.name && ns !== "ITEM"
      ? nameOfItem({ name: r.name, ns: "ITEM" })
      : n;
  };
  const [showRejected, setShowRejected] = useState(false);

  useEffect(() => init(), [init]);

  if (!s) return <div className="flip-tab" />;
  if (!s.supported) {
    return (
      <div className="flip-tab">
        <div className="ui-empty">{t("flip.unsupported")}</div>
      </div>
    );
  }
  const top = topFlips(s.routes);
  return (
    <div className="flip-tab ui-scroll">
      <div className="fl-pad">
        <div className="fl-top">
          <Rate s={s} t={t} lang={lang} />
          <span className="fl-grow" />
          <span className="fl-feed">
            {s.lastHour
              ? t("flip.feed", {
                  n: s.hours,
                  at: new Date(s.lastHour + 3_600_000).toLocaleTimeString(
                    lang === "ru" ? "ru-RU" : "en-US",
                    { hour: "2-digit", minute: "2-digit" },
                  ),
                })
              : t("flip.feed.none")}
          </span>
          <button
            type="button"
            className="ui-btn ui-btn--sm"
            disabled={busy || s.loading}
            onClick={() => void refresh()}
          >
            <WIco name="refresh" />
            {t("flip.refresh")}
          </button>
        </div>

        <div className="ui-banner ui-banner--info fl-banner" role="note">
          <WIco name="info" />
          <span>
            <b>{t("flip.disclaimer.title")}</b> {t("flip.disclaimer")}
          </span>
          <span />
        </div>
        {s.problem && (
          <div className="ui-banner ui-banner--bad fl-banner">
            {t("flip.problem")}
          </div>
        )}

        {!expert && (
          <div className="ui-hint" style={{ padding: 0 }}>
            <WIco name="help" />
            <span>{t("flip.hint")}</span>
          </div>
        )}

        <div className="ui-box">
          <div className="ui-box__head">
            <span className="ui-label">
              <WIco name="coins" size="sm" />
              {t("flip.top", { n: top.length })}
            </span>
            <span className="ui-label__grow" />
            <span className="fl-muted">{t("flip.top.note")}</span>
          </div>
          {top.length ? (
            <ul className="fl-cards">
              {top.map((r) => (
                <FlipCard
                  key={r.id}
                  r={r}
                  t={t}
                  lang={lang}
                  nameOf={nameOf}
                  expert={expert}
                />
              ))}
            </ul>
          ) : (
            <div className="ui-empty">
              {t(s.loading || !s.lastHour ? "flip.loading" : "flip.none")}
            </div>
          )}
        </div>

        {expert && s.routes.length > top.length && (
          <div className="ui-box">
            <div className="ui-box__head">
              <span className="ui-label">
                {t("flip.all", { n: s.routes.length })}
              </span>
            </div>
            <RoutesTable routes={s.routes} t={t} lang={lang} nameOf={nameOf} />
          </div>
        )}
        {expert && <Filters s={s} t={t} />}
        {expert && s.rejected.length > 0 && (
          <div className="ui-box">
            <div className="ui-box__head">
              <span className="ui-label">
                {t("flip.rejected", { n: s.rejected.length })}
              </span>
              <span className="ui-label__grow" />
              <button
                type="button"
                className="ui-btn ui-btn--sm ui-btn--ghost"
                aria-expanded={showRejected}
                onClick={() => setShowRejected(!showRejected)}
              >
                {t(showRejected ? "flip.hide" : "flip.show")}
              </button>
            </div>
            {showRejected && (
              <RoutesTable
                routes={s.rejected}
                t={t}
                lang={lang}
                nameOf={nameOf}
                showRejects
              />
            )}
          </div>
        )}
        <p className="fl-note">{t("flip.fees", { src: s.feesFrom ?? "—" })}</p>
      </div>
    </div>
  );
}
