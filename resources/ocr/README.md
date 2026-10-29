# OCR стакана «Рыночный курс» (S28)

Файлы распознавателя цифр для чтения таблицы «Курс / Кол-во» (Alt над «Рыночным курсом» в окне обмена валюты).
Работают локально, в сеть ничего не уходит и ничего не скачивается. При загрузке `src/main/ocr/engine.ts`
сверяет SHA-256 каждого файла — подменённый или повреждённый файл не загрузится.

| Файл | Откуда | Лицензия |
|---|---|---|
| `tesseract-core-simd-lstm.js`, `tesseract-core-simd-lstm.wasm` | [tesseract.js-core](https://github.com/naptha/tesseract.js-core) 6.1.2 (npm), без изменений | Apache-2.0 (`LICENSE-tesseract.txt`) |
| `eng.traineddata` | [@tesseract.js-data/eng](https://github.com/naptha/tessdata) 1.0.0, `4.0.0_best_int` (модель [tessdata_best](https://github.com/tesseract-ocr/tessdata_best), целочисленная), распакована из `.gz` | Apache-2.0 |

Обновление: заменить файлы и хэши в `OCR_FILES` (`src/main/ocr/engine.ts`), прогнать `npx vitest run tests/ocr`.
