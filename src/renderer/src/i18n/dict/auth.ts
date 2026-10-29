// Строки домена «вход в аккаунт и сеть» (S3): раздел «Аккаунт» в настройках (по макету),
// баннер «сайт просит пройти проверку», ошибки шлюза трейда для S4/S6.

import type { DomainDict } from '../types'

export const auth: DomainDict = {
  ru: {
    'auth.title': 'Аккаунт',
    'auth.checking': 'Проверяем вход…',
    'auth.in.title': 'Вы вошли на pathofexile.com',
    'auth.in.pasted': 'вставленный POESESSID',
    'auth.in.p1': 'Пароль вы вводили только на сайте GGG. POETH его не видит и не хранит.',
    'auth.in.p1.pasted': 'Сессия из вставленного POESESSID. Пароль POETH не видит и не хранит.',
    'auth.in.p2': 'Сессия зашифрована на этом компьютере и отделена от остальных окон приложения.',
    'auth.in.p3': 'Вход нужен для live search, «Богатства» (POETH только читает тайник) и чтобы пользоваться сайтом трейда в трейд-окне (кнопки сайта нажимаете вы сами).',
    'auth.logout': 'Выйти',
    'auth.logout.hint':
      '«Выйти» стирает сессию только в POETH. «Выйти» на сайте GGG завершает все ваши сессии — после этого войдите в POETH заново.',
    'auth.out.title': 'Вход не выполнен',
    'auth.out.p1': 'Прайс-чек, regex и сделки работают и без входа.',
    'auth.out.p2': 'Для live search и «Богатства» войдите на официальной странице сайта GGG — пароль вводится только там.',
    'auth.login': 'Войти на сайте GGG',
    'auth.openTrade': 'Открыть трейд-окно',
    'auth.login.hint':
      'Код двухфакторной защиты (2FA) вводится там же, на странице GGG. Вход через Steam тоже работает — кнопка Steam на этой странице. Через Xbox и PlayStation в окне войти нельзя — войдите по почте и паролю или вставьте POESESSID.',
    'auth.recheck': 'Проверить',
    'auth.net.title': 'Нет связи с pathofexile.com.',
    'auth.net.text': 'Вход не проверен — нажмите «Проверить», когда сеть появится.',
    'auth.cf.title': 'Сайт трейда просит пройти проверку.',
    'auth.cf.text.pricecheck': 'Откройте окно сайта и пройдите её там, после этого прайс-чек снова заработает.',
    'auth.cf.text.live': 'Откройте окно сайта и пройдите её там, после этого live search продолжит работу.',
    'auth.cf.text.account': 'Пройдите её в окне сайта GGG (отметьте «Я человек», если попросят), затем вход проверится сам.',
    'auth.cf.open': 'Открыть окно сайта',
    'auth.paste.open': 'Вставить POESESSID вручную',
    'auth.paste.title': 'Запасной путь. Никому не передавайте POESESSID: с ним можно войти в ваш аккаунт.',
    'auth.paste.warn.title': 'Никому не передавайте POESESSID.',
    'auth.paste.warn':
      'С ним можно войти в ваш аккаунт без пароля: не отправляйте его друзьям, «поддержке» и в Discord. POETH хранит его зашифрованным только на этом ПК и отправляет только на pathofexile.com.',
    'auth.paste.how':
      'Где взять: войдите на pathofexile.com в браузере → F12 → Application (Приложение) → Cookies → pathofexile.com → значение POESESSID.',
    'auth.paste.placeholder': '32 символа: 0–9 и a–f',
    'auth.paste.save': 'Сохранить',
    'auth.paste.cancel': 'Отмена',
    'auth.paste.err.invalid-format': 'Это не похоже на POESESSID: нужно ровно 32 символа 0–9 и a–f.',
    'auth.paste.err.not-logged-in':
      'Сайт не узнал аккаунт по этому POESESSID — возможно, сессия устарела. Скопируйте свежий.',
    'auth.paste.err.network': 'Нет связи с pathofexile.com. Сессия сохранена, проверим позже.',
    'auth.paste.err.blocked': 'Сайт просит пройти проверку. Сессия сохранена — откройте окно сайта и пройдите её.',
    'net.err.rate-limited':
      'Сайт трейда просит подождать: повторите через {sec} с. Аккаунту ничего не грозит — это защита сайта от частых запросов.',
    'net.err.rate-limited.nosec':
      'Сайт трейда просит подождать. Аккаунту ничего не грозит — это защита сайта от частых запросов.',
    'net.err.blocked': 'Сайт трейда просит пройти проверку — откройте окно сайта и пройдите её там.',
    'net.err.unauthorized': 'Нужен вход в аккаунт pathofexile.com.',
    'net.err.forbidden': 'Доступ запрещён сайтом трейда.',
    'net.err.not-found': 'Не найдено (поиск устарел или лига закончилась).',
    'net.err.bad-request': 'Сайт трейда отклонил запрос.',
    'net.err.server': 'Сайт трейда недоступен — попробуйте позже.',
    'net.err.network': 'Нет связи с pathofexile.com.',
    'net.err.bad-response': 'Непонятный ответ сайта трейда.',
    'net.retry': 'Повторить'
  },
  en: {
    'auth.title': 'Account',
    'auth.checking': 'Checking sign-in…',
    'auth.in.title': 'You are signed in to pathofexile.com',
    'auth.in.pasted': 'pasted POESESSID',
    'auth.in.p1': 'You typed your password only on the GGG site. POETH never sees or stores it.',
    'auth.in.p1.pasted': 'Session from a pasted POESESSID. POETH never sees or stores your password.',
    'auth.in.p2': 'The session is encrypted on this computer and isolated from other app windows.',
    'auth.in.p3': 'Sign-in is needed for live search, Wealth (POETH only reads your stash) and for using the trade site in the trade window (you press the site buttons yourself).',
    'auth.logout': 'Sign out',
    'auth.logout.hint':
      '“Sign out” erases the session in POETH only. “Log out” on the GGG site ends all your sessions — then sign in to POETH again.',
    'auth.out.title': 'Not signed in',
    'auth.out.p1': 'Price check, regex and trades work without signing in.',
    'auth.out.p2': 'For live search and Wealth, sign in on the official GGG site page — that is the only place you type your password.',
    'auth.login': 'Sign in on the GGG site',
    'auth.openTrade': 'Open trade window',
    'auth.login.hint':
      'The two-factor (2FA) code is entered on the same GGG page. Steam sign-in works too — use the Steam button on that page. Xbox and PlayStation sign-in does not work in the window — use your email and password, or paste a POESESSID.',
    'auth.recheck': 'Check',
    'auth.net.title': 'No connection to pathofexile.com.',
    'auth.net.text': 'Sign-in not verified — press “Check” once you are back online.',
    'auth.cf.title': 'The trade site wants a quick check.',
    'auth.cf.text.pricecheck': 'Open the site window and pass it there, then price check works again.',
    'auth.cf.text.live': 'Open the site window and pass it there, then live search continues.',
    'auth.cf.text.account': 'Pass it in the GGG site window (tick “I am human” if asked); sign-in is then re-checked automatically.',
    'auth.cf.open': 'Open site window',
    'auth.paste.open': 'Paste POESESSID manually',
    'auth.paste.title': 'Fallback only. Never share POESESSID: it gives access to your account.',
    'auth.paste.warn.title': 'Never share your POESESSID.',
    'auth.paste.warn':
      'It lets anyone into your account without a password: do not send it to friends, “support” or on Discord. POETH keeps it encrypted on this PC only and sends it only to pathofexile.com.',
    'auth.paste.how':
      'Where to find it: sign in on pathofexile.com in your browser → F12 → Application → Cookies → pathofexile.com → POESESSID value.',
    'auth.paste.placeholder': '32 characters: 0–9 and a–f',
    'auth.paste.save': 'Save',
    'auth.paste.cancel': 'Cancel',
    'auth.paste.err.invalid-format': 'That does not look like a POESESSID: exactly 32 characters 0–9 and a–f.',
    'auth.paste.err.not-logged-in':
      'The site did not recognise an account for this POESESSID — it may have expired. Copy a fresh one.',
    'auth.paste.err.network': 'No connection to pathofexile.com. The session is saved; we will check later.',
    'auth.paste.err.blocked': 'The site wants a quick check. The session is saved — open the site window and pass it.',
    'net.err.rate-limited':
      'The trade site asks us to wait: retry in {sec} s. Your account is safe — the site limits frequent requests.',
    'net.err.rate-limited.nosec':
      'The trade site asks us to wait. Your account is safe — the site limits frequent requests.',
    'net.err.blocked': 'The trade site wants a quick check — open the site window and pass it there.',
    'net.err.unauthorized': 'Sign in to your pathofexile.com account first.',
    'net.err.forbidden': 'Access denied by the trade site.',
    'net.err.not-found': 'Not found (the search expired or the league ended).',
    'net.err.bad-request': 'The trade site rejected the request.',
    'net.err.server': 'The trade site is unavailable — try again later.',
    'net.err.network': 'No connection to pathofexile.com.',
    'net.err.bad-response': 'Unexpected response from the trade site.',
    'net.retry': 'Retry'
  }
}
