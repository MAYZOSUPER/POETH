// Вход в аккаунт pathofexile.com (изолированная сессия persist:poe-account) — заполняет этап S3.
// TODO S3: AuthStatus (logged-out / logged-in{account} / cloudflare / error) и событие смены статуса.
// ВАЖНО: POESESSID и любые cookies никогда не попадают в renderer — только статус.

export {}
