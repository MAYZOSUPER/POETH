// Сгенерировано tools/starters/build-site.mjs из src/shared/starters (тот же код, что в приложении). Не править руками.
var POETHStarters = (() => {
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

  // src/shared/starters/site.ts
  var site_exports = {};
  __export(site_exports, {
    NO_FILTERS: () => NO_FILTERS,
    STARTERS_INDEX: () => STARTERS_INDEX,
    STARTER_BUDGETS: () => STARTER_BUDGETS,
    STARTER_CLASSES: () => STARTER_CLASSES,
    ascendanciesOf: () => ascendanciesOf,
    classesOf: () => classesOf,
    filterStarters: () => filterStarters,
    findStarter: () => findStarter,
    loadStarters: () => loadStarters,
    picksOf: () => picksOf,
    sortStarters: () => sortStarters,
    starterBadges: () => starterBadges,
    toCard: () => toCard
  });

  // src/shared/links.ts
  var AUTHOR_LINK_HOSTS = [
    "www.youtube.com",
    "youtube.com",
    "m.youtube.com",
    "youtu.be",
    "www.twitch.tv",
    "twitch.tv",
    "maxroll.gg",
    "mobalytics.gg",
    "www.poe-vault.com",
    "pobb.in",
    "pob.codes",
    "www.reddit.com",
    "boosty.to",
    "t.me",
    "www.pathofexile.com",
    "ru.pathofexile.com"
  ];
  function isAuthorLinkUrl(url) {
    if (typeof url !== "string" || url.length > 500) return false;
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port && AUTHOR_LINK_HOSTS.includes(parsed.hostname);
    } catch {
      return false;
    }
  }

  // src/shared/advisor/codec.ts
  var CODE_VERSION = 1;
  var CODE_PREFIX = `POETH${CODE_VERSION}:`;
  var MAX_JSON_BYTES = 64 * 1024;

  // src/shared/pob/decode.ts
  var POB_CODE_MAX_CHARS = 1024 * 1024;
  var POB_XML_MAX_BYTES = 16 * 1024 * 1024;
  var CODE_RE = /^[A-Za-z0-9+/_-]+={0,2}$/;
  function cleanPobCode(input) {
    const s = String(input ?? "").replace(/\s+/g, "");
    if (!s || !CODE_RE.test(s)) return null;
    return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // src/shared/pob/links.ts
  var ID = String.raw`[A-Za-z0-9_-]{4,40}`;
  var ALNUM = String.raw`[A-Za-z0-9]{4,40}`;
  var RULES = [
    {
      hosts: ["pobb.in"],
      path: new RegExp(`^/(?:pob/)?(?:u/(${ID})/)?(${ID})(?:/raw)?/?$`),
      build: (m) => {
        const id = m[1] ? `u/${m[1]}/${m[2]}` : m[2];
        return { site: "pobbin", id, rawUrl: `https://pobb.in/${id}/raw`, pageUrl: `https://pobb.in/${id}` };
      }
    },
    {
      hosts: ["pastebin.com"],
      path: new RegExp(`^/(?:raw/)?(${ALNUM})/?$`),
      build: (m) => ({ site: "pastebin", id: m[1], rawUrl: `https://pastebin.com/raw/${m[1]}`, pageUrl: `https://pastebin.com/${m[1]}` })
    },
    {
      hosts: ["pob.codes"],
      path: new RegExp(`^/b/(${ID})/?$`),
      build: (m) => ({ site: "pobcodes", id: m[1], rawUrl: `https://api.pob.codes/${m[1]}/raw`, pageUrl: `https://pob.codes/b/${m[1]}` })
    },
    {
      hosts: ["api.pob.codes"],
      path: new RegExp(`^/(${ID})/raw/?$`),
      build: (m) => ({ site: "pobcodes", id: m[1], rawUrl: `https://api.pob.codes/${m[1]}/raw`, pageUrl: `https://pob.codes/b/${m[1]}` })
    },
    {
      hosts: ["poedb.tw"],
      path: new RegExp(`^/(?:[a-z]{2}/)?pob/(${ID})(?:/raw)?/?$`),
      build: (m) => ({ site: "poedb", id: m[1], rawUrl: `https://poedb.tw/pob/${m[1]}/raw`, pageUrl: `https://poedb.tw/pob/${m[1]}` })
    },
    {
      hosts: ["maxroll.gg"],
      path: new RegExp(`^/poe/(?:api/)?pob/(${ID})/?$`),
      build: (m) => ({ site: "maxroll", id: m[1], rawUrl: `https://maxroll.gg/poe/api/pob/${m[1]}`, pageUrl: `https://maxroll.gg/poe/pob/${m[1]}` })
    },
    { hosts: ["maxroll.gg"], path: /^\/poe2\//, build: () => "poe2" },
    { hosts: ["maxroll.gg"], path: /^\/poe\/(?:planner|build-guides)\//, build: () => ({ copy: "maxroll-planner" }) },
    {
      hosts: ["rentry.co", "rentry.org"],
      path: new RegExp(`^/(?:paste/)?(${ID})(?:/raw)?/?$`),
      build: (m) => ({ site: "rentry", id: m[1], rawUrl: `https://rentry.co/paste/${m[1]}/raw`, pageUrl: `https://rentry.co/${m[1]}` })
    },
    { hosts: ["poe2db.tw"], path: /^\//, build: () => "poe2" },
    { hosts: ["poe.ninja"], path: /^\/poe2\//, build: () => "poe2" },
    { hosts: ["poe.ninja"], path: /^\//, build: () => ({ copy: "poeninja" }) },
    { hosts: ["mobalytics.gg"], path: /^\/poe-2\//, build: () => "poe2" },
    { hosts: ["mobalytics.gg"], path: /^\//, build: () => ({ copy: "mobalytics" }) }
  ];
  function findUrl(text2) {
    const m = /\bhttps?:\/\/[^\s"'<>]+/i.exec(text2);
    if (m) return m[0];
    const bare = /(?:^|\s)((?:www\.)?(?:pobb\.in|pastebin\.com|pob\.codes|api\.pob\.codes|poedb\.tw|poe2db\.tw|maxroll\.gg|rentry\.(?:co|org)|poe\.ninja|mobalytics\.gg)\/[^\s"'<>]*)/i.exec(text2);
    return bare ? `https://${bare[1]}` : null;
  }
  function parsePobLink(raw) {
    let u;
    try {
      u = new URL(raw.replace(/[).,;!?]+$/, ""));
    } catch {
      return null;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") return { kind: "unknown-link", host: "" };
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (u.username || u.password || u.port) return { kind: "unknown-link", host };
    for (const r of RULES) {
      if (!r.hosts.includes(host)) continue;
      const m = r.path.exec(u.pathname);
      if (!m) continue;
      const res = r.build(m);
      if (res === "poe2") return { kind: "poe2" };
      if ("copy" in res) return { kind: "copy-code", site: res.copy };
      return { kind: "link", ...res };
    }
    return { kind: "unknown-link", host };
  }
  function parsePobInput(text2) {
    const s = String(text2 ?? "").trim();
    if (!s) return { kind: "empty" };
    const code = cleanPobCode(s);
    if (code) return { kind: "code", code: s };
    const url = s.length <= 4096 ? findUrl(s) : null;
    if (url) return parsePobLink(url) ?? { kind: "not-pob" };
    return { kind: "not-pob" };
  }

  // src/shared/starters/schema.ts
  var STARTERS_SCHEMA = 1;
  var STARTERS_INDEX = "index.json";
  var STARTER_CLASSES = ["Scion", "Marauder", "Ranger", "Witch", "Duelist", "Templar", "Shadow"];
  var STARTER_BUDGETS = ["starter", "low", "medium", "high"];
  var STARTER_LEVELING = ["acts", "partial", "none"];
  var STARTER_MODES = ["sc", "hc", "ssf"];
  var STARTER_CONTENT = ["mapping", "bossing"];
  var STARTER_LANGS = ["ru", "en"];
  var STARTER_LINKS = ["pob", "guide", "video", "channel"];
  var STARTER_LIMITS = {
    /** файл списка лиги, байт */
    bytes: 256 * 1024,
    starters: 100,
    leagues: 10,
    id: 48,
    skill: 60,
    gem: 120,
    author: 40,
    ascendancy: 30,
    note: 140,
    url: 300
  };
  var STARTER_ID = /^[a-z0-9][a-z0-9-]{1,47}$/;
  var PATCH = /^\d{1,2}\.\d{1,2}$/;
  var DAY = /^\d{4}-\d{2}-\d{2}$/;
  var SHA256 = /^[0-9a-f]{64}$/;
  var SKILL = /^[\p{L}\p{N}][\p{L}\p{N}' ,.:\-()]*$/u;
  var GEM = /^Metadata\/Items\/Gems\/[A-Za-z0-9_]{1,100}$/;
  var ASCENDANCY = /^[A-Z][A-Za-z' -]{2,29}$/;
  var UNSAFE = /<\s*[a-z!/?]|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/i;
  var LINKY = /https?:|www\.|\b[a-z0-9-]+\.(?:com|ru|gg|in|tv|be|me|to|net|org|io)\b/i;
  var Bad = class extends Error {
  };
  var isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  function obj(v, what, allowed, dropped) {
    if (!isObj(v)) throw new Bad(`${what}: не объект`);
    for (const k of Object.keys(v)) if (!allowed.includes(k)) dropped.push(`${what}.${k}`);
    return v;
  }
  function plain(v, what, max) {
    if (typeof v !== "string") throw new Bad(`${what}: не текст`);
    const s = v.trim();
    if (!s) throw new Bad(`${what}: пусто`);
    if (s.length > max) throw new Bad(`${what}: длиннее ${max}`);
    if (UNSAFE.test(s)) throw new Bad(`${what}: HTML или служебные символы`);
    if (/[\r\n]/.test(s)) throw new Bad(`${what}: одна строка`);
    if (LINKY.test(s)) throw new Bad(`${what}: адрес в тексте — ссылки только в links`);
    return s;
  }
  function oneOf(v, what, list) {
    if (typeof v !== "string" || !list.includes(v)) throw new Bad(`${what}: одно из ${list.join(", ")}`);
    return v;
  }
  function setOf(v, what, list) {
    if (!Array.isArray(v) || v.length > list.length) throw new Bad(`${what}: список из ${list.join(", ")}`);
    const out = [];
    for (const [i, x] of v.entries()) {
      const k = oneOf(x, `${what}[${i}]`, list);
      if (out.includes(k)) throw new Bad(`${what}: «${k}» дважды`);
      out.push(k);
    }
    return list.filter((k) => out.includes(k));
  }
  function bool(v, what) {
    if (typeof v !== "boolean") throw new Bad(`${what}: true или false`);
    return v;
  }
  function day(v, what) {
    if (typeof v !== "string" || !DAY.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new Bad(`${what}: дата YYYY-MM-DD`);
    return v;
  }
  function patch(v, what) {
    if (typeof v !== "string" || !PATCH.test(v)) throw new Bad(`${what}: версия игры вида 3.30`);
    return v;
  }
  function text(v, what, max, dropped) {
    const o = obj(v, what, ["ru", "en"], dropped);
    const out = {};
    if (o.ru !== void 0) out.ru = plain(o.ru, `${what}.ru`, max);
    if (o.en !== void 0) out.en = plain(o.en, `${what}.en`, max);
    if (!out.ru && !out.en) throw new Bad(`${what}: нужен текст хотя бы на одном языке`);
    return out;
  }
  function authorLink(v, what) {
    if (typeof v !== "string" || v.length > STARTER_LIMITS.url) throw new Bad(`${what}: адрес до ${STARTER_LIMITS.url} символов`);
    if (!isAuthorLinkUrl(v)) throw new Bad(`${what}: только https и сайты авторов (links.ts, AUTHOR_LINK_HOSTS)`);
    return v;
  }
  function pobLink(v, what) {
    const url = authorLink(v, what);
    const input = parsePobInput(url);
    if (input.kind !== "link") throw new Bad(`${what}: не ссылка на пасту PoB (pobb.in, pob.codes, maxroll.gg/poe/pob)`);
    return url;
  }
  function links(v, dropped) {
    const o = obj(v, "links", STARTER_LINKS, dropped);
    const out = { pob: pobLink(o.pob, "links.pob") };
    for (const k of STARTER_LINKS) {
      if (k === "pob" || o[k] === void 0) continue;
      out[k] = authorLink(o[k], `links.${k}`);
    }
    return out;
  }
  function tags(v, dropped) {
    const o = obj(v, "tags", ["budget", "difficulty", "newbie", "leveling", "modes", "content"], dropped);
    if (o.difficulty !== 1 && o.difficulty !== 2 && o.difficulty !== 3) throw new Bad("tags.difficulty: 1, 2 или 3");
    return {
      budget: oneOf(o.budget, "tags.budget", STARTER_BUDGETS),
      difficulty: o.difficulty,
      newbie: bool(o.newbie, "tags.newbie"),
      leveling: oneOf(o.leveling, "tags.leveling", STARTER_LEVELING),
      modes: o.modes === void 0 ? [] : setOf(o.modes, "tags.modes", STARTER_MODES),
      content: o.content === void 0 ? [] : setOf(o.content, "tags.content", STARTER_CONTENT)
    };
  }
  function skill(v, dropped) {
    const o = obj(v, "skill", ["en", "gem"], dropped);
    const en = plain(o.en, "skill.en", STARTER_LIMITS.skill);
    if (!SKILL.test(en)) throw new Bad("skill.en: имя навыка, как в PoB");
    if (o.gem !== void 0 && o.gem !== null && (typeof o.gem !== "string" || o.gem.length > STARTER_LIMITS.gem || !GEM.test(o.gem))) {
      throw new Bad("skill.gem: ключ камня PoB Metadata/Items/Gems/…");
    }
    return { en, gem: typeof o.gem === "string" ? o.gem : null };
  }
  var RECORD_KEYS = ["id", "patch", "class", "ascendancy", "skill", "author", "lang", "links", "tags", "pick", "note", "pob", "checked", "added"];
  function record(v, dropped) {
    const o = obj(v, "starter", RECORD_KEYS, dropped);
    if (typeof o.id !== "string" || !STARTER_ID.test(o.id)) throw new Bad("id: латиница, цифры и дефис, до 48 символов");
    const asc = o.ascendancy;
    if (asc !== null && (typeof asc !== "string" || !ASCENDANCY.test(asc))) throw new Bad("ascendancy: восхождение по-английски или null");
    const pick = bool(o.pick, "pick");
    const note = o.note === void 0 || o.note === null ? null : text(o.note, "note", STARTER_LIMITS.note, dropped);
    if (pick && !note) throw new Bad("pick: «Рекомендуем новичкам» — только с причиной в note");
    const p = obj(o.pob, "pob", ["sha256", "checkedAt"], dropped);
    if (typeof p.sha256 !== "string" || !SHA256.test(p.sha256)) throw new Bad("pob.sha256: отпечаток sha256 (64 hex)");
    let checked = null;
    if (o.checked !== void 0 && o.checked !== null) {
      const c = obj(o.checked, "checked", ["league", "date"], dropped);
      checked = { league: patch(c.league, "checked.league"), date: day(c.date, "checked.date") };
    }
    return {
      id: o.id,
      patch: patch(o.patch, "patch"),
      class: oneOf(o.class, "class", STARTER_CLASSES),
      ascendancy: asc,
      skill: skill(o.skill, dropped),
      author: plain(o.author, "author", STARTER_LIMITS.author),
      lang: oneOf(o.lang, "lang", STARTER_LANGS),
      links: links(o.links, dropped),
      tags: tags(o.tags, dropped),
      pick,
      note,
      pob: { sha256: p.sha256, checkedAt: day(p.checkedAt, "pob.checkedAt") },
      checked,
      added: day(o.added, "added")
    };
  }
  function validateStarter(v) {
    const dropped = [];
    try {
      const value = record(v, dropped);
      return { ok: true, value, dropped: dropped.map((d) => `${value.id}.${d.replace(/^starter\./, "")}`) };
    } catch (e) {
      if (e instanceof Bad) return { ok: false, error: e.message };
      throw e;
    }
  }
  function isNewerSchema(raw) {
    return isObj(raw) && typeof raw.schema === "number" && Number.isInteger(raw.schema) && raw.schema > STARTERS_SCHEMA;
  }
  function validateIndex(v) {
    const dropped = [];
    try {
      const o = obj(v, "index", ["schema", "current", "leagues"], dropped);
      if (o.schema !== STARTERS_SCHEMA) throw new Bad(`index.schema: ${STARTERS_SCHEMA}`);
      if (!Array.isArray(o.leagues) || o.leagues.length < 1 || o.leagues.length > STARTER_LIMITS.leagues) {
        throw new Bad(`index.leagues: от 1 до ${STARTER_LIMITS.leagues}`);
      }
      const leagues = o.leagues.map((l, i) => patch(l, `index.leagues[${i}]`));
      if (new Set(leagues).size !== leagues.length) throw new Bad("index.leagues: повтор");
      const current = patch(o.current, "index.current");
      if (!leagues.includes(current)) throw new Bad("index.current: нет в leagues");
      return { ok: true, value: { schema: STARTERS_SCHEMA, current, leagues }, dropped };
    } catch (e) {
      if (e instanceof Bad) return { ok: false, error: e.message };
      throw e;
    }
  }
  function validateStartersFile(v, expectLeague) {
    const dropped = [];
    try {
      const o = obj(v, "file", ["schema", "league", "updatedAt", "starters"], dropped);
      if (o.schema !== STARTERS_SCHEMA) throw new Bad(`schema: ${STARTERS_SCHEMA}`);
      const league = patch(o.league, "league");
      if (expectLeague !== void 0 && league !== expectLeague) throw new Bad(`league: в файле ${league}, ждали ${expectLeague}`);
      const updatedAt = day(o.updatedAt, "updatedAt");
      if (!Array.isArray(o.starters) || o.starters.length > STARTER_LIMITS.starters) throw new Bad(`starters: до ${STARTER_LIMITS.starters}`);
      const starters = [];
      const failed = [];
      const seen = /* @__PURE__ */ new Set();
      o.starters.forEach((raw, index) => {
        const r = validateStarter(raw);
        const id = isObj(raw) && typeof raw.id === "string" ? raw.id.slice(0, STARTER_LIMITS.id) : null;
        if (!r.ok) failed.push({ index, id, error: r.error });
        else if (seen.has(r.value.id)) failed.push({ index, id, error: "id: повтор" });
        else {
          seen.add(r.value.id);
          starters.push(r.value);
          dropped.push(...r.dropped);
        }
      });
      return { ok: true, value: { file: { schema: STARTERS_SCHEMA, league, updatedAt, starters }, failed, dropped } };
    } catch (e) {
      if (e instanceof Bad) return { ok: false, error: e.message };
      throw e;
    }
  }
  function startersFileName(league) {
    return `${league}.json`;
  }
  function comparePatch(a, b) {
    const [a1, a2] = a.split(".").map(Number);
    const [b1, b2] = b.split(".").map(Number);
    return a1 - b1 || a2 - b2;
  }

  // src/shared/starters/load.ts
  async function readJson(read, file) {
    let s;
    try {
      s = await read(file);
    } catch {
      s = null;
    }
    if (s === null) return { ok: false, error: "нет файла" };
    if (new TextEncoder().encode(s).length > STARTER_LIMITS.bytes) return { ok: false, error: `больше ${STARTER_LIMITS.bytes} байт` };
    try {
      return { ok: true, raw: JSON.parse(s.charCodeAt(0) === 65279 ? s.slice(1) : s) };
    } catch {
      return { ok: false, error: "не JSON" };
    }
  }
  var none = (failed, league = null, status = "none") => ({
    status,
    league,
    updatedAt: null,
    starters: [],
    previous: null,
    failed
  });
  async function loadLeague(read, league, failed) {
    const file = startersFileName(league);
    const j = await readJson(read, file);
    if (!j.ok) {
      failed.push({ file, id: null, error: j.error });
      return null;
    }
    if (isNewerSchema(j.raw)) return "newer";
    const v = validateStartersFile(j.raw, league);
    if (!v.ok) {
      failed.push({ file, id: null, error: v.error });
      return null;
    }
    for (const f of v.value.failed) failed.push({ file, id: f.id, error: f.error });
    return { updatedAt: v.value.file.updatedAt, starters: v.value.file.starters };
  }
  async function loadStarters(read) {
    const failed = [];
    const idx = await readJson(read, STARTERS_INDEX);
    if (!idx.ok) return none([{ file: STARTERS_INDEX, id: null, error: idx.error }]);
    if (isNewerSchema(idx.raw)) return none([], null, "newer");
    const index = validateIndex(idx.raw);
    if (!index.ok) return none([{ file: STARTERS_INDEX, id: null, error: index.error }]);
    const { current, leagues } = index.value;
    const cur = await loadLeague(read, current, failed);
    if (cur === "newer") return none(failed, current, "newer");
    if (!cur) return none(failed, current);
    if (cur.starters.length) return { status: "ready", league: current, updatedAt: cur.updatedAt, starters: cur.starters, previous: null, failed };
    let previous = null;
    for (const league of leagues.slice(leagues.indexOf(current) + 1)) {
      const prev = await loadLeague(read, league, failed);
      if (prev && prev !== "newer" && prev.starters.length) {
        previous = { league, starters: prev.starters };
        break;
      }
    }
    return { status: "empty", league: current, updatedAt: cur.updatedAt, starters: [], previous, failed };
  }
  function findStarter(load, id) {
    return load.starters.find((s) => s.id === id) ?? load.previous?.starters.find((s) => s.id === id) ?? null;
  }

  // src/shared/starters/view.ts
  var hostOf = (url) => {
    try {
      return new URL(url).hostname.replace(/^(?:www|m)\./, "");
    } catch {
      return "";
    }
  };
  function toCard(r) {
    const links2 = {};
    for (const k of STARTER_LINKS) {
      const url = r.links[k];
      if (url) links2[k] = hostOf(url);
    }
    const { links: _links, pob, ...rest } = r;
    return { ...rest, links: links2, pobCheckedAt: pob.checkedAt };
  }
  function starterBadges(c, league) {
    if (!league) return { checked: false, fresh: false, stale: false };
    return { checked: c.checked?.league === league, fresh: c.patch === league, stale: comparePatch(c.patch, league) < 0 };
  }
  var NO_FILTERS = {
    cls: null,
    asc: null,
    budget: null,
    difficulty: null,
    newbie: false,
    acts: false,
    checked: false,
    ru: false,
    mode: null,
    content: null
  };
  var budgetRank = (b) => STARTER_BUDGETS.indexOf(b);
  function matchesFilters(c, f, league) {
    if (f.cls && c.class !== f.cls) return false;
    if (f.cls && f.asc && c.ascendancy !== f.asc) return false;
    if (f.budget && budgetRank(c.tags.budget) > budgetRank(f.budget)) return false;
    if (f.difficulty && c.tags.difficulty > f.difficulty) return false;
    if (f.newbie && !c.tags.newbie) return false;
    if (f.acts && c.tags.leveling !== "acts") return false;
    if (f.checked && !starterBadges(c, league).checked) return false;
    if (f.ru && c.lang !== "ru") return false;
    if (f.mode && !c.tags.modes.includes(f.mode)) return false;
    if (f.content && !c.tags.content.includes(f.content)) return false;
    return true;
  }
  function filterStarters(list, f, league) {
    return list.filter((c) => matchesFilters(c, f, league));
  }
  function recommendedKey(c, league) {
    const b = starterBadges(c, league);
    return [c.pick ? 0 : 1, b.checked ? 0 : 1, c.tags.newbie ? 0 : 1, b.stale ? 1 : 0, c.tags.difficulty, budgetRank(c.tags.budget)];
  }
  var byKeys = (a, b) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  };
  function sortStarters(list, sort, league) {
    const rows = list.map((c, i) => ({ c, i }));
    const cmp = sort === "updated" ? (a, b) => b.pobCheckedAt < a.pobCheckedAt ? -1 : b.pobCheckedAt > a.pobCheckedAt ? 1 : 0 : sort === "new" ? (a, b) => b.added < a.added ? -1 : b.added > a.added ? 1 : 0 : (a, b) => byKeys(recommendedKey(a, league), recommendedKey(b, league));
    return rows.sort((x, y) => cmp(x.c, y.c) || x.i - y.i).map((r) => r.c);
  }
  function picksOf(list, league, max = 6) {
    return sortStarters(
      list.filter((c) => c.pick),
      "recommended",
      league
    ).slice(0, max);
  }
  function classesOf(list) {
    return STARTER_CLASSES.filter((k) => list.some((c) => c.class === k));
  }
  function ascendanciesOf(list, cls) {
    const out = [];
    for (const c of list) if (c.class === cls && c.ascendancy && !out.includes(c.ascendancy)) out.push(c.ascendancy);
    return out.sort();
  }
  return __toCommonJS(site_exports);
})();
