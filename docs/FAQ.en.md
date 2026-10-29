<p align="right"><a href="FAQ.md">Русский</a> · <b>English</b></p>

# POETH FAQ

- [POETH windows are not visible over the game](#poeth-windows-are-not-visible-over-the-game)
- [Ctrl+D does nothing](#ctrld-does-nothing)
- [The game is running as administrator](#the-game-is-running-as-administrator)
- [Windows says “Windows protected your PC”](#windows-says-windows-protected-your-pc)
- [Ctrl+D is already taken by Awakened PoE Trade](#ctrld-is-already-taken-by-awakened-poe-trade)
- [How to change hotkeys](#how-to-change-hotkeys)
- [No price, or “not recognized”](#no-price-or-not-recognized)
- [Why sign in to an account](#why-sign-in-to-an-account)
- [Can I get banned for using POETH](#can-i-get-banned-for-using-poeth)
- [Where settings are stored and how to remove everything](#where-settings-are-stored-and-how-to-remove-everything)
- [How to switch from the portable version to the installer](#how-to-switch-from-the-portable-version-to-the-installer)

## POETH windows are not visible over the game

In the game's graphics settings, choose **Windowed Fullscreen** or **Windowed**. In exclusive fullscreen, Windows
does not let other programs draw over the game, so POETH windows stay hidden. If the game is in fullscreen right
now, the first-run wizard tells you so.

## Ctrl+D does nothing

Check these in order:

1. **The game window is active.** In-game keys (`Ctrl+D`, `Alt+D`, `F5` and others) work only while you are in
   the game window. Click the game and press the key again.
2. **POETH is set to your game.** Switch between PoE 1 and PoE 2 in the POETH window header; POETH restarts after
   the switch.
3. **The cursor is over an item.** If it is not, POETH says “That does not look like a PoE 1 item”.
4. **The game is not running as administrator** — see the [next question](#the-game-is-running-as-administrator).
5. **`Ctrl+D` is not taken by another program** — see [Ctrl+D is already taken by Awakened PoE Trade](#ctrld-is-already-taken-by-awakened-poe-trade).

## The game is running as administrator

Windows does not let a regular program control a window that runs as administrator. So `Ctrl+D`, chat commands
and the “Whisper” buttons cannot reach the game. When POETH notices this, it warns: “Path of Exile is running as
administrator, but POETH is not.”

Do one of these:

- **simpler:** close the game and start it the normal way, not as administrator;
- or run POETH as administrator too: right-click the “POE Trade Helper” shortcut → “Run as administrator”.

## Windows says “Windows protected your PC”

That is the SmartScreen filter. Windows greets programs without a paid code-signing certificate this way, and
POETH does not have one. Click **More info**, then **Run anyway**.

POETH is open source, and the installer is built on GitHub from that code. Download POETH only from this
repository's [releases page](https://github.com/MAYZOSUPER/POETH/releases); do not trust copies from other sites.

## Ctrl+D is already taken by Awakened PoE Trade

Awakened PoE Trade (and Sidekick) also use `Ctrl+D` for item prices by default. If such a program is running,
POETH shows over the game: “Ctrl+D is taken by another program (maybe Awakened PoE Trade or Sidekick)”, with a
**Change key** button next to it.

Options:

- close the other program (including from the tray) — then `Ctrl+D` goes to POETH;
- or give POETH a different combination, for example `Ctrl+Shift+D`
  (see [How to change hotkeys](#how-to-change-hotkeys)).

Both programs cannot share one key: only one of them will react.

## How to change hotkeys

1. Open **Settings**: the gear in the POETH window header, or “Settings” in the tray icon menu.
2. In **Hotkeys**, click a combination and press a new one. `Esc` cancels, `✕` clears the combination,
   “Reset” restores all default keys.
3. Chat command keys (`F5` → `/hideout` and others) are in the **Chat commands** section of the same page.

You cannot pick combinations the game needs (item copy, chat, stash search) or Windows system shortcuts: POETH
tells you why. A plain letter needs `Ctrl` or `Alt`, otherwise it would get in the way of typing in chat.

Default keys:

| Action | Keys |
|---|---|
| Price of the item under the cursor | `Ctrl+D` |
| Turn on the overlay to click its buttons | `Shift+Space` |
| Trade window | `Ctrl+Shift+T` |
| Show or hide the POETH window | `Ctrl+Shift+O` |
| Click-through (all clicks go to the game) | `Ctrl+Shift+L` |
| Trades: invite / trade / close the card | `Alt+1` / `Alt+2` / `Alt+3` |
| Leveling guide: show or collapse | `Ctrl+Shift+G` |
| Exchange: read the “Market Ratio” table (beta) | `Alt+D` |
| Go to hideout (`/hideout`) | `F5` |

## No price, or “not recognized”

What the price window messages mean:

- **“That does not look like a PoE 1 item.”** The cursor was not over an item. Hover an item and press `Ctrl+D`
  again.
- **“This item is not in the data (new patch?).”** The item comes from a new league or patch that POETH's data
  does not cover yet. Data updates arrive without reinstalling: when the “Data updated” toast appears, restart
  POETH. “Check for updates” must be on in Settings (“Startup and updates”).
- **“not recognized” on a single mod.** That mod is not in the data, so it is left out of the search. The other
  mods are searched as usual.
- **“Unsupported client language.”** POETH reads the English and Russian game clients.
- **“Nobody is selling one like this.”** It does not mean the item is worthless. Uncheck some of the mods and
  press “Search again”, or use “Loosen by 10%”.
- **“Not enough data — the price is rough.”** There are few similar listings. Uncheck some mods to find more.
- **“The trade site asks us to wait.”** The site limits frequent requests. POETH retries by itself; your account
  is not at risk.
- **“The trade site wants a quick check.”** Open the trade window (`Ctrl+Shift+T`) and pass the check on the site.

## Why sign in to an account

Sign-in is needed for **live search** and for **Wealth** (POETH reads your stash tabs). The `Ctrl+D` price check,
regex, trades, Exchange, the map tracker and the leveling guide work without it.

You sign in only on the official pathofexile.com page inside the trade window. You type the password on the GGG
site; POETH never sees or stores it.

## Can I get banned for using POETH

Honestly: nobody can guarantee it. GGG does not review or endorse third-party tools, and nobody but GGG can
promise there will be no ban.

POETH follows the same rules as Awakened PoE Trade and similar helpers: **one key press from you is one action in
the game**. What POETH does:

- on `Ctrl+D` it copies the item text (like `Ctrl+C` in the game) and restores your clipboard;
- on a button or key it pastes one message or one command into chat. By default you press Enter yourself; with
  “Send immediately” on, one press sends one message;
- it reads the game log `Client.txt`: zones, level, trade whispers;
- on `Alt+D` it captures a small screen area at the cursor to read the “Market Ratio” table. The capture stays in
  memory and is not sent anywhere.

What POETH does not do: it does not read or change the game's memory, does not touch the game files, and never
clicks or buys anything by itself. No bots, no auto-buying.

## Where settings are stored and how to remove everything

- **POETH settings and data** are in `%APPDATA%\POETH`. To open it, press `Win+R`, paste `%APPDATA%\POETH` and
  press Enter. It holds settings, favorites, trade history, the regex library, the farming session, Wealth
  snapshots, the icon cache, updated game data, and the trade window sign-in.
- **The program itself** is in `%LOCALAPPDATA%\Programs\POETH` by default.

Uninstalling keeps the `%APPDATA%\POETH` folder, so a reinstall loses nothing.

To remove everything:

1. In POETH settings, under “Startup and updates”, turn off “Start with Windows”.
2. Close POETH: tray icon → “Quit”.
3. Uninstall the program: Windows Settings → Apps → Installed apps → “POE Trade Helper” → Uninstall. For the
   portable version, just delete the `POETH-Portable-….exe` file.
4. Delete the `%APPDATA%\POETH` folder. The account sign-in goes with it.
5. If it exists, delete `%LOCALAPPDATA%\poeth-updater`: it holds downloaded updates.

## How to switch from the portable version to the installer

The portable and installed versions keep settings in the same `%APPDATA%\POETH` folder, so there is nothing to
move: settings, favorites and the sign-in stay.

1. If “Start with Windows” was on in the portable version, turn it off.
2. Close the portable version: tray icon → “Quit”. Two copies of POETH cannot run at the same time.
3. Download and run `POETH-Setup-<version>.exe` from the [releases page](https://github.com/MAYZOSUPER/POETH/releases/latest).
4. You can delete `POETH-Portable-….exe`. If you want, turn on “Start with Windows” in the installed version.

The installed version updates itself: when a new one comes out, POETH offers to install it.

---

Didn't find an answer? Open an issue in the repository's [Issues](https://github.com/MAYZOSUPER/POETH/issues).
