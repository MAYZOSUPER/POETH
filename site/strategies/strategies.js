// Сайт POETH, «Стратегии» (S17): каталог (index.html) и просмотр по ссылке (view.html, код после #).
// Код POETH1 раскрывается здесь, в браузере, тем же кодом, что в приложении (strategy-core.js — бандл
// src/shared/advisor: формат, строгий валидатор, расчёт). На сервер код не уходит: часть адреса после #
// браузер не отправляет. Данные: catalog.json (наши и сообщества, с готовыми кодами), names-ru.json (русские
// имена предметов), prices.json — необязательный снимок цен (нет его — доход «в приложении»).
//
// Безопасность: всё, что пришло из кода или каталога, выводится только через textContent и setAttribute —
// никакого innerHTML. Ссылки из стратегии — только https (так проверил валидатор), открываются в новой
// вкладке без referrer. Счётчиков и сторонних скриптов нет (CSP страницы — только свои файлы).
(function () {
  'use strict';
  var P = window.POETHStrategy;
  var root = document.documentElement;
  var page = document.body.getAttribute('data-page');
  var REL = 'https://github.com/MAYZOSUPER/POETH/releases/latest';
  var NS = 'http://www.w3.org/2000/svg';
  var MECH = [
    ['essence', 'Сущности', 'Essences'], ['strongbox', 'Сундуки', 'Strongboxes'], ['expedition', 'Экспедиция', 'Expedition'],
    ['harvest', 'Жатва', 'Harvest'], ['delirium', 'Делириум', 'Delirium'], ['abyss', 'Бездна', 'Abyss']
  ];
  var st = { budget: 'any', diff: 0, mech: {}, sort: 'profit', copied: '', tried: false };
  MECH.forEach(function (m) { st.mech[m[0]] = true; });
  var data = { catalog: null, names: null, prices: null, pricesDate: null, error: false };
  var view = { state: 'loading', s: null, code: '', match: null };

  // ------------------------------------------------------------------ язык и числа
  function lang() { return root.getAttribute('data-lang') === 'en' ? 'en' : 'ru'; }
  function L(ru, en) { return lang() === 'ru' ? ru : en; }
  function T(t) { return t ? P.tx(t, lang()) : ''; }
  function num(v, digits) { return Number(v).toLocaleString(lang() === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: digits }); }
  function cv(v) { var a = Math.abs(v); return num(a, a >= 10 ? 0 : a >= 1 ? 1 : 2); }
  function chaos(v) { return '~' + cv(v) + ' c'; }
  function plur(n, a, b, c) { var m = n % 10, h = n % 100; return n + ' ' + (m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c); }
  function maps(n) { return lang() === 'ru' ? plur(n, 'карта', 'карты', 'карт') : n + (n === 1 ? ' map' : ' maps'); }
  function date(d) {
    var p = String(d || '').split('-');
    if (p.length < 2) return String(d || '');
    var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+p[1] - 1] || p[1];
    if (p.length === 2) return lang() === 'ru' ? p[1] + '.' + p[0] : mon + ' ' + p[0];
    return lang() === 'ru' ? p[2] + '.' + p[1] + '.' + p[0] : mon + ' ' + (+p[2]) + ', ' + p[0];
  }
  function diffWord(n) { return [L('лёгкая', 'easy'), L('лёгкая', 'easy'), L('средняя', 'medium'), L('сложная', 'hard')][n] || ''; }
  function lv(n) { return [L('немного', 'a little'), L('немного', 'a little'), L('средне', 'some'), L('много', 'a lot')][n] || ''; }

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
  function frag(list) { var f = document.createDocumentFragment(); add(f, list); return f; }

  // ------------------------------------------------------------------ стратегия
  function mechOf(s) {
    for (var i = 0; i < s.tags.length; i++) for (var j = 0; j < MECH.length; j++) if (MECH[j][0] === s.tags[i]) return MECH[j][0];
    return null;
  }
  function itemName(it) {
    if (it.label) return T(it.label);
    if (lang() === 'ru' && data.names && it.ref && data.names[it.ref]) return data.names[it.ref];
    return it.ref || '';
  }
  /** Доход: по снимку цен (если есть), иначе замер автора, иначе — только в приложении. */
  function income(s) {
    var e = P.estimate(s, data.prices);
    if (e) {
      var ph = P.perHour(e.profit, s.minutesPerMap);
      return { kind: 'prices', e: e, perHour: ph, cost: e.cost, partial: e.incomePartial };
    }
    if (s.measured) return { kind: 'measured', e: null, perHour: s.measured.perHour, cost: null, partial: false };
    return { kind: 'none', e: null, perHour: null, cost: null, partial: false };
  }
  function budgetOf(inc) {
    if (inc.cost === null) return 'none';
    return inc.cost <= 10 ? 'cheap' : inc.cost <= 150 ? 'div' : 'exp';
  }

  function tags(s, kind, opt) {
    opt = opt || {};
    var out = [];
    if (kind === 'official') out.push(h('span', { class: 'st-tag st-tag--gold', title: L('Стратегия команды POETH', 'Made by the POETH team') }, L('наша', 'official')));
    else if (kind === 'community') out.push(h('span', { class: 'st-tag st-tag--info', title: L('Прислал игрок, мы проверили и добавили в каталог', 'Sent by a player, tested and added to the catalog by us') }, L('сообщество', 'community')));
    else out.push(h('span', { class: 'st-tag st-tag--warn', title: L('Стратегия по ссылке: мы её не проверяли', 'A strategy from a link: we have not checked it') }, L('не проверена', 'unchecked')));
    if (s.draft) out.push(h('span', { class: 'st-tag st-tag--draft', title: L('Количества грубые, проверим после обновления лиги', 'Rough amounts, to be checked after the league update') }, L('черновик · ', 'draft · ') + s.patch));
    var cur = data.catalog && data.catalog.patch;
    if (cur && P.isOutdated(s, cur)) out.push(h('span', { class: 'st-tag st-tag--warn', title: L('Атлас и механики могли измениться', 'The Atlas and mechanics may have changed') }, L('может быть устаревшей · ', 'may be outdated · ') + s.patch));
    else if (!s.draft) out.push(h('span', { class: 'st-tag' }, L('для ', 'for ') + s.patch));
    var foreign = P.foreignLang(s, lang());
    if (foreign === 'en') out.push(h('span', { class: 'st-tag' }, L('текст на английском', 'text in English')));
    if (foreign === 'ru') out.push(h('span', { class: 'st-tag' }, L('текст на русском', 'text in Russian')));
    return opt.wrap === false ? out : h('div', { class: 'st-tags' }, out);
  }
  function incomeEl(inc) {
    if (inc.perHour === null) {
      return h('span', { class: 'st-income st-income--none' }, inc.kind === 'prices' ? L('нет цены', 'no price') : L('в приложении', 'in the app'));
    }
    var loss = inc.perHour < 0;
    return h('span', { class: 'st-income' }, [
      (loss ? L('убыток ', 'loss ') : inc.partial ? '≥ ' : '') + '~' + cv(inc.perHour) + ' ',
      h('small', null, 'chaos/' + L('ч', 'h'))
    ]);
  }
  function incomeNote(inc, s) {
    if (inc.kind === 'prices') return L('по ценам на ', 'at prices of ') + data.pricesDate + L(' · живые — в приложении', ' · live in the app');
    if (inc.kind === 'measured') return L('замер автора: ', 'author’s measurement: ') + maps(s.measured.maps) + ', ' + num(s.measured.hours, 1) + L(' ч', ' h') + L(' · живые цены — в приложении', ' · live prices in the app');
    return L('по живым ценам биржи — в приложении POETH', 'at live exchange prices — in the POETH app');
  }
  function entryEl(s, inc) {
    if (inc.kind === 'prices') {
      if (inc.cost === null) return L('нет цены', 'no price');
      if (inc.cost === 0) return L('только своя карта', 'your own map only');
      return chaos(inc.cost) + ' ' + L('за карту', 'per map');
    }
    var parts = s.inputs.map(function (l) { return h('span', null, itemName(l.item) + (l.qty !== 1 ? ' ×' + num(l.qty, 2) : '')); });
    return parts.length ? h('span', { class: 'st-items' }, parts) : L('ничего', 'nothing');
  }
  function buildText(s) {
    return [['damage', L('урон', 'damage')], ['survival', L('живучесть', 'survivability')], ['speed', L('скорость', 'speed')]]
      .map(function (k) { return k[1] + ' — ' + lv(s.build[k[0]]); }).join(', ');
  }
  function dots(n) {
    var w = h('span', { class: 'st-dots', 'aria-hidden': 'true' });
    for (var i = 1; i <= 3; i++) w.appendChild(h('i', { class: i <= n ? 'on' : null }));
    return w;
  }
  function trust(s, kind, checked) {
    var t = s.measured
      ? h('span', { class: 'ok', title: L('Количества взяты из сессий фарма с учётом тайника', 'Amounts come from farming sessions with stash tracking') }, [ic('chart'), L('замерено трекером: ', 'measured by tracker: ') + maps(s.measured.maps) + ', ' + num(s.measured.hours, 1) + L(' ч', ' h')])
      : h('span', { class: 'est', title: L('Количества автор написал сам, без замера', 'The author typed the amounts without measuring') }, [ic('edit'), L('оценка автора', 'author’s estimate')]);
    var by;
    if (kind === 'official') by = L('POETH · ', 'POETH · ') + date(checked || s.source.date);
    else if (kind === 'community') by = (s.source.author ? L('автор ', 'by ') + s.source.author + ' · ' : '') + L('проверена ', 'tested ') + date(checked);
    else by = s.source.author ? L('автор ', 'by ') + s.source.author : L('автор не указан', 'no author');
    return h('p', { class: 'st-trust' }, [t, h('span', null, by)]);
  }
  function facts(s, inc, wide) {
    var f = function (dt, dd) { return h('div', null, [h('dt', null, dt), h('dd', null, dd)]); };
    return h('dl', { class: 'st-facts' + (wide ? ' st-facts--wide' : '') }, [
      f(L('Доход', 'Income'), [incomeEl(inc), h('small', null, incomeNote(inc, s))]),
      f(L('Вход', 'Entry'), entryEl(s, inc)),
      f(L('Сложность', 'Difficulty'), [dots(s.difficulty), diffWord(s.difficulty), wide ? h('small', null, L('карта ~', 'a map takes ~') + num(s.minutesPerMap, 1) + L(' мин', ' min')) : null]),
      f(L('Билду нужно', 'Build needs'), buildText(s))
    ]);
  }

  // ------------------------------------------------------------------ копирование
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = h('textarea', { class: 'st-hidden', readonly: true });
      ta.value = text;
      document.body.appendChild(ta);
      ta.classList.remove('st-hidden');
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (ok) resolve(); else reject(new Error('copy'));
    });
  }
  function copyBtn(id, code, small) {
    var done = st.copied === id;
    return h('button', {
      type: 'button',
      class: 'btn' + (small ? ' btn--sm' : '') + (done ? ' is-done' : ''),
      onclick: function () {
        copyText(code).then(function () {
          st.copied = id; render();
          setTimeout(function () { if (st.copied === id) { st.copied = ''; render(); } }, 2000);
        }).catch(function () { /* буфер недоступен — код виден на странице */ });
      }
    }, [ic(done ? 'check' : 'copy'), done ? L('Скопировано', 'Copied') : L('Скопировать код', 'Copy code')]);
  }

  // ------------------------------------------------------------------ каталог
  function seg(key, cur, opts) {
    return h('span', { class: 'st-seg', role: 'group' }, opts.map(function (o) {
      return h('button', { type: 'button', 'aria-pressed': String(String(cur) === String(o[0])), onclick: function () { st[key] = key === 'diff' ? +o[0] : o[0]; render(); } }, o[1]);
    }));
  }
  function filtered() { return st.budget !== 'any' || st.diff || MECH.some(function (m) { return !st.mech[m[0]]; }); }
  function reset() { st.budget = 'any'; st.diff = 0; MECH.forEach(function (m) { st.mech[m[0]] = true; }); render(); }
  function emptyBox(title, text, btns) {
    return h('div', { class: 'st-empty' }, [
      h('img', { src: '../assets/img/strategies-empty.svg', alt: '', width: 150, height: 154 }),
      h('h1', null, title), h('p', null, text),
      btns ? h('div', { class: 'st-cta st-cta--center' }, btns) : null
    ]);
  }
  function catalogView() {
    if (data.error) return emptyBox(L('Каталог не загрузился', 'The catalog did not load'), L('Обновите страницу. Если не помогло — стратегии есть во вкладке «Что фармить» в приложении.', 'Reload the page. If that does not help, the strategies are in the What to farm tab in the app.'), null);
    if (!data.catalog) return h('p', { class: 'st-loading' }, L('Загружаем каталог…', 'Loading the catalog…'));
    var all = data.catalog.strategies;
    var withPrices = !!data.prices;
    var rows = all.map(function (it) { return { it: it, inc: income(it.strategy) }; });
    var list = rows.filter(function (r) {
      var s = r.it.strategy, m = mechOf(s);
      if (withPrices && st.budget !== 'any' && budgetOf(r.inc) !== st.budget) return false;
      if (st.diff && s.difficulty !== st.diff) return false;
      if (m && !st.mech[m]) return false;
      return true;
    });
    var ph = function (r) { return r.inc.perHour === null ? -Infinity : r.inc.perHour; };
    list.sort(function (a, b) {
      if (st.sort === 'easy') return a.it.strategy.difficulty - b.it.strategy.difficulty || ph(b) - ph(a);
      if (st.sort === 'cheap') return (a.inc.cost === null ? Infinity : a.inc.cost) - (b.inc.cost === null ? Infinity : b.inc.cost) || ph(b) - ph(a);
      return ph(b) - ph(a) || a.it.strategy.difficulty - b.it.strategy.difficulty;
    });
    var sortOpts = [['profit', L('по доходу', 'by income')], ['easy', L('сначала лёгкие', 'easiest first')]];
    if (withPrices) sortOpts.push(['cheap', L('дешёвый вход', 'cheapest entry')]);
    var select = h('select', { class: 'st-select', onchange: function (e) { st.sort = e.target.value; render(); } }, sortOpts.map(function (o) {
      return h('option', { value: o[0], selected: st.sort === o[0] }, o[1]);
    }));
    var bar = h('div', { class: 'st-bar' }, [
      h('div', { class: 'st-row' }, [
        withPrices ? h('span', { class: 'st-ctl' }, [L('Бюджет входа', 'Entry budget'), seg('budget', st.budget, [['any', L('любой', 'any')], ['cheap', L('до 10 c', 'up to 10 c')], ['div', L('до 1 div', 'up to 1 div')], ['exp', L('дорого', 'expensive')]])]) : null,
        h('span', { class: 'st-ctl' }, [L('Сложность', 'Difficulty'), seg('diff', st.diff, [[0, L('любая', 'any')], [1, L('лёгкая', 'easy')], [2, L('средняя', 'medium')], [3, L('сложная', 'hard')]])]),
        h('label', { class: 'st-ctl' }, [L('Порядок', 'Order'), select])
      ]),
      h('div', { class: 'st-chips' }, [h('span', { class: 'st-ctl' }, L('Механика', 'Mechanic'))].concat(MECH.map(function (m) {
        return h('button', { type: 'button', class: 'st-chip', 'aria-pressed': String(st.mech[m[0]]), onclick: function () { st.mech[m[0]] = !st.mech[m[0]]; render(); } }, [ic(m[0]), L(m[1], m[2])]);
      }))),
      h('p', { class: 'st-prices' }, [ic('history'), h('span', null, withPrices
        ? [L('Доход посчитан по снимку цен биржи GGG на ', 'Income uses a snapshot of GGG exchange prices from '), h('b', null, data.pricesDate), '.']
        : L('Доход в час и стоимость входа зависят от цен — их считает приложение по живым ценам биржи. Здесь — замер автора, если он есть.', 'Income per hour and entry cost depend on prices — the app calculates them at live exchange prices. Here you see the author’s measurement, if there is one.')),
        h('span', null, L('Живые цены и ваш собственный результат — в приложении.', 'Live prices and your own result are in the app.'))]),
      h('div', { class: 'st-count' }, [L('Стратегий: ', 'Strategies: ') + list.length + L(' из ', ' of ') + all.length,
        filtered() ? h('button', { type: 'button', onclick: reset }, L('Сбросить фильтры', 'Reset filters')) : null])
    ]);
    if (!list.length) {
      return frag([bar, all.length
        ? emptyBox(L('Под фильтры ничего не подошло', 'Nothing matches the filters'), L('Ослабьте фильтры: например, бюджет «любой» или все механики.', 'Loosen the filters: for example, any budget or all mechanics.'), [h('button', { type: 'button', class: 'btn', onclick: reset }, L('Сбросить фильтры', 'Reset filters'))])
        : emptyBox(L('Каталог пока пуст', 'The catalog is empty for now'), L('Первые стратегии появятся с лигой 3.30. Свою можно создать в приложении и прислать нам.', 'The first strategies arrive with league 3.30. You can create your own in the app and send it to us.'), [h('a', { class: 'btn', href: '#add' }, L('Как добавить свою', 'How to add yours'))])]);
    }
    var grid = h('div', { class: 'st-grid' }, list.map(function (r) {
      var s = r.it.strategy, href = 'view.html' + location.search + '#' + r.it.code;
      return h('article', { class: 'st-card' }, [
        h('div', { class: 'st-card__head' }, [h('span', { class: 'st-mech' }, ic(mechOf(s) || 'map')), h('div', null, [h('h3', null, h('a', { href: href }, T(s.name))), tags(s, r.it.kind)])]),
        h('p', { class: 'st-card__sum' }, T(s.summary)),
        facts(s, r.inc, false),
        trust(s, r.it.kind, r.it.checked),
        h('div', { class: 'st-card__act' }, [h('a', { class: 'btn btn--sm btn--primary', href: href }, L('Открыть', 'Open')), copyBtn(s.id, r.it.code, true)])
      ]);
    }));
    return frag([bar, grid]);
  }

  // ------------------------------------------------------------------ просмотр по ссылке
  function fail(why) {
    var t = {
      nocode: [L('В ссылке нет стратегии', 'There’s no strategy in this link'), L('Ссылка на стратегию заканчивается на #POETH1:… — похоже, она скопировалась не целиком. Попросите автора прислать её ещё раз.', 'A strategy link ends with #POETH1:… — it looks like it wasn’t copied in full. Ask the author to send it again.')],
      broken: [L('Код повреждён или обрезан', 'The code is damaged or cut off'), L('Скопировалась не вся ссылка — так бывает в чате игры и в некоторых мессенджерах. Попросите автора прислать ссылку ещё раз или скопируйте код из приложения.', 'Not the whole link was copied — this happens in game chat and some messengers. Ask the author to send the link again or copy the code from the app.')],
      notcode: [L('Это не код POETH', 'This isn’t a POETH code'), L('После # в ссылке должен стоять код, который начинается с POETH1:.', 'After # the link should have a code that starts with POETH1:.')],
      newer: [L('Код из новой версии POETH', 'A code from a newer POETH'), L('Эту стратегию сделали в более новой версии приложения. Обновите страницу позже или откройте её в обновлённом POETH.', 'This strategy was made in a newer version of the app. Reload the page later or open it in an updated POETH.')],
      toolarge: [L('Код слишком большой', 'The code is too large'), L('Такую стратегию не раскрыть: код больше допустимого. Попросите автора проверить её в приложении.', 'This strategy can’t be opened: the code is larger than allowed. Ask the author to check it in the app.')],
      invalid: [L('Код с ошибками в данных', 'The code has data errors'), L('Код раскрылся, но стратегия не прошла проверку — возможно, её правили вручную. Попросите автора скопировать код заново.', 'The code opened, but the strategy failed the check — maybe it was edited by hand. Ask the author to copy the code again.')]
    }[why] || [L('Не удалось открыть', 'Could not open'), ''];
    return emptyBox(t[0], t[1], [
      h('a', { class: 'btn btn--primary', href: './' + location.search }, L('Открыть каталог', 'Open the catalog')),
      h('a', { class: 'btn', href: REL }, [ic('download'), L('Скачать POETH', 'Download POETH')])
    ]);
  }
  function lines(list, input, inc, total) {
    var priced = inc.e ? (input ? inc.e.inputs : inc.e.outputs) : null;
    var rows = list.map(function (l, i) {
      var p = priced ? priced[i] : null;
      var right = l.own && input ? L('своя', 'own') : p ? (p.total === null ? L('нет цены', 'no price') : chaos(p.total)) : '';
      return h('li', null, [
        h('span', { class: 'n' }, [itemName(l.item), l.note ? h('small', null, T(l.note)) : null]),
        h('span', { class: 'q' }, '×' + num(l.qty, 2)),
        h('span', { class: 'p' }, right)
      ]);
    });
    if (total) rows.push(h('li', null, [h('span', { class: 'n tot' }, total[0]), h('span'), h('span', { class: 'p tot' }, total[1])]));
    return h('ul', { class: 'st-lines' }, rows);
  }
  function viewView() {
    if (view.state === 'loading') return h('p', { class: 'st-loading' }, L('Раскрываем код…', 'Decoding…'));
    if (view.state !== 'ok') return fail(view.state);
    var s = view.s, m = view.match, inc = income(s);
    document.title = T(s.name) + L(' — стратегия фарма POETH', ' — POETH farming strategy');
    var status = m
      ? h('div', { class: 'st-status st-status--ok' }, [ic('check'), h('b', null, L('В каталоге POETH', 'In the POETH catalog')), h('span', null, (m.kind === 'community' && s.source.author ? L('автор ', 'by ') + s.source.author + ' · ' : '') + (m.kind === 'official' ? L('стратегия команды POETH', 'by the POETH team') : L('проверена ', 'tested ') + date(m.checked)))])
      : h('div', { class: 'st-status st-status--warn' }, [ic('warn'), h('b', null, L('Не проверена', 'Not checked')), h('span', null, L('Стратегия по ссылке, мы её не проверяли: числа — оценка автора', 'A strategy from a link; we haven’t checked it: the numbers are the author’s estimate') + (s.source.author ? ' (' + s.source.author + ')' : '') + '.')]);
    var openBtn = h('a', { class: 'btn btn--primary btn--xl', href: 'poeth-strategy://import#' + view.code, onclick: openInApp }, L('Открыть в POETH', 'Open in POETH'));
    var inTot = inc.e ? (inc.e.cost === null ? L('нет цены', 'no price') : chaos(inc.e.cost)) : null;
    var outTot = inc.e ? (inc.e.income === null ? L('нет цены', 'no price') : (inc.e.incomePartial ? '≥ ' : '') + chaos(inc.e.income)) : null;
    var tree = null;
    if (s.atlasTree) {
      var host = '';
      try { host = new URL(s.atlasTree).hostname.replace(/^www\./, ''); } catch (e) { host = ''; }
      tree = h('p', { class: 'st-p st-tree' }, [h('a', { href: s.atlasTree, rel: 'noopener noreferrer nofollow', target: '_blank', referrerpolicy: 'no-referrer' }, [ic('external'), L('Дерево атласа', 'Atlas tree')]), ' · ' + host]);
    }
    return frag([
      status,
      h('header', { class: 'st-vhead' }, [h('span', { class: 'st-mech st-mech--lg' }, ic(mechOf(s) || 'map')), h('div', null, [
        h('p', { class: 'eyebrow' }, 'Path of Exile 1 · ' + L('стратегия фарма', 'farming strategy')),
        h('h1', null, T(s.name)), h('p', { class: 'lead' }, T(s.summary)), tags(s, m ? m.kind : 'imported')
      ])]),
      h('div', { class: 'st-actions' }, [openBtn, copyBtn('view', view.code, false), h('a', { class: 'btn', href: REL }, [ic('download'), L('Скачать POETH', 'Download POETH')])]),
      h('p', { class: 'st-note' }, L('«Открыть в POETH» покажет окно импорта в приложении: там вы увидите стратегию по своим живым ценам и решите, добавлять ли её. Сама она не добавится.', '“Open in POETH” shows the import window in the app: you’ll see the strategy at your live prices and decide whether to add it. Nothing is added by itself.')),
      h('div', { class: 'st-hint' + (st.tried ? '' : ' st-hidden') }, [ic('help'), h('span', null, L('Ничего не открылось? Установите POETH — или скопируйте код и вставьте его во вкладке «Что фармить» → «Импорт». В portable-версии ссылки не открываются — только код.', 'Nothing opened? Install POETH — or copy the code and paste it in What to farm → Import. The portable version doesn’t open links — use the code.'))]),
      facts(s, inc, true),
      trust(s, m ? m.kind : 'imported', m ? m.checked : null),
      h('div', { class: 'st-io' }, [
        h('section', { class: 'st-box' }, [h('h2', null, L('Что вложить за карту', 'What to put in per map')), lines(s.inputs, true, inc, inTot !== null ? [L('Вход', 'Entry'), inTot] : null)]),
        h('section', { class: 'st-box' }, [h('h2', null, L('Что получите за карту', 'What you get per map')), lines(s.outputs, false, inc, outTot !== null ? [L('Добыча', 'Loot'), outTot] : null)])
      ]),
      h('section', { class: 'st-box' }, [h('h2', null, L('Почему это выгодно', 'Why it pays')), h('p', { class: 'st-p' }, T(s.why))]),
      h('div', { class: 'st-io' }, [
        h('section', { class: 'st-box' }, [h('h2', null, L('Что делать', 'What to do')), h('ol', { class: 'st-ol' }, s.steps.map(function (t) { return h('li', null, h('span', null, T(t))); }))]),
        h('section', { class: 'st-box' }, [
          h('h2', null, L('На атласе', 'On the Atlas')),
          s.atlas.length ? h('ul', { class: 'st-lines' }, s.atlas.map(function (t) { return h('li', null, h('span', { class: 'n' }, T(t))); })) : h('p', { class: 'st-p' }, L('Автор не указал ветки атласа.', 'The author listed no Atlas branches.')),
          tree,
          h('h2', null, L('Что нужно билду', 'What your build needs')),
          h('p', { class: 'st-p' }, buildText(s) + (s.build.note ? '. ' + T(s.build.note) : '.'))
        ])
      ]),
      s.warnings.length ? h('p', { class: 'st-warn' }, [h('b', null, L('Осторожно. ', 'Watch out. ')), s.warnings.map(T).join(' ')]) : null,
      h('p', { class: 'st-codeline' }, [ic('shield'), h('span', null, L('Код POETH1 · ', 'POETH1 code · ') + num(view.code.length, 0) + L(' символов · раскрыт в вашем браузере, на сервер не отправлялся.', ' characters · decoded in your browser, never sent to a server.')), copyBtn('view2', view.code, true)])
    ]);
  }
  function openInApp() {
    // ссылка протокола открывает POETH сам браузер (по умолчанию переход по href); если окно не потеряло
    // фокус за 2 с — скорее всего, POETH не установлен или это portable: подсказка «скопируйте код»
    var blurred = false;
    var onBlur = function () { blurred = true; };
    window.addEventListener('blur', onBlur);
    setTimeout(function () {
      window.removeEventListener('blur', onBlur);
      if (!blurred && !document.hidden) { st.tried = true; render(); }
    }, 2000);
  }
  function decodeHash() {
    var hash = location.hash.slice(1);
    if (!hash) { view.state = 'nocode'; render(); return; }
    view.state = 'loading';
    render();
    P.decode(hash).then(function (r) {
      if (!r.ok) { view.state = r.error === 'empty' ? 'nocode' : r.error; render(); return; }
      view.state = 'ok'; view.s = r.strategy; view.code = r.code; view.match = matchCatalog(r.strategy);
      render();
    });
  }
  function matchCatalog(s) {
    if (!data.catalog) return null;
    var fp = P.fingerprint(s);
    for (var i = 0; i < data.catalog.strategies.length; i++) {
      var it = data.catalog.strategies[i];
      if (P.fingerprint(it.strategy) === fp) return it;
    }
    return null;
  }

  // ------------------------------------------------------------------ данные и отрисовка
  function getJson(url) {
    return fetch(url, { credentials: 'omit', cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  }
  function loadCatalog() {
    return getJson('catalog.json').then(function (c) {
      // каталог — свой файл, но проверяем тем же валидатором: битая запись не показывается
      c.strategies = (c.strategies || []).filter(function (it) {
        var res = P.validateStrategy(it.strategy);
        if (res.ok) it.strategy = res.strategy;
        return res.ok && typeof it.code === 'string' && it.code.indexOf(P.CODE_PREFIX) === 0;
      });
      data.catalog = c;
    }).catch(function () { data.error = true; });
  }
  function loadNames() {
    if (lang() !== 'ru' || data.names) return Promise.resolve();
    return getJson('names-ru.json').then(function (n) { data.names = n; }).catch(function () { data.names = {}; });
  }
  function loadPrices() {
    if (!data.catalog || data.catalog.prices !== 'prices.json') return Promise.resolve();
    return getJson('prices.json').then(function (p) {
      if (!p || !Array.isArray(p.items) || !p.items.length) return;
      data.prices = p.items.filter(function (e) { return e && typeof e.name === 'string' && typeof e.chaos === 'number' && isFinite(e.chaos) && e.chaos > 0; });
      data.pricesDate = typeof p.label === 'object' && p.label ? (lang() === 'ru' ? p.label.ru : p.label.en) : String(p.date || '').slice(0, 10);
    }).catch(function () { data.prices = null; });
  }
  function render() {
    var el = document.getElementById('st-root');
    if (!el) return;
    el.replaceChildren(page === 'catalog' ? catalogView() : viewView());
    if (page === 'catalog') document.title = L('Стратегии фарма — POETH', 'Farming strategies — POETH');
  }
  function setLang(l) {
    root.lang = l;
    root.setAttribute('data-lang', l);
    document.querySelectorAll('[data-set-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === l)); });
    try { localStorage.setItem('poeth-lang', l); } catch (e) { /* приватный режим */ }
    loadNames().then(render);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-set-lang]');
    if (b) setLang(b.getAttribute('data-set-lang'));
  });

  if (!P) {
    var el = document.getElementById('st-root');
    if (el) el.replaceChildren(h('p', { class: 'st-loading' }, L('Не загрузился скрипт страницы. Обновите страницу.', 'The page script did not load. Reload the page.')));
    return;
  }
  setLang(lang());
  Promise.all([loadCatalog().then(loadPrices), loadNames()]).then(function () {
    if (page === 'view') {
      decodeHash();
      window.addEventListener('hashchange', function () { st.tried = false; decodeHash(); });
    } else render();
  });
})();
