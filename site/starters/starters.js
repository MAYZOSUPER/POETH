// Сайт POETH, «Стартеры» (ST3): каталог стартеров лиги — только просмотр.
// Список, проверка и знаки — тем же кодом, что во вкладке «Билд» (starters-core.js — бандл src/shared/starters:
// строгий валидатор, загрузка «текущая лига → до анонса прошлая», знаки, фильтры, сортировки и «Рекомендуем
// новичкам»). Данные — копии файлов приложения в data/, имена классов, восхождений и навыков на языке клиента —
// names.json (всё собирает tools/starters/build-site.mjs).
//
// Безопасность: всё из данных выводится только через textContent и setAttribute — никакого innerHTML. Ссылки — только
// прошедшие валидатор (https, хосты авторов из links.ts), открываются в новой вкладке без referrer. Счётчиков и
// сторонних скриптов нет (CSP страницы — только свои файлы). Играть по стартеру — только в приложении.
(function () {
  'use strict';
  var S = window.POETHStarters;
  var root = document.documentElement;
  var NS = 'http://www.w3.org/2000/svg';
  var st = { cls: '', budget: '', newbie: false, acts: false, ru: false, sort: 'recommended' };
  var data = { load: null, names: null, error: false, byId: {} };

  // ------------------------------------------------------------------ язык и подписи
  function lang() { return root.getAttribute('data-lang') === 'en' ? 'en' : 'ru'; }
  function L(ru, en) { return lang() === 'ru' ? ru : en; }
  function P(pair) { return pair ? L(pair[0], pair[1]) : ''; }
  function date(d) {
    var p = String(d || '').split('-');
    if (p.length !== 3) return String(d || '');
    var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[1] - 1] || p[1];
    return lang() === 'ru' ? p[2] + '.' + p[1] + '.' + p[0] : mon + ' ' + (+p[2]) + ', ' + p[0];
  }
  // те же слова, что в приложении (i18n/dict/build.ts, bd.st.*)
  var BUDGET = { starter: ['Без вложений', 'No investment'], low: ['Дёшево', 'Cheap'], medium: ['Средне', 'Medium'], high: ['Дорого', 'Expensive'] };
  var DIFF = { 1: ['Просто', 'Easy'], 2: ['Средне', 'Medium'], 3: ['Сложно', 'Hard'] };
  var LEV = { acts: ['Ведёт по актам', 'Guides through acts'], partial: ['По актам — частично', 'Acts — partly'], none: ['По актам не ведёт', 'No act-by-act guide'] };
  var MODES = { sc: ['SC', 'SC'], hc: ['Хардкор', 'Hardcore'], ssf: ['SSF', 'SSF'] };
  var CONTENT = { mapping: ['Карты', 'Mapping'], bossing: ['Боссы', 'Bossing'] };
  var LINKS = [['guide', 'Гайд автора', "Author's guide"], ['video', 'Видео', 'Video'], ['pob', 'PoB автора', "Author's PoB"], ['channel', 'Канал автора', "Author's channel"]];
  var SORTS = [['recommended', 'Рекомендуем', 'Recommended'], ['updated', 'Обновлённые', 'Updated'], ['new', 'Новые', 'New']];

  // ------------------------------------------------------------------ DOM без innerHTML
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : String(v));
      });
    }
    add(el, kids);
    return el;
  }
  function add(el, kids) {
    if (kids === null || kids === undefined || kids === false) return el;
    (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      if (c === null || c === undefined || c === false || c === '') return;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return el;
  }
  function ic(name) {
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'ico');
    svg.setAttribute('aria-hidden', 'true');
    var use = document.createElementNS(NS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.appendChild(use);
    return svg;
  }

  // ------------------------------------------------------------------ имена на языке клиента (как карточка в приложении)
  function clsName(en) {
    var c = data.names && data.names.classes && data.names.classes[en];
    return lang() === 'ru' && c && c.ru ? c.ru : en;
  }
  function ascName(cls, asc) {
    if (!asc) return null;
    var c = data.names && data.names.classes && data.names.classes[cls];
    return lang() === 'ru' && c && c.asc && c.asc[asc] ? c.asc[asc] : asc;
  }
  function skillName(card) {
    var s = card.skill.gem && data.names && data.names.skills && data.names.skills[card.skill.gem];
    return s ? (lang() === 'ru' ? s.ru : s.en) : card.skill.en;
  }
  function noteText(n) { return n ? (lang() === 'ru' ? n.ru || n.en : n.en || n.ru) || null : null; }

  // ------------------------------------------------------------------ карточка
  function tag(cls, icon, text, tip) { return h('span', { class: 'sr-tag' + (cls ? ' sr-tag--' + cls : ''), title: tip || null }, [icon ? ic(icon) : null, text]); }
  function dots(n) {
    var w = h('span', { class: 'sr-dots', 'aria-hidden': 'true' });
    for (var i = 1; i <= 3; i++) w.appendChild(h('i', { class: i <= n ? 'on' : null }));
    return w;
  }
  function fact(label, value) { return h('div', null, [h('dt', null, label), h('dd', null, value)]); }

  function card(c, league) {
    var b = S.starterBadges(c, league);
    var asc = ascName(c.class, c.ascendancy);
    var cls = clsName(c.class);
    var rec = data.byId[c.id];
    var tags = [];
    if (c.pick) tags.push(tag('gold', 'star', L('Рекомендуем', 'Recommended'), L('Выбор POETH для новичков — причина в строке ниже', "POETH's pick for beginners — the reason is in the line below")));
    if (b.checked) tags.push(tag('good', 'check', L('Проверено POETH в ', 'Checked by POETH in ') + league, L('Импорт проходит, этапы узнаны, ссылки живые. Это не обещание силы билда.', 'The import works, stages are recognized, links are alive. Not a promise about build strength.')));
    if (b.fresh) tags.push(tag('info', null, L('Обновлён к ', 'Updated for ') + league, L('PoB сделан под версию игры ', 'The PoB was made for game version ') + league));
    if (b.stale) tags.push(tag('warn', 'history', L('Устарел · ', 'Outdated · ') + c.patch, L('PoB сделан под прошлую версию игры ', 'The PoB was made for the previous game version ') + c.patch));
    if (c.tags.newbie) tags.push(tag('person', null, L('Для новичка', 'Beginner-friendly')));

    var lev = c.tags.leveling;
    var modes = c.tags.modes.map(function (m) { return P(MODES[m]); }).concat(c.tags.content.map(function (k) { return P(CONTENT[k]); }));
    var links = [];
    LINKS.forEach(function (l) {
      var url = rec && rec.links[l[0]];
      if (!url) return;
      links.push(h('a', { class: 'btn btn--sm' + (links.length ? '' : ' btn--primary'), href: url, target: '_blank', rel: 'noopener noreferrer nofollow', title: L('Откроется в новой вкладке: ', 'Opens in a new tab: ') + (c.links[l[0]] || '') }, [
        ic('external'), L(l[1], l[2]), h('span', { class: 'sr-host' }, c.links[l[0]] || '')
      ]));
    });
    var note = noteText(c.note);
    return h('article', { class: 'sr-card', id: 'starter-' + c.id }, [
      h('div', { class: 'sr-card__head' }, [
        h('span', { class: 'sr-mark' }, ic('passive')),
        h('div', null, [
          h('h3', null, skillName(c) + ' · ' + (asc || cls)),
          h('p', { class: 'sr-sub' }, [asc ? cls + ' → ' + asc : cls, ' · ', L('автор ', 'by ') + c.author, ' · ', c.lang === 'ru' ? L('видео на русском', 'video in Russian') : L('видео на английском', 'video in English')])
        ])
      ]),
      tags.length ? h('div', { class: 'sr-tags' }, tags) : null,
      note ? h('p', { class: 'sr-note' }, note) : null,
      h('dl', { class: 'sr-facts' }, [
        fact(L('Бюджет', 'Budget'), P(BUDGET[c.tags.budget])),
        fact(L('Сложность', 'Difficulty'), [dots(c.tags.difficulty), P(DIFF[c.tags.difficulty])]),
        fact(L('Прокачка', 'Leveling'), h('span', { class: 'sr-lev sr-lev--' + lev }, [ic(lev === 'acts' ? 'check' : lev === 'none' ? 'warn' : 'dash'), P(LEV[lev])])),
        modes.length ? fact(L('Режимы и контент', 'Modes and content'), modes.join(' · ')) : null
      ]),
      links.length ? h('div', { class: 'sr-links' }, links) : null,
      h('p', { class: 'sr-small' }, [
        L('Проверенная версия PoB — от ', 'Checked PoB version of ') + date(c.pobCheckedAt),
        c.checked ? ' · ' + L('проверено POETH ', 'checked by POETH on ') + date(c.checked.date) : '',
        ' · ', L('гайд и PoB — автора, по ссылке', "guide and PoB belong to the author, linked")
      ])
    ]);
  }

  // ------------------------------------------------------------------ фильтры
  function filters() {
    var f = {};
    Object.keys(S.NO_FILTERS).forEach(function (k) { f[k] = S.NO_FILTERS[k]; });
    f.cls = st.cls || null;
    f.budget = st.budget || null;
    f.newbie = st.newbie;
    f.acts = st.acts;
    f.ru = st.ru;
    return f;
  }
  function active() { return (st.cls ? 1 : 0) + (st.budget ? 1 : 0) + (st.newbie ? 1 : 0) + (st.acts ? 1 : 0) + (st.ru ? 1 : 0); }
  function select(label, value, options, onchange) {
    var s = h('select', { class: 'sr-select', 'aria-label': label, onchange: function (e) { onchange(e.target.value); } });
    options.forEach(function (o) { s.appendChild(h('option', { value: o[0], selected: o[0] === value }, o[1])); });
    return h('label', { class: 'sr-ctl' }, [h('span', null, label), s]);
  }
  function chip(on, text, toggle) {
    return h('button', { type: 'button', class: 'sr-chip', 'aria-pressed': String(on), onclick: toggle }, [on ? ic('check') : null, text]);
  }
  function bar(list) {
    var classes = S.classesOf(list).map(function (k) { return [k, clsName(k)]; });
    return h('div', { class: 'sr-bar' }, [
      h('div', { class: 'sr-row' }, [
        select(L('Класс', 'Class'), st.cls, [['', L('Любой класс', 'Any class')]].concat(classes), function (v) { st.cls = v; render(); }),
        select(L('Бюджет — не дороже', 'Budget — up to'), st.budget, [['', L('Любой', 'Any')]].concat(S.STARTER_BUDGETS.map(function (k) { return [k, P(BUDGET[k])]; })), function (v) { st.budget = v; render(); }),
        select(L('Сортировка', 'Sort'), st.sort, SORTS.map(function (s) { return [s[0], L(s[1], s[2])]; }), function (v) { st.sort = v; render(); })
      ]),
      h('div', { class: 'sr-chips' }, [
        chip(st.newbie, L('Для новичка', 'Beginner-friendly'), function () { st.newbie = !st.newbie; render(); }),
        chip(st.acts, L('Ведёт по актам', 'Guides through acts'), function () { st.acts = !st.acts; render(); }),
        chip(st.ru, L('Видео на русском', 'Russian video'), function () { st.ru = !st.ru; render(); })
      ])
    ]);
  }
  function reset() { st.cls = ''; st.budget = ''; st.newbie = false; st.acts = false; st.ru = false; render(); }

  // ------------------------------------------------------------------ виды
  function msg(kind, icon, title, text) {
    return h('div', { class: 'sr-msg' + (kind ? ' sr-msg--' + kind : '') }, [ic(icon), h('div', null, [h('p', { class: 'sr-msg__t' }, title), text ? h('p', null, text) : null])]);
  }
  function grid(list, league) { return h('div', { class: 'sr-grid' }, list.map(function (c) { return card(c, league); })); }
  function group(title, desc, list, league) {
    return h('section', { class: 'sr-group' }, [h('div', { class: 'sr-group__head' }, [h('h2', null, title), desc ? h('p', null, desc) : null]), grid(list, league)]);
  }

  function listView(all, league, updatedAt) {
    var f = filters();
    var found = S.filterStarters(all, f, league);
    var picks = st.sort === 'recommended' ? S.picksOf(found, league) : [];
    var rest = S.sortStarters(found, st.sort, league).filter(function (c) { return picks.indexOf(c) < 0; });
    var n = active();
    var out = [bar(all), h('p', { class: 'sr-count' }, [
      L(found.length + ' из ' + all.length, found.length + ' of ' + all.length),
      updatedAt ? ' · ' + L('список обновлён ', 'list updated ') + date(updatedAt) : '',
      n ? h('button', { type: 'button', onclick: reset }, L('Сбросить фильтры', 'Reset filters') + ' (' + n + ')') : null
    ])];
    if (!found.length) out.push(msg('', 'warn', L('Под фильтры ничего не подошло.', 'Nothing matches the filters.'), null));
    if (picks.length) out.push(group(L('Рекомендуем новичкам', 'Recommended for beginners'), L('Наш выбор: просто играть, недорого, с этапами по актам. Это чужие билды — мест и рейтингов не ставим.', "Our picks: easy to play, cheap, with act-by-act stages. These are other people's builds — we don't rank them."), picks, league));
    if (rest.length) out.push(group(picks.length ? L('Все стартеры', 'All starters') : L('Стартеры', 'Starters'), null, rest, league));
    return out;
  }

  function view() {
    var ld = data.load;
    if (!S) return msg('warn', 'warn', L('Не загрузился скрипт страницы.', 'The page script did not load.'), L('Обновите страницу.', 'Reload the page.'));
    if (data.error) return msg('warn', 'warn', L('Список стартеров не загрузился.', 'The starter list did not load.'), L('Проверьте интернет и обновите страницу.', 'Check your connection and reload the page.'));
    if (!ld) return h('p', { class: 'sr-loading' }, L('Загружаем список стартеров…', 'Loading the starter list…'));
    if (ld.status === 'newer') return msg('warn', 'warn', L('Список стартеров новее этой страницы.', 'The starter list is newer than this page.'), L('Обновите страницу (Ctrl+F5).', 'Reload the page (Ctrl+F5).'));
    if (ld.status === 'none') return msg('warn', 'warn', L('Список стартеров не прочитался.', 'The starter list could not be read.'), L('Обновите страницу. Не поможет — сообщите нам об ошибке.', 'Reload the page. If that does not help, please report a bug.'));
    var league = ld.league;
    var f = document.createDocumentFragment();
    var hidden = ld.failed.filter(function (x) { return x.id !== null; }).length;
    if (hidden) f.appendChild(msg('warn', 'warn', L('Записей не прошло проверку и скрыто: ', 'Entries that failed the check and are hidden: ') + hidden + '.', null));
    if (ld.status === 'ready') {
      add(f, listView(ld.starters.map(S.toCard), league, ld.updatedAt));
      return f;
    }
    // пусто: до анонса лиги
    f.appendChild(h('div', { class: 'sr-empty' }, [
      h('span', { class: 'sr-mark sr-mark--lg' }, ic('play')),
      h('div', null, [
        h('h2', null, L('Стартеры ' + league + ' появятся после анонса лиги.', league + ' starters will appear after the league announcement.')),
        h('p', null, L('Авторы выкладывают стартовые билды за несколько дней до старта лиги. Мы соберём список по их гайдам и PoB — он появится здесь и во вкладке «Билд» приложения обновлением данных, переустанавливать POETH не нужно.', 'Authors post their starter builds a few days before the league starts. We will put the list together from their guides and PoBs — it will appear here and in the app\'s Build tab as a data update, no need to reinstall POETH.')),
        h('p', null, h('a', { href: '../guide/#starters' }, L('Как играть по стартеру в POETH →', 'How to play a starter in POETH →')))
      ])
    ]));
    if (ld.previous) {
      f.appendChild(msg('warn', 'history', L('Пока — стартеры прошлой лиги ' + ld.previous.league + ': они могут устареть.', 'Meanwhile — starters from the previous league ' + ld.previous.league + ': they may be outdated.'), null));
      add(f, listView(ld.previous.starters.map(S.toCard), league, null));
    }
    return f;
  }

  function render() {
    var el = document.getElementById('sr-root');
    if (!el) return;
    el.replaceChildren(view());
    var ld = data.load;
    var lg = ld && ld.league ? ' ' + ld.league : '';
    document.title = L('Стартеры лиги' + lg + ' — POETH', 'League starters' + lg + ' — POETH');
  }

  // ------------------------------------------------------------------ язык и данные
  function setLang(l) {
    root.lang = l;
    root.setAttribute('data-lang', l);
    document.querySelectorAll('[data-set-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === l)); });
    try { localStorage.setItem('poeth-lang', l); } catch (e) { /* приватный режим */ }
    render();
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-set-lang]');
    if (b) setLang(b.getAttribute('data-set-lang'));
  });

  function getText(url) {
    return fetch(url, { credentials: 'omit', cache: 'no-cache' }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(String(r.status));
      return r.text();
    });
  }

  setLang(lang());
  if (!S) return;
  Promise.all([
    // тот же загрузчик, что в приложении: проверка каждой записи, текущая лига, до анонса — прошлая
    S.loadStarters(function (file) { return getText('data/' + encodeURIComponent(file)); }),
    getText('names.json').then(function (t) { return t ? JSON.parse(t) : null; }).catch(function () { return null; })
  ]).then(function (r) {
    data.load = r[0];
    data.names = r[1];
    data.load.starters.concat(data.load.previous ? data.load.previous.starters : []).forEach(function (s) { data.byId[s.id] = s; });
    render();
  }).catch(function () { data.error = true; render(); });
})();
