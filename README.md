<p align="right"><b>Русский</b> · <a href="README.en.md">English</a></p>

<h1 align="center">
  <img src="resources/brand/mark.svg" width="96" alt=""><br>
  POE Trade Helper (POETH)
</h1>

<p align="center">Помощник по трейду для Path of Exile 1 и 2 поверх игры: наведите курсор на предмет, нажмите <code>Ctrl+D</code> — и увидите честную цену.</p>

<p align="center">
  <a href="https://github.com/MAYZOSUPER/POETH/releases/latest"><img src="https://img.shields.io/github/v/release/MAYZOSUPER/POETH?label=%D1%80%D0%B5%D0%BB%D0%B8%D0%B7" alt="Последний релиз"></a>
  <a href="https://github.com/MAYZOSUPER/POETH/releases"><img src="https://img.shields.io/github/downloads/MAYZOSUPER/POETH/total?label=%D1%81%D0%BA%D0%B0%D1%87%D0%B8%D0%B2%D0%B0%D0%BD%D0%B8%D0%B9" alt="Всего скачиваний"></a>
  <a href="https://boosty.to/twistedthreadstudios"><img src="https://img.shields.io/badge/Boosty-%D0%BF%D0%BE%D0%B4%D0%B4%D0%B5%D1%80%D0%B6%D0%B0%D1%82%D1%8C-f15f2c" alt="Boosty"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/MAYZOSUPER/POETH?label=%D0%BB%D0%B8%D1%86%D0%B5%D0%BD%D0%B7%D0%B8%D1%8F" alt="Лицензия MIT"></a>
</p>

<h2 align="center"><a href="https://github.com/MAYZOSUPER/POETH/releases/latest">⬇ Скачать для Windows</a></h2>

## Как установить

1. Скачайте **`POETH-Setup-<версия>.exe`** со страницы [последнего релиза](https://github.com/MAYZOSUPER/POETH/releases/latest).
2. Запустите его и нажмите «Далее» — POETH встанет в вашу папку пользователя, права администратора не нужны.
3. Оставьте галочку «Запустить POETH»: мастер первого запуска поможет выбрать язык и игру. В игре включите
   режим **«Окно»** или **«Окно без рамки»**.

Windows показал «Система Windows защитила ваш компьютер»? Нажмите **«Подробнее» → «Выполнить в любом случае»**.

Без установки — `POETH-Portable-<версия>.exe`: запускается сразу, новые версии скачиваются вручную.

## Возможности

<table>
  <tr>
    <td align="center" width="50%"><img src="docs/img/price-ru.jpg" width="300" alt="Окно цены у курсора"><br>Окно цены у курсора</td>
    <td align="center" width="50%"><img src="docs/img/deals-ru.jpg" width="300" alt="Карточки сделок"><br>Карточки сделок поверх игры</td>
  </tr>
  <tr>
    <td align="center"><img src="docs/img/trade-ru.png" alt="Трейд-окно с избранным"><br>Трейд-окно с избранным</td>
    <td align="center"><img src="docs/img/regex-ru.png" alt="Regex-строки"><br>Regex-строки для тайника</td>
  </tr>
</table>

<sub>Картинки — из макетов интерфейса; скриншоты из игры появятся позже.</sub>

- **Прайс-чек по `Ctrl+D`** с «честной ценой»: без приманок и устаревших лотов, подсказка «почему такая цена».
- **Русский и английский клиент** игры, интерфейс на RU/EN; простой режим для новичков и экспертный.
- **Трейд-окно прямо в игре** — официальный сайт трейда и ваше избранное: папки, импорт из Better Trading.
- **Live search** — новые лоты приходят уведомлением поверх игры, «Написать» вставляет сообщение в чат.
- **Regex-строки** для поиска в тайнике: карты, торговец, своя библиотека на горячих клавишах.
- **Менеджер сделок**: карточки входящих и исходящих сделок, подсветка ячейки тайника, чёрный список PoE Hub.
- **Команды чата по клавишам**: `F5` — в убежище, свои команды и `@last` — последний собеседник.
- **PoE 2**: трекер кампании (квесты, награды, лейауты зон, «Что дальше?») и прайс-чек предмета.

## Безопасность

- Открытый код: всё, что делает POETH, видно в этом репозитории.
- Вход в аккаунт — только на официальной странице GGG внутри трейд-окна; пароль приложение не видит и не хранит.
- Ваши данные никуда не уходят. Никаких ботов, авто-покупок и авто-сообщений: одно действие игрока — одно
  действие программы.

Официальные сборки — только на странице [релизов этого репозитория](https://github.com/MAYZOSUPER/POETH/releases).

## Разработка

Сборка, проверки и выпуск релиза — [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Благодарности

- [Awakened PoE Trade](https://github.com/SnosMe/awakened-poe-trade) (MIT) — парсер предметов, фильтры прайс-чека и данные модов.
- [RePoE](https://github.com/repoe-fork/repoe-fork) — открытые данные игры для regex-строк.
- [Exile-UI](https://github.com/Lailloken/Exile-UI) (MIT) — лейауты зон кампании PoE 2.
- [Better Trading](https://github.com/exile-center/better-trading) (MIT) — формат импорта и экспорта избранного.
- [PoE Hub / ForbiddenTroveBlacklist](https://github.com/The-Forbidden-Trove/ForbiddenTroveBlacklist) (MIT) — чёрный список для сделок.

Подробно — в [NOTICE.md](NOTICE.md). Лицензия POETH — [MIT](LICENSE), © POETH contributors.

## Поддержать проект

POETH бесплатный и без рекламы; поддержать разработку можно на [Boosty](https://boosty.to/twistedthreadstudios) — подписка не открывает функций, всё доступно каждому.

---

<sub>POE Trade Helper — неофициальный фанатский инструмент, не связан с Grinding Gear Games и не одобрен ими; Path of Exile и все ассеты © Grinding Gear Games.</sub>
