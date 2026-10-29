// Сайт POETH: переключатель RU/EN. Начальный язык ставит скрипт в <head>, здесь — кнопки и метаданные.
(function () {
  var root = document.documentElement;
  var META = {
    ru: {
      title: 'POETH — оверлей для трейда в Path of Exile',
      desc: 'Бесплатный оверлей для трейда в Path of Exile 1 и 2: цена предмета по Ctrl+D прямо поверх игры, трейд-окно, live-поиск, сделки, обмен валюты, учёт богатства и гид прокачки. Русский и английский клиент.'
    },
    en: {
      title: 'POETH — trade overlay for Path of Exile',
      desc: 'A free trade overlay for Path of Exile 1 and 2: item prices with Ctrl+D right over the game, a trade window, live search, deals, currency exchange, wealth tracking and a leveling guide. Russian and English clients.'
    }
  };

  // У других страниц (гайд) свои заголовок и описание: data-ru / data-en у <title> и meta description.
  function apply(lang) {
    root.lang = lang;
    root.setAttribute('data-lang', lang);
    var t = document.querySelector('title');
    var d = document.querySelector('meta[name="description"]');
    document.title = (t && t.getAttribute('data-' + lang)) || META[lang].title;
    if (d) d.setAttribute('content', (d.getAttribute('data-' + lang)) || META[lang].desc);
    document.querySelectorAll('[data-set-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === lang));
    });
  }

  apply(root.getAttribute('data-lang') === 'en' ? 'en' : 'ru');

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-set-lang]');
    if (!b) return;
    var lang = b.getAttribute('data-set-lang');
    apply(lang);
    try { localStorage.setItem('poeth-lang', lang); } catch (err) { /* приватный режим — просто не запоминаем */ }
  });
})();
