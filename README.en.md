<p align="right"><a href="README.md">Русский</a> · <b>English</b></p>

<h1 align="center">
  <img src="resources/brand/mark.svg" width="96" alt=""><br>
  POE Trade Helper (POETH)
</h1>

<p align="center">A trade helper for Path of Exile 1 and 2 on top of the game: hover an item, press <code>Ctrl+D</code> and see a fair price.</p>

<p align="center">
  <a href="https://github.com/MAYZOSUPER/POETH/releases/latest"><img src="https://img.shields.io/github/v/release/MAYZOSUPER/POETH" alt="Latest release"></a>
  <a href="https://github.com/MAYZOSUPER/POETH/releases"><img src="https://img.shields.io/github/downloads/MAYZOSUPER/POETH/total" alt="Total downloads"></a>
  <a href="https://boosty.to/twistedthreadstudios"><img src="https://img.shields.io/badge/Boosty-support-f15f2c" alt="Boosty"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/MAYZOSUPER/POETH" alt="MIT License"></a>
</p>

<h2 align="center"><a href="https://github.com/MAYZOSUPER/POETH/releases/latest">⬇ Download for Windows</a></h2>

## How to install

1. Download **`POETH-Setup-<version>.exe`** from the [latest release](https://github.com/MAYZOSUPER/POETH/releases/latest).
2. Run it and click “Next” — POETH installs into your user folder, no administrator rights needed.
3. Keep “Run POETH” checked: the first-run wizard helps you pick the language and the game. Set the game to
   **Windowed** or **Windowed Fullscreen**.

Windows showed “Windows protected your PC”? Click **“More info” → “Run anyway”**.

No install: `POETH-Portable-<version>.exe` runs right away; download new versions yourself.

## Features

<table>
  <tr>
    <td align="center" width="50%"><img src="docs/img/price-en.jpg" width="300" alt="Price check at the cursor"><br>Price check at the cursor</td>
    <td align="center" width="50%"><img src="docs/img/deals-en.jpg" width="300" alt="Trade cards"><br>Trade cards over the game</td>
  </tr>
  <tr>
    <td align="center"><img src="docs/img/trade-en.png" alt="Trade window with favorites"><br>Trade window with favorites</td>
    <td align="center"><img src="docs/img/regex-en.png" alt="Regex strings"><br>Regex strings for your stash</td>
  </tr>
</table>

<sub>Pictures are from the UI mockups; in-game screenshots will come later.</sub>

- **`Ctrl+D` price check** with a “fair price”: no bait or stale listings, plus “why this price”.
- **English and Russian game client**, RU/EN interface; a simple mode for newcomers and an expert mode.
- **In-game trade window** — the official trade site plus your favorites: folders, Better Trading import.
- **Live search** — new listings pop up over the game; “Whisper” pastes the message into chat.
- **Regex strings** for stash search: maps, vendor, your own library on hotkeys.
- **Trade manager**: incoming and outgoing trade cards, stash cell highlight, PoE Hub blacklist.
- **Chat commands on hotkeys**: `F5` — hideout, your own commands and `@last` — the last person you talked to.
- **PoE 2**: campaign tracker (quests, rewards, zone layouts, “What's next?”) and item price check.

## Safety

- Open source: everything POETH does is in this repository.
- You sign in only on the official GGG page inside the trade window; the app never sees or stores your password.
- Your data goes nowhere. No bots, auto-buying or auto-messages: one player action — one app action.

Official builds are only on this repository's [releases page](https://github.com/MAYZOSUPER/POETH/releases).

## Development

Build, checks and releasing — [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## Acknowledgments

- [Awakened PoE Trade](https://github.com/SnosMe/awakened-poe-trade) (MIT) — item parser, price-check filters and mod data.
- [RePoE](https://github.com/repoe-fork/repoe-fork) — open game data for regex strings.
- [Exile-UI](https://github.com/Lailloken/Exile-UI) (MIT) — PoE 2 campaign zone layouts.
- [Better Trading](https://github.com/exile-center/better-trading) (MIT) — favorites import/export format.
- [PoE Hub / ForbiddenTroveBlacklist](https://github.com/The-Forbidden-Trove/ForbiddenTroveBlacklist) (MIT) — trade blacklist.

Details — [NOTICE.md](NOTICE.md). POETH is licensed under [MIT](LICENSE), © POETH contributors.

## Support the project

POETH is free and ad-free; you can support development on [Boosty](https://boosty.to/twistedthreadstudios) — a subscription unlocks nothing, everything is for everyone.

---

<sub>POE Trade Helper is an unofficial fan-made tool, not affiliated with or endorsed by Grinding Gear Games; Path of Exile and all assets © Grinding Gear Games.</sub>
