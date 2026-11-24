---
description: 辨識班表圖片 → 核對 → 加密 → 上傳到網站
argument-hint: [班表圖檔或資料夾路徑…]（省略時讀 inbox/）
---

把這些班表圖更新到網站：$ARGUMENTS

轉錄交給 `schedule-transcriber` sub agent（`.claude/agents/schedule-transcriber.md`，規則以 CLAUDE.md 的「Transcription conventions」為準）。主對話只負責派工、整理報告、處理更正、加密上傳。

## 1. 派工
- 找出要處理的圖檔：
  - 參數是檔案：直接用。
  - 參數是資料夾：取該資料夾第一層的所有 `.jpg`、`.jpeg`、`.png`（不分大小寫），不含子資料夾。
  - 沒有參數：用專案根目錄的 `inbox/`，規則同上。`inbox/` 已 gitignore，圖片不會被 commit。
  - 用 `ls`／`find` 列出檔名即可，不要讀圖。
- 一張圖都沒有：告訴使用者把圖放進 `inbox/`（或提供路徑），然後停下來。其他格式（例如 `.heic`）列出來請使用者轉成 jpg。
- 開始前先列出這次要處理的圖檔清單。
- **每張圖開一個 `schedule-transcriber` agent**；多張圖時在同一則回覆裡平行發出。prompt 寫上圖檔的絕對路徑；使用者已同意覆蓋的日期，加上「可以覆蓋」。
- 主對話不要自己讀圖或跑 OCR。

## 2. 整理報告給使用者核對，然後停下來
- 等所有 agent 回來，把報告整理成一份：每天的日期、筆數、人數、不確定的格子、OCR 低信心的格子、沒收錄的格子、新姓名。
- 把各報告的「需要使用者決定的問題」集中放在最後，編號列出。
- 回報「已存在」的日期：問使用者要不要覆蓋；要的話重新派一次 agent，prompt 加上「可以覆蓋」。
- 使用者確認前，不要加密也不要上傳。

## 3. 處理更正
- 小改（改字、改姓名、補時間）：主對話直接改 `private/YYYY-MM-DD.json`，改完再驗證一次（parse、必要欄位、`HH:MM`、`end > start`）。
- 需要重看圖的：用 SendMessage 把更正交給原本那個 agent，它還記得圖和 OCR 結果。
- 使用者給的新規則（例如新符號的意思），補進 CLAUDE.md 的 Transcription conventions 和 `.claude/agents/schedule-transcriber.md`。
- 改完再回報一次，等使用者確認。

## 4. 確認後交給 `schedule-publisher` agent 加密並上傳
- 只有在使用者明確確認之後才派工。prompt 寫上這次要上線的日期；如果是修正既有資料，寫上 `fix(data)` 用的說明。
- agent 會加密、檢查 `data/` 裡沒有任何姓名、commit、推送，並等 GitHub Pages 建好。主對話不要自己跑 `encrypt.mjs`。
- 把 agent 的回報轉述給使用者：commit、檢查結果、網址。如果它回報推送被拒，就請使用者執行 `! git push`，推送後再確認 Pages 建置完成、線上 `data/index.json` 有新日期。
- 上線確認後，把這次從 `inbox/` 取的圖移到 `inbox/done/`（沒有就建立），下次就不會重複處理。使用者直接給的路徑不移動。
