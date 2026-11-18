# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

班表查詢: a static, zero-dependency web page (hosted on GitHub Pages) where a staff member picks a date, types their name, sees their shifts for that day, and exports them as an `.ics` file for the iPhone Calendar. UI text is Traditional Chinese (zh-Hant); keep it that way.

There is no build, lint, or test tooling. All page logic (HTML, CSS, JS) lives in `index.html`. Schedule data is encrypted: plaintext lives only in the git-ignored `private/` folder, and `node tools/encrypt.mjs` (Node built-ins only) writes the encrypted copies to `data/`.

## Running locally

`index.html` loads data with `fetch()`, so opening it via `file://` fails. Serve the folder instead:

```sh
python3 -m http.server 8000   # then open http://localhost:8000
```

## Data flow

- `private/YYYY-MM-DD.json` (git-ignored, plaintext) → one file per day: `{ date, weekday, source?, entries: [...] }`. Each entry: `name, shift, task, extra, start, end, hours, color, raw`, optional `note`.
- `tools/encrypt.mjs` reads the password from the git-ignored `.password` file and encrypts every `private/*.json` into `data/YYYY-MM-DD.json` as `{ v:1, iv, ct }` (AES-256-GCM). The key comes from PBKDF2-SHA256 with 600k iterations and one site-wide salt. The script then rewrites `data/index.json` as `{ dates, kdf:{salt,iter}, check:{iv,ct} }`. It reuses the existing salt and refuses to run if `.password` doesn't decrypt the existing `check`. `dates` is generated from the files in `private/`, so never edit it by hand. The site keeps only the last 30 days, including today in Taipei time (`KEEP_DAYS` in `encrypt.mjs`): older `private/` files are skipped and their `data/` copies are deleted, so a run can show deletions under `data/`. `private/` itself is never pruned.
- `index.html` `boot()`: loads `data/index.json`, then tries the password remembered in localStorage (`pw`) or shows the lock form. `tryPassword()` derives the key and decrypts `check`. `init()` runs only after unlock, and `loadDay()` decrypts each day file before use.
- Selected date and (if "記住這台裝置" is checked) the password are remembered in `localStorage` (wrapped in try/catch). 登出 clears the password. The name field is intentionally never remembered; it always starts empty.
- Never commit plaintext schedule data or the password. The repo and site are public, so `data/` must only ever contain encrypted files. Don't write the password into any committed file, including this one.

## Daily update workflow (from README)

The user runs `/deploy_schedule <image path>` (defined in `.claude/commands/deploy_schedule.md`, which holds the step-by-step procedure), or sends a photo of the paper schedule and says 「更新班表」. Transcribe it into a new `private/YYYY-MM-DD.json` and have the user check the transcription. The transcription runs in the `schedule-transcriber` sub agent (`.claude/agents/`): one agent per image, run in parallel. Each agent returns a review report, and the main conversation handles review and corrections. After the user approves, the `schedule-publisher` sub agent encrypts, checks that no name appears in `data/`, commits, pushes and waits for Pages. After the user approves, run `node tools/encrypt.mjs`, then commit `data/` and push; GitHub Pages redeploys in about a minute. There is no upload UI or server by design — keep it that way unless asked.

Transcription conventions:
- `start`/`end` are Taipei time, `HH:MM`. In the source, `'` means half past (`8'` = 08:30); afternoon hours are written in 12-hour form (`1'-4` = 13:30–16:00).
- `shift` is decided by `start`, not by the column the cell sits in: before 12:00 → 早班, 12:00–16:59 → 午班, 17:00 or later → 夜班. If that differs from the cell's column, add `原表在X班欄` to `note`. The UI colors cards by the first character of `shift` (午 → pm, 夜 → night, anything else → am).
- `color` is the cell's background in the original: `"yellow"` shows 🟡 and a yellow card. Any other value appears as a `<color>底` tag. Empty string means none.
- Transcribe `start`, `end` and `hours` exactly as the image shows. If the time range and the written hours disagree, keep both as written. Don't adjust either one, and don't ask the user about it.
- Characters come from OCR, structure from the image. Run the `ocr` skill (`.venv/bin/python .claude/skills/ocr/analyze.py <image>`, Azure AI Vision READ; endpoint and key in the git-ignored `.azure-vision.env`) and take names, tasks, doctor codes and `raw` text from its output. Read columns, colors, crossed-out and empty cells from the image. List low-confidence OCR words (marked 【】) in the review. If OCR fails, fall back to reading the image and say so.
- `raw` keeps the original cell text verbatim. Put extras such as `+開25` in `extra`.
- Keep names exactly as written, including unit names such as 觀察房 / OR. A surname-only multi-person cell like 「李+李」 refers to the people with that surname whose other cells that day share the same background color (e.g. the two people surnamed 李 whose other cells are yellow). Split it automatically only when the number of matches equals the number of people joined by 「+」: one entry per person, `note` 「原表姓名欄寫「李+李」（…）」, and name your pick in the review. If the count doesn't match (too many, too few, none), keep 「李+李」 as written, list the candidates in the review, and ask the user who it is before splitting.
- A cell that has a name but no time counts as a full day; add 「原表沒寫時間，視為整天」 to `note`. Saturday has no night shift, so a Saturday full day is 08:00–17:30 (start of 早班 to end of 午班). Full-day times for weekdays aren't defined yet: ask the user the first time it comes up, then add the answer here. Day-off and change notes starting with 「#」 (「#812改OFF」, 「#85改812」) aren't shifts; skip them. A night cell ending at 12 (e.g. `6-12`) means midnight: write `end` as `24:00`. A note row with an arrow and no name (e.g. 「↑整理送洗衣務」) belongs to the cell it points at: append it to that entry's `extra` and record the original in `note`.
- Skip a cell when its name column says 「休診」, when the name is crossed out (✕) or blank, and skip information rows that have no times (現場值班主管, 老健／勞檢).
- One person can have several entries in one day, and they may overlap. The UI flags overlaps (⚠) rather than treating them as errors.

## Install as app (PWA)

`manifest.webmanifest`, `icons/` and `sw.js` make the page installable (加入主畫面). `sw.js` is network-first for same-origin GETs: it caches every successful response and falls back to the cache only when offline, so new schedules show up immediately. Caching `data/` is fine because it's encrypted. If you change the precache list or caching behavior, bump `CACHE` in `sw.js`. The footer `#install` hint is hidden when running standalone.

## ICS export details

- Times are converted from `+08:00` to UTC (`...Z`). No VTIMEZONE block.
- Lines are folded at 75 bytes (UTF-8 aware) and text is escaped per RFC 5545. Each event has a 30-minute display alarm.
- On iOS the file is opened through a `data:text/calendar` URL, because Blob downloads don't open Calendar there. Other platforms get a Blob download.
- Android's Google Calendar app can't open .ics files, so on non-iOS devices each card also gets a "＋ Google 日曆" link (`gcalURL()`, a `calendar.google.com/calendar/render?action=TEMPLATE` URL with UTC `dates`). `eventInfo()` builds the title/notes shared by both export paths.

## Privacy constraint

GitHub Pages and the repo are public. The full schedule, with every colleague's name, is published only in encrypted form. The git history was rewritten on 2026-11-18 to remove the earlier plaintext commits.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `<type>(<scope>): <subject>`. The scope is optional.

- Write `subject` as one short sentence in Traditional Chinese with no trailing period, e.g. `feat(ui): 日期改用底部彈窗`.
- If a commit needs explaining, add a body after a blank line. Always end with the `Co-Authored-By` line.
- For a breaking change (e.g. changing the password or the encryption format, which makes remembered devices re-enter the password), add `!` after the type and put `BREAKING CHANGE: …` in the body.
- Types, standard set only:
  - `feat`: new feature
  - `fix`: bug fix
  - `style`: visual or CSS-only change, no behavior change
  - `refactor`: restructuring, no behavior change
  - `docs`: documentation only
  - `chore`: config, `.gitignore`, schedule data
- Scopes: `ui` (page), `ics` (calendar export), `crypto` (encryption/password), `data` (schedule data), `tools` (scripts).
- Daily schedule update is always `chore(data): 更新班表 YYYY-MM-DD`.
