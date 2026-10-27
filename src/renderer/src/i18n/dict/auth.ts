// Строки домена «вход в аккаунт и сеть» (S3): панель аккаунта, ошибки сети трейда.

import type { DomainDict } from '../types'

export const auth: DomainDict = {
  ru: {
    'auth.title': 'Аккаунт pathofexile.com',
    'auth.status.checking': 'Проверяем вход…',
    'auth.status.in': 'Вы вошли',
    'auth.status.inAs': 'Вы вошли как {name}',
    'auth.status.out': 'Не вошли',
    'auth.status.pasted': 'сессия из вставленного POESESSID',
    'auth.problem.network': 'Нет связи с pathofexile.com — вход не проверен.',
    'auth.problem.blocked':
      'Сайт просит пройти проверку Cloudflare. Нажмите «Войти» и пройдите её в открывшемся окне.',
    'auth.why':
      'Без входа работают прайс-чек, обмен, regex и сделки. Вход нужен для live search и whisper через сайт.',
    'auth.login': 'Войти',
    'auth.logout': 'Выйти',
    'auth.recheck': 'Проверить',
    'auth.safe':
      'Вход — только на официальной странице GGG в отдельном окне. Пароль вводите там; POETH его не видит и не хранит.',
    'auth.2fa': 'Включена двухфакторная защита (2FA)? Код вводится там же, на странице GGG.',
    'auth.steam':
      'Вход через Steam, Xbox или PlayStation в этом окне не поддерживается — войдите по почте и паролю GGG или вставьте POESESSID ниже.',
    'auth.logoutNote':
      '«Выйти» здесь удаляет сессию только из POETH. «Выйти» на сайте GGG завершает все сессии — после этого войдите в POETH заново.',
    'auth.paste.toggle': 'Вставить POESESSID (если вход в окне не получается)',
    'auth.paste.warn':
      'POESESSID — это ключ к вашему аккаунту. Никому его не передавайте: ни друзьям, ни «поддержке», ни в Discord. POETH хранит его зашифрованным только на этом ПК и отправляет только на pathofexile.com.',
    'auth.paste.how':
      'Где взять: войдите на pathofexile.com в браузере → F12 → Application (Приложение) → Cookies → pathofexile.com → значение POESESSID.',
    'auth.paste.placeholder': '32 символа: 0–9 и a–f',
    'auth.paste.save': 'Сохранить',
    'auth.paste.ok': 'Сессия сохранена — вы вошли.',
    'auth.paste.err.invalid-format': 'Это не похоже на POESESSID: нужно ровно 32 символа 0–9 и a–f.',
    'auth.paste.err.not-logged-in':
      'Сайт не узнал аккаунт по этому POESESSID — возможно, сессия устарела. Скопируйте свежий.',
    'auth.paste.err.network': 'Нет связи с pathofexile.com. Сессия сохранена, проверим позже.',
    'auth.paste.err.blocked':
      'Сайт просит пройти проверку Cloudflare. Сессия сохранена — нажмите «Войти» и пройдите проверку.',
    'net.err.rate-limited': 'Слишком много запросов к сайту — повторите через {sec} с.',
    'net.err.rate-limited.nosec': 'Слишком много запросов к сайту — подождите немного.',
    'net.err.blocked': 'Сайт просит пройти проверку Cloudflare — откройте трейд-окно и пройдите её.',
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
    'auth.title': 'pathofexile.com account',
    'auth.status.checking': 'Checking sign-in…',
    'auth.status.in': 'Signed in',
    'auth.status.inAs': 'Signed in as {name}',
    'auth.status.out': 'Not signed in',
    'auth.status.pasted': 'session from a pasted POESESSID',
    'auth.problem.network': 'No connection to pathofexile.com — sign-in not verified.',
    'auth.problem.blocked':
      'The site wants a Cloudflare check. Press “Sign in” and complete it in the window that opens.',
    'auth.why':
      'Price check, bulk exchange, regex and deals work without signing in. Sign-in is needed for live search and whispers via the site.',
    'auth.login': 'Sign in',
    'auth.logout': 'Sign out',
    'auth.recheck': 'Check',
    'auth.safe':
      'You sign in only on the official GGG page in a separate window. Type your password there; POETH never sees or stores it.',
    'auth.2fa': 'Two-factor authentication (2FA) on? Enter the code on the same GGG page.',
    'auth.steam':
      'Steam, Xbox or PlayStation sign-in is not supported in this window — use your GGG email and password, or paste a POESESSID below.',
    'auth.logoutNote':
      '“Sign out” here removes the session from POETH only. “Log out” on the GGG site ends all sessions — then sign in to POETH again.',
    'auth.paste.toggle': 'Paste a POESESSID (if signing in through the window fails)',
    'auth.paste.warn':
      'POESESSID is a key to your account. Never share it — not with friends, “support” or on Discord. POETH keeps it encrypted on this PC only and sends it only to pathofexile.com.',
    'auth.paste.how':
      'Where to find it: sign in on pathofexile.com in your browser → F12 → Application → Cookies → pathofexile.com → POESESSID value.',
    'auth.paste.placeholder': '32 characters: 0–9 and a–f',
    'auth.paste.save': 'Save',
    'auth.paste.ok': 'Session saved — you are signed in.',
    'auth.paste.err.invalid-format': 'That does not look like a POESESSID: exactly 32 characters 0–9 and a–f.',
    'auth.paste.err.not-logged-in':
      'The site did not recognise an account for this POESESSID — it may have expired. Copy a fresh one.',
    'auth.paste.err.network': 'No connection to pathofexile.com. The session is saved; we will check later.',
    'auth.paste.err.blocked':
      'The site wants a Cloudflare check. The session is saved — press “Sign in” and complete the check.',
    'net.err.rate-limited': 'Too many requests to the site — retry in {sec} s.',
    'net.err.rate-limited.nosec': 'Too many requests to the site — wait a moment.',
    'net.err.blocked': 'The site wants a Cloudflare check — open the trade window and complete it.',
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
