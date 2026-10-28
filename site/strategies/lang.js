// Язык до первой отрисовки — как на главной: ?lang= → сохранённый выбор → язык браузера (ru, be, kk → RU).
// Отдельным файлом, а не в <script> внутри страницы: у страниц «Стратегии» строгая CSP без встроенных скриптов.
(function () {
  var l = 'en', q = /[?&]lang=(ru|en)\b/.exec(location.search), s = null;
  try { s = localStorage.getItem('poeth-lang'); } catch (e) { /* приватный режим */ }
  if (q) l = q[1];
  else if (s === 'ru' || s === 'en') l = s;
  else {
    var a = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
    for (var i = 0; i < a.length; i++) {
      var x = String(a[i]).toLowerCase();
      if (/^(ru|be|kk)\b/.test(x)) { l = 'ru'; break; }
      if (/^en\b/.test(x)) break;
    }
  }
  document.documentElement.lang = l;
  document.documentElement.setAttribute('data-lang', l);
})();
