# Подпись кода POETH — SignPath Foundation

Без подписи Windows SmartScreen показывает «Система Windows защитила ваш компьютер», и игроку приходится
нажимать «Подробнее → Выполнить в любом случае». SignPath Foundation бесплатно подписывает open source
проекты (так подписан, например, PoE Overlay). Заявку подаёт владелец репозитория сам — здесь что нужно
подготовить, что заполнить и как потом подключить подпись в CI.

Источники (проверено 28.10.2026): [signpath.org](https://signpath.org/), условия —
[signpath.org/terms](https://signpath.org/terms), заявка — [signpath.org/apply](https://signpath.org/apply),
GitHub Actions — [docs.signpath.io/trusted-build-systems/github](https://docs.signpath.io/trusted-build-systems/github).
Условия могут меняться — перед заявкой перечитайте страницу условий.

## Как это устроено

- Сертификат выдаётся **SignPath Foundation**, не проекту: в окне Windows издателем будет «SignPath
  Foundation». Своего сертификата у проекта не будет (SignPath — не удостоверяющий центр).
- Ключ хранится в HSM SignPath; подписывают сервисы SignPath.io по запросу из CI.
- Личность не подтверждается (документы не нужны) — вместо этого SignPath проверяет, что бинарник
  собран автоматически из открытого репозитория.
- Каждый релиз подписывается после **ручного одобрения** (роль «Approver») в SignPath.

## Условия (что проверить до заявки)

| Требование SignPath | POETH |
|---|---|
| Все компоненты под OSI-лицензией, без коммерческого двойного лицензирования | ✅ MIT (`LICENSE`); сторонний код и данные — MIT/OFL, перечислены в `NOTICE.md` |
| Нет проприетарных компонентов (системные библиотеки можно) | ✅ Electron и npm-зависимости — open source; проверить `NOTICE.md` перед заявкой |
| Нет вредоносного ПО и PUP | ✅ ни ботов, ни авто-действий: одно действие игрока — одно действие программы |
| Проект поддерживается | ✅ |
| Подписывается уже выпущенная версия | ⚠️ первый релиз v0.1.0 выйдет без подписи; заявку подавать после него |
| Функции описаны на странице загрузки | ✅ README («Что умеет») и описание релиза |
| Бинарники собираются автоматически из репозитория | ✅ `.github/workflows/release.yml` (тег `v*` → сборка на windows-latest) |
| Установщику соответствует удаление | ✅ NSIS-деинсталлятор («Приложения» Windows) |
| Имя продукта = имя проекта, одна версия во всех файлах | ✅ productName `POETH`, версия из `package.json` |
| MFA у всех участников (GitHub и SignPath) | ⚠️ включить двухфакторную аутентификацию на GitHub-аккаунте до заявки |
| Программа, которая сама отправляет данные в сети, которые пользователь не указывал: политика конфиденциальности, показ при установке, возможность отключить | ⚠️ см. «Приватность» ниже |

### Приватность — что сделать до заявки

POETH сам (без нажатия игрока) обращается только к публичным адресам, личных данных не отправляет:

- GitHub — проверка новой версии (`github.com/MAYZOSUPER/POETH/releases`) и пакета данных игры
  (`raw.githubusercontent.com/MAYZOSUPER/POETH/data/…`) — выключается флажком «Проверять обновления»;
- `pathofexile.com` — список лиг и справочник модов трейда (`data/stats`, раз в сутки), запросы прайс-чека и
  live search — по действию игрока;
- `raw.githubusercontent.com/The-Forbidden-Trove/…` — чёрный список PoE Hub для «Сделок» (раз в сутки).

Чего не хватает до требований SignPath:

1. Страница «Политика конфиденциальности» (`PRIVACY.md`, RU/EN) — список выше, без телеметрии.
2. Показ при установке — например, страница лицензии NSIS (`nsis.license` в `electron-builder.yml`)
   с текстом MIT + кратко о приватности.
3. Отключение — для обновлений есть; для списка лиг/модов и чёрного списка PoE Hub — решить, нужен ли
   флажок «Не скачивать справочники» (без них прайс-чек хуже), либо достаточно формулировки в политике,
   что это часть функций, которые пользователь включает сам. Уточнить у SignPath в заявке.

### Раздел «Code signing policy» (обязателен на сайте и в README)

После одобрения добавить в README (и на сайт) раздел с таким содержанием — формулировки SignPath дословно:

```markdown
## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

Team roles:
- Committers and reviewers: [members of the repository](https://github.com/MAYZOSUPER/POETH/graphs/contributors)
- Approvers: [owner](https://github.com/MAYZOSUPER)

Privacy policy: [PRIVACY.md](PRIVACY.md) — this program will not transfer any information to other networked
systems unless specifically requested by the user or the person installing or operating it.
```

Роли SignPath: **Authors** (коммитят без доп. ревью), **Reviewers** (смотрят каждый чужой PR — особенно
сборочные скрипты и CI), **Approvers** (одобряют каждый запрос на подпись). Для проекта из одного
владельца — все три роли у одного аккаунта; это нормально, но роли должны быть названы.

## Заявка — что заполнить

Форма — [signpath.org/apply](https://signpath.org/apply). Подготовьте:

- **Проект:** POE Trade Helper (POETH); репозиторий `https://github.com/MAYZOSUPER/POETH`; лицензия MIT.
- **Описание (EN, 2–3 предложения):** «Free open source trade helper overlay for Path of Exile 1 and 2
  (Windows, Electron): item price check, in-game trade window, live search notifications, regex strings,
  trade manager. Fan-made, not affiliated with Grinding Gear Games. No bots or automation — one user
  action = one app action.»
- **Страница загрузки:** `https://github.com/MAYZOSUPER/POETH/releases` (и сайт на GitHub Pages, когда будет).
- **Что подписываем:** `POETH-Setup-<версия>.exe` (NSIS) и `POETH-Portable-<версия>.exe`, внутри — `POETH.exe`.
- **Сборка:** GitHub Actions, `.github/workflows/release.yml`, runner `windows-latest`, по тегу `v*`.
- **Команда и роли:** владелец репозитория — Author, Reviewer, Approver; MFA включена.
- **Ссылки на политики:** раздел «Code signing policy» и `PRIVACY.md` (подготовить до заявки).

После одобрения SignPath создаст организацию на SignPath.io; оттуда понадобятся: **organization id**,
**project slug**, **signing policy slug** (обычно `release-signing`), **artifact configuration** и
API-токен пользователя с правом отправки запросов.

## Подключение в CI (после одобрения)

Подпись делает GitHub Action `signpath/github-action-submit-signing-request` (сейчас `@v3`): артефакт сначала
загружается `actions/upload-artifact` (v4+), затем отправляется на подпись по его `artifact-id`, подписанный
файл скачивается обратно. SignPath сверяет, что артефакт собран этим запуском workflow из репозитория.

1. В репозитории: **Settings → Secrets → Actions** → `SIGNPATH_API_TOKEN`; в SignPath — подключить
   «trusted build system» GitHub.com к проекту.
2. Порядок в `release.yml` (две подписи, иначе `POETH.exe` внутри установщика останется без подписи):
   1. `npm run build` → `npx electron-builder --win --dir` — папка `dist-release/win-unpacked`;
   2. `actions/upload-artifact` этой папки → SignPath (artifact configuration: zip, подписать `POETH.exe`)
      → скачать подписанную папку;
   3. `npx electron-builder --win --prepackaged <подписанная папка> --publish never` — Setup и Portable;
   4. `actions/upload-artifact` двух exe → SignPath (подписать оба PE) → скачать;
   5. **пересчитать `latest.yml` и `.blockmap`** для подписанного Setup — подпись меняет файл, а
      electron-updater сверяет sha512 из `latest.yml` (иначе автообновление откажет):
      `node_modules/app-builder-bin/win/x64/app-builder.exe blockmap --input POETH-Setup-<v>.exe --output POETH-Setup-<v>.exe.blockmap`
      пишет новый blockmap и печатает JSON с `sha512` и `size` → записать их в `latest.yml` (оба места:
      `files[0]` и верхние `sha512`/`path`);
   6. опубликовать релиз (`gh release create v<v> --notes-file build/release-notes.md` + 4 файла) вместо
      `--publish always`.
3. Пример шага подписи (из документации SignPath):

```yaml
- name: upload unsigned
  id: upload-unsigned
  uses: actions/upload-artifact@v4
  with:
    name: unsigned-app
    path: dist-release/win-unpacked
- name: sign
  uses: signpath/github-action-submit-signing-request@v3
  with:
    api-token: ${{ secrets.SIGNPATH_API_TOKEN }}
    organization-id: <organization id>
    project-slug: poeth
    signing-policy-slug: release-signing
    github-artifact-id: ${{ steps.upload-unsigned.outputs.artifact-id }}
    wait-for-completion: true
    output-artifact-directory: dist-signed/win-unpacked
```

4. В `electron-builder.yml` после подписи можно добавить `win.signtoolOptions.publisherName: SignPath Foundation`
   (в electron-builder 25 `win.publisherName` устарел) — тогда electron-updater будет проверять издателя
   скачанного обновления. Включать только когда все релизы подписаны: неподписанное обновление
   установленная версия тогда отвергнет.

Пока подписи нет, SmartScreen предупреждает о каждой новой версии, пока у файла не наберётся репутация;
текст для игроков — в README («Windows показал предупреждение?»).
