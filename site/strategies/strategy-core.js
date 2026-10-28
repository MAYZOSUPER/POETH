// Сгенерировано tools/advisor/build-site.mjs из src/shared/advisor (тот же код, что в приложении). Не править руками.
var POETHStrategy = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/shared/advisor/site.ts
  var site_exports = {};
  __export(site_exports, {
    CODE_PREFIX: () => CODE_PREFIX,
    decode: () => decode,
    estimate: () => estimate,
    extractCode: () => extractCode,
    fingerprint: () => strategyFingerprint,
    foreignLang: () => foreignLang,
    isOutdated: () => isOutdated,
    perHour: () => perHour,
    tx: () => tx,
    validateStrategy: () => validateStrategy
  });

  // src/shared/wealth/prices.ts
  function buildPriceIndex(sources) {
    const map = /* @__PURE__ */ new Map();
    let size = 0;
    for (const entries of sources) {
      const seen = /* @__PURE__ */ new Set();
      for (const e of entries) {
        if (!(e.chaos > 0) || !e.name) continue;
        const key = `${e.kind}\0${e.name}`;
        const list = map.get(key);
        if (list && !seen.has(key)) continue;
        seen.add(key);
        if (list) list.push(e);
        else map.set(key, [e]);
        size++;
      }
    }
    return {
      get: (kind, name) => map.get(`${kind}\0${name}`) ?? [],
      size
    };
  }

  // src/shared/types/advisor.ts
  var ADVISOR_SCHEMA = 1;

  // src/shared/advisor/validate.ts
  var STRATEGY_ID = /^[a-z0-9][a-z0-9-]{0,47}$/;
  var DATE = /^\d{4}-\d{2}(-\d{2})?$/;
  var DAY = /^\d{4}-\d{2}-\d{2}$/;
  var PATCH = /^\d{1,2}\.\d{1,2}(\.\d{1,2})?$/;
  var REF = /^[\p{L}\p{N}][\p{L}\p{N}' ,.:\-()]*$/u;
  var KINDS = ["stackable", "card", "map", "unique", "gem"];
  var SOURCES = ["official", "community", "imported", "mine", "wealthy"];
  var WEALTHY_HOSTS = ["wealthyexile.com", "www.wealthyexile.com"];
  var LIMITS = {
    name: 60,
    summary: 200,
    why: 600,
    step: 300,
    atlas: 200,
    warning: 300,
    note: 120,
    label: 60,
    buildNote: 200,
    sourceNote: 300,
    author: 40,
    url: 300,
    league: 40,
    ref: 100,
    inputs: 12,
    outputs: 20,
    steps: 12,
    atlasItems: 8,
    warnings: 6,
    tags: 8,
    terms: 12,
    maxQty: 1e4
  };
  var UNSAFE = /<\s*[a-z!/?]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/i;
  var Bad = class extends Error {
  };
  var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  function obj(v, what, allowed) {
    if (!isObj(v)) throw new Bad(`${what}: не объект`);
    const extra = Object.keys(v).filter((k) => !allowed.includes(k));
    if (extra.length) throw new Bad(`${what}: неизвестные поля ${extra.join(", ")}`);
    return v;
  }
  function plain(v, what, max) {
    if (typeof v !== "string") throw new Bad(`${what}: не текст`);
    const s = v.trim();
    if (!s) throw new Bad(`${what}: пусто`);
    if (s.length > max) throw new Bad(`${what}: длиннее ${max}`);
    if (UNSAFE.test(s)) throw new Bad(`${what}: HTML или служебные символы`);
    return s;
  }
  function text(v, what, max) {
    const o = obj(v, what, ["ru", "en"]);
    const out = {};
    if (o.ru !== void 0) out.ru = plain(o.ru, `${what}.ru`, max);
    if (o.en !== void 0) out.en = plain(o.en, `${what}.en`, max);
    if (!out.ru && !out.en) throw new Bad(`${what}: нужен текст хотя бы на одном языке`);
    return out;
  }
  var optText = (v, what, max) => v === void 0 ? void 0 : text(v, what, max);
  function texts(v, what, max, maxItems, min = 0) {
    if (v === void 0 && min === 0) return [];
    if (!Array.isArray(v) || v.length < min || v.length > maxItems) throw new Bad(`${what}: от ${min} до ${maxItems}`);
    return v.map((x, i) => text(x, `${what}[${i}]`, max));
  }
  function level(v, what) {
    if (v !== 1 && v !== 2 && v !== 3) throw new Bad(`${what}: 1, 2 или 3`);
    return v;
  }
  function num(v, what, min, max, int = false) {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max || int && !Number.isInteger(v)) {
      throw new Bad(`${what}: число ${min}…${max}`);
    }
    return v;
  }
  var optInt = (v, what, min, max) => v === void 0 ? void 0 : num(v, what, min, max, true);
  function date(v, what, re = DATE) {
    if (typeof v !== "string" || !re.test(v)) throw new Bad(`${what}: дата`);
    return v;
  }
  function patch(v, what) {
    if (typeof v !== "string" || !PATCH.test(v)) throw new Bad(`${what}: версия игры вида 3.29`);
    return v;
  }
  function keys(v, what, max) {
    if (v === void 0) return [];
    if (!Array.isArray(v) || v.length > max) throw new Bad(`${what}: до ${max}`);
    return v.map((k, i) => {
      if (typeof k !== "string" || !STRATEGY_ID.test(k)) throw new Bad(`${what}[${i}]`);
      return k;
    });
  }
  function item(v, what) {
    const o = obj(v, what, ["kind", "ref", "tier", "level", "quality", "label"]);
    const kind = o.kind ?? "stackable";
    if (!KINDS.includes(kind)) throw new Bad(`${what}.kind`);
    const out = { kind };
    if (o.ref !== void 0) {
      const ref = plain(o.ref, `${what}.ref`, LIMITS.ref);
      if (!REF.test(ref)) throw new Bad(`${what}.ref: английское имя предмета`);
      out.ref = ref;
    }
    const label = optText(o.label, `${what}.label`, LIMITS.label);
    if (label) out.label = label;
    if (!out.ref && !out.label) throw new Bad(`${what}: нужно ref или label`);
    const tier = optInt(o.tier, `${what}.tier`, 1, 17);
    if (tier !== void 0) out.tier = tier;
    const lvl = optInt(o.level, `${what}.level`, 1, 21);
    if (lvl !== void 0) out.level = lvl;
    const q = optInt(o.quality, `${what}.quality`, 0, 23);
    if (q !== void 0) out.quality = q;
    return out;
  }
  function lines(v, what, min, max) {
    if (!Array.isArray(v) || v.length < min || v.length > max) throw new Bad(`${what}: от ${min} до ${max}`);
    return v.map((x, i) => {
      const w = `${what}[${i}]`;
      const o = obj(x, w, ["item", "qty", "own", "note"]);
      const line = { item: item(o.item, `${w}.item`), qty: num(o.qty, `${w}.qty`, Number.MIN_VALUE, LIMITS.maxQty) };
      if (o.own !== void 0 && typeof o.own !== "boolean") throw new Bad(`${w}.own`);
      if (o.own === true) line.own = true;
      const note = optText(o.note, `${w}.note`, LIMITS.note);
      if (note) line.note = note;
      return line;
    });
  }
  function build(v) {
    const o = obj(v, "build", ["damage", "survival", "speed", "note"]);
    const out = {
      damage: level(o.damage, "build.damage"),
      survival: level(o.survival, "build.survival"),
      speed: level(o.speed, "build.speed")
    };
    const note = optText(o.note, "build.note", LIMITS.buildNote);
    if (note) out.note = note;
    return out;
  }
  function httpsUrl(v, what) {
    const s = plain(v, what, LIMITS.url);
    let u;
    try {
      u = new URL(s);
    } catch {
      throw new Bad(`${what}: не ссылка`);
    }
    if (u.protocol !== "https:" || u.username || u.password) throw new Bad(`${what}: только https`);
    return u;
  }
  function sourceUrl(v, kind) {
    const u = httpsUrl(v, "source.url");
    if (kind === "wealthy" && !WEALTHY_HOSTS.includes(u.hostname)) throw new Bad("source.url: не wealthyexile.com");
    return u.toString();
  }
  function source(v) {
    const o = obj(v, "source", ["kind", "author", "url", "date", "note"]);
    if (!SOURCES.includes(o.kind)) throw new Bad("source.kind");
    const kind = o.kind;
    const out = { kind, date: date(o.date, "source.date") };
    if (o.author !== void 0) out.author = plain(o.author, "source.author", LIMITS.author);
    if (o.url !== void 0) out.url = sourceUrl(o.url, kind);
    if (kind === "wealthy" && (!out.url || !out.author)) throw new Bad("source: у wealthy нужны автор и ссылка (атрибуция)");
    const note = optText(o.note, "source.note", LIMITS.sourceNote);
    if (note) out.note = note;
    return out;
  }
  function measured(v) {
    const o = obj(v, "measured", ["maps", "hours", "perHour", "date", "patch", "league"]);
    const out = {
      maps: num(o.maps, "measured.maps", 1, 1e5, true),
      hours: num(o.hours, "measured.hours", 0.01, 1e4),
      perHour: num(o.perHour, "measured.perHour", -1e6, 1e7),
      date: date(o.date, "measured.date", DAY)
    };
    if (o.patch !== void 0) out.patch = patch(o.patch, "measured.patch");
    if (o.league !== void 0) out.league = plain(o.league, "measured.league", LIMITS.league);
    return out;
  }
  var FIELDS = [
    "id",
    "name",
    "summary",
    "why",
    "difficulty",
    "build",
    "tags",
    "terms",
    "minutesPerMap",
    "inputs",
    "outputs",
    "source",
    "measured",
    "atlas",
    "atlasTree",
    "steps",
    "warnings",
    "draft",
    "patch",
    "league"
  ];
  function validateStrategy(raw, defaults = {}) {
    try {
      const o = obj(raw, "стратегия", FIELDS);
      if (typeof o.id !== "string" || !STRATEGY_ID.test(o.id)) throw new Bad("id");
      const minutes = o.minutesPerMap ?? defaults.minutesPerMap;
      const s = {
        id: o.id,
        name: text(o.name, "name", LIMITS.name),
        summary: text(o.summary, "summary", LIMITS.summary),
        why: text(o.why, "why", LIMITS.why),
        difficulty: level(o.difficulty, "difficulty"),
        build: build(o.build),
        tags: keys(o.tags, "tags", LIMITS.tags),
        terms: keys(o.terms, "terms", LIMITS.terms),
        minutesPerMap: num(minutes, "minutesPerMap", 0.5, 120),
        inputs: lines(o.inputs, "inputs", 0, LIMITS.inputs),
        outputs: lines(o.outputs, "outputs", 1, LIMITS.outputs),
        source: source(o.source),
        atlas: texts(o.atlas, "atlas", LIMITS.atlas, LIMITS.atlasItems),
        steps: texts(o.steps, "steps", LIMITS.step, LIMITS.steps, 1),
        warnings: texts(o.warnings, "warnings", LIMITS.warning, LIMITS.warnings),
        draft: false,
        patch: patch(o.patch ?? defaults.patch, "patch")
      };
      const draft = o.draft ?? defaults.draft ?? false;
      if (typeof draft !== "boolean") throw new Bad("draft");
      s.draft = draft;
      if (o.measured !== void 0) s.measured = measured(o.measured);
      if (o.atlasTree !== void 0) s.atlasTree = httpsUrl(o.atlasTree, "atlasTree").toString();
      if (o.league !== void 0) s.league = plain(o.league, "league", LIMITS.league);
      return { ok: true, strategy: s };
    } catch (e) {
      return { ok: false, error: e instanceof Bad ? e.message : "ошибка" };
    }
  }

  // src/shared/advisor/codec.ts
  var CODE_VERSION = 1;
  var CODE_PREFIX = `POETH${CODE_VERSION}:`;
  var MAX_CODE_CHARS = 32e3;
  var MAX_JSON_BYTES = 64 * 1024;
  var CodeTooLargeError = class extends Error {
    constructor() {
      super("too large");
    }
  };
  var CODE_RE = /^POETH(\d{1,3}):([A-Za-z0-9_-]*)$/;
  var B64URL = /^[A-Za-z0-9_-]*$/;
  function extractCode(input) {
    let s = String(input ?? "").trim();
    if (!s) return null;
    const at = s.search(/POETH\d{1,3}(:|%3A)/i);
    if (at < 0) return null;
    s = s.slice(at);
    if (/%[0-9A-F]{2}/i.test(s)) {
      try {
        s = decodeURIComponent(s);
      } catch {
      }
    }
    s = s.replace(/\s+/g, "");
    const m = /^(POETH\d{1,3}:[A-Za-z0-9_-]*)/i.exec(s);
    return m ? m[1].replace(/^poeth/i, "POETH") : null;
  }
  function fromBase64Url(s) {
    if (!B64URL.test(s) || s.length % 4 === 1) return null;
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4);
    let bin;
    try {
      bin = atob(b64);
    } catch {
      return null;
    }
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  var isObj2 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  async function decodeStrategyCode(input, inflate) {
    if (!String(input ?? "").trim()) return { ok: false, error: "empty" };
    const code = extractCode(input);
    if (!code) return { ok: false, error: "notcode" };
    if (code.length > MAX_CODE_CHARS) return { ok: false, error: "toolarge" };
    const m = CODE_RE.exec(code);
    if (!m) return { ok: false, error: "notcode" };
    const version = Number(m[1]);
    if (version > CODE_VERSION) return { ok: false, error: "newer" };
    if (version !== CODE_VERSION) return { ok: false, error: "notcode" };
    const bytes = m[2] ? fromBase64Url(m[2]) : null;
    if (!bytes || !bytes.length) return { ok: false, error: "broken" };
    let raw;
    try {
      raw = await inflate(bytes, MAX_JSON_BYTES);
    } catch (e) {
      return { ok: false, error: e instanceof CodeTooLargeError ? "toolarge" : "broken" };
    }
    if (raw.length > MAX_JSON_BYTES) return { ok: false, error: "toolarge" };
    let payload;
    try {
      payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw));
    } catch {
      return { ok: false, error: "broken" };
    }
    if (!isObj2(payload) || typeof payload.schema !== "number") return { ok: false, error: "invalid", detail: "нет версии схемы" };
    if (payload.schema > ADVISOR_SCHEMA) return { ok: false, error: "newer" };
    if (payload.schema !== ADVISOR_SCHEMA) return { ok: false, error: "invalid", detail: "неизвестная версия схемы" };
    const extra = Object.keys(payload).filter((k) => k !== "schema" && k !== "strategy");
    if (extra.length) return { ok: false, error: "invalid", detail: `неизвестные поля ${extra.join(", ")}` };
    const res = validateStrategy(payload.strategy);
    if (!res.ok) return { ok: false, error: "invalid", detail: res.error };
    return { ok: true, strategy: res.strategy, code };
  }
  function strategyFingerprint(s) {
    const { kind: _kind, ...source2 } = s.source;
    const { draft: _draft, ...rest } = s;
    return JSON.stringify({ ...rest, source: source2 });
  }

  // src/shared/advisor/codecBrowser.ts
  async function readAll(stream, maxBytes) {
    const reader = stream.getReader();
    const parts = [];
    let total = 0;
    for (; ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => void 0);
        throw new CodeTooLargeError();
      }
      parts.push(value);
    }
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) {
      out.set(p, at);
      at += p.length;
    }
    return out;
  }
  function streamOf(bytes) {
    return new ReadableStream({
      start(c) {
        c.enqueue(bytes);
        c.close();
      }
    });
  }
  function inflateBrowser(bytes, maxBytes) {
    return readAll(streamOf(bytes).pipeThrough(new DecompressionStream("deflate")), maxBytes);
  }

  // src/shared/advisor/data.ts
  function tx(t, lang) {
    const own = lang === "ru" ? t.ru : t.en;
    return own ?? t.ru ?? t.en ?? "";
  }
  function strategyTexts(s) {
    const out = [s.name, s.summary, s.why, ...s.atlas, ...s.steps, ...s.warnings];
    if (s.build.note) out.push(s.build.note);
    if (s.source.note) out.push(s.source.note);
    for (const l of [...s.inputs, ...s.outputs]) {
      if (l.item.label) out.push(l.item.label);
      if (l.note) out.push(l.note);
    }
    return out;
  }
  function foreignLang(s, lang) {
    const ui = lang === "ru" ? "ru" : "en";
    const other = ui === "ru" ? "en" : "ru";
    return strategyTexts(s).some((t) => !t[ui]) ? other : null;
  }
  function isOutdated(s, currentPatch) {
    return !!currentPatch && s.patch !== currentPatch;
  }

  // src/shared/advisor/estimate.ts
  var LOW_SHARE = 0.5;
  var priceKind = (ref) => ref.kind === "card" ? "stackable" : ref.kind;
  function median(list) {
    const sorted = [...list].sort((a, b) => a.chaos - b.chaos);
    return sorted[Math.floor((sorted.length - 1) / 2)];
  }
  function candidates(ref, list) {
    switch (ref.kind) {
      case "map": {
        const tiered = ref.tier !== void 0 ? list.filter((e) => e.mapTier === ref.tier) : [];
        return tiered.length ? tiered : list.filter((e) => e.mapTier === void 0);
      }
      case "unique":
        return list.filter((e) => (e.links ?? 0) < 5);
      case "gem":
        return list.filter(
          (e) => !e.corrupted && (e.gemLevel ?? 1) === (ref.level ?? 1) && (e.gemQuality ?? 0) === (ref.quality ?? 0)
        );
      default:
        return list;
    }
  }
  function priceOf(ref, index) {
    if (!ref.ref) return null;
    const list = candidates(ref, index.get(priceKind(ref), ref.ref));
    if (!list.length) return null;
    const e = list.length === 1 ? list[0] : median(list);
    return { chaos: e.chaos, source: e.source, low: list.length > 1 || e.low === true };
  }
  function priceLine(line, index, input) {
    const p = priceOf(line.item, index);
    const out = { unit: p ? p.chaos : null, total: null };
    if (p) {
      out.source = p.source;
      if (p.low) out.low = true;
    }
    if (input && line.own) out.total = 0;
    else if (p) out.total = p.chaos * line.qty;
    return out;
  }
  var sum = (xs) => xs.reduce((a, b) => a + b, 0);
  function estimateStrategy(s, index) {
    const inputs = s.inputs.map((l) => priceLine(l, index, true));
    const outputs = s.outputs.map((l) => priceLine(l, index, false));
    const cost = inputs.some((l) => l.total === null) ? null : sum(inputs.map((l) => l.total));
    const pricedOut = outputs.filter((l) => l.total !== null);
    const income = pricedOut.length ? sum(pricedOut.map((l) => l.total)) : null;
    const incomePartial = income !== null && pricedOut.length < outputs.length;
    const profit = cost !== null && income !== null ? income - cost : null;
    const reasons = [];
    const counted = [...inputs, ...outputs].filter((l) => l.total !== null && l.total > 0);
    const value = sum(counted.map((l) => l.total));
    const lowValue = sum(counted.filter((l) => l.low).map((l) => l.total));
    if (lowValue > 0) reasons.push("low");
    if (incomePartial) reasons.push("partial");
    if (profit === null) reasons.push("noPrice");
    if (s.draft) reasons.push("draft");
    let confidence = 3;
    if (profit === null || value > 0 && lowValue / value > LOW_SHARE) confidence = 1;
    else if (lowValue > 0 || incomePartial || s.draft) confidence = 2;
    return { inputs, outputs, cost, income, incomePartial, profit, confidence, reasons };
  }

  // src/shared/advisor/time.ts
  function perHour(profitPerMap, minutes) {
    if (profitPerMap === null || !minutes || !(minutes > 0) || !Number.isFinite(minutes)) return null;
    return profitPerMap * 60 / minutes;
  }

  // src/shared/advisor/site.ts
  function decode(input) {
    return decodeStrategyCode(input, inflateBrowser);
  }
  function estimate(s, prices) {
    return prices && prices.length ? estimateStrategy(s, buildPriceIndex([prices])) : null;
  }
  return __toCommonJS(site_exports);
})();
