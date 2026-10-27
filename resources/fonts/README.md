# Шрифты POETH

Все шрифты под SIL Open Font License 1.1 (текст лицензии лежит рядом с каждым файлом). Зарезервированных имён
(Reserved Font Name) у них нет. Файлы взяты без изменений из [google/fonts](https://github.com/google/fonts)
(`ofl/<семейство>/`, ветка `main`, 28.10.2026), переименованы только сами файлы.
Подключаются локально из `src/renderer/src/styles/fonts.css`, без CDN.

| Файл | Семейство | Где используется | Лицензия |
|---|---|---|---|
| `CormorantSC-Bold.ttf` | Cormorant SC, 700 | заголовки окон, имена предметов, крупные вкладки (`--font-display`) | `CormorantSC-OFL.txt` |
| `GolosText-Variable.ttf` | Golos Text, 400–900 | весь интерфейс (`--font-ui`), есть табличные цифры `tnum` | `GolosText-OFL.txt` |
| `JetBrainsMono-Variable.ttf` | JetBrains Mono, 100–800 | regex-строки, пути, id (`--font-mono`) | `JetBrainsMono-OFL.txt` |

Все три с полной кириллицей, включая «ё» и «₽». Прежний шрифт заголовков компаса, Cinzel, кириллицы не содержит
(в русском интерфейсе заголовки подменялись на Georgia), поэтому заменён на Cormorant SC.
