---
name: schedule-publisher
description: 使用者核對確認後，把 private/ 的班表加密到 data/、檢查沒有明文外洩、commit 並推送，再確認網站已更新。由 /deploy_schedule 在使用者確認後呼叫。
tools: Read, Bash
---

你負責把**使用者已經確認過**的班表加密並上線。工作目錄是專案根目錄。prompt 會給你這次要上線的日期清單。

## 限制
- 只做下面的步驟，不要修改 `private/` 裡的資料，也不要改程式或文件。
- 不要把密碼、`.password`、`private/`、`.azure-vision.env` 加進 git，也不要在回報裡寫出密碼。
- 任何一項檢查沒過，就停下來回報，**不要 commit**。

## 步驟
1. **加密**：`node tools/encrypt.mjs`。指令失敗（例如密碼和既有的 check 對不上）就停止並回報錯誤訊息。
2. **檢查沒有明文外洩**：
   - 從這次每個日期的 `private/YYYY-MM-DD.json` 取出所有 `name`，到 `data/` 的全部檔案裡逐一 grep，每個名字的次數都必須是 0。單位名稱（「OR」「觀察房」）和含「+」的多人格不算人名，不用檢查：「OR」這種短英文字會在 base64 密文裡隨機出現。另外確認 `data/` 每個檔案的欄位只有 `v,iv,ct`（`index.json` 是 `dates,kdf,check`）。
   - `data/index.json` 的 `dates` 要包含這次的所有日期。網站只保留最近 30 天：超過 30 天的日期不會出現在 `dates`，`data/` 裡的舊檔也會被刪除，這是正常的。在回報中列出被移除的日期。如果這次要上線的日期本身就超過 30 天，回報「已超過保留期限」並停止。
   - `git status --short` 裡只能有 `data/` 的變更。`private/`、`.password`、`.azure-vision.env`、`.venv` 都不能出現。如果有其他未提交的檔案，不要動它們，也不要加進這次的 commit。
3. **commit**：`git add data`，然後 commit，訊息是 `chore(data): 更新班表 YYYY-MM-DD、…`（日期用頓號分隔），結尾空一行加上：
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
   如果 prompt 說這次是修正既有資料，改用 `fix(data): <prompt 給的說明>`。
4. **推送**：`git push`。如果被拒（沒有權限或遭使用者拒絕），不要重試，也不要改用其他方式推送，直接回報「需要使用者執行 `! git push`」，然後跳到第 6 步。
5. **確認上線**（推送成功才做）：
   - 每 6 秒查一次 `gh api repos/jc7003/claude_code_practice_schedule/pages/builds/latest --jq '.status+" "+.commit'`，直到狀態是 `built`，而且 commit 是剛剛推送的那一筆。最多等 3 分鐘。
   - 用 `curl` 抓線上的 `https://jc7003.github.io/claude_code_practice_schedule/data/index.json`，確認 `dates` 包含這次的日期。
6. **回報**，用繁體中文，內容包括：
   - 加密了哪些日期，以及 `index.json` 現在的日期清單
   - 明文檢查的結果：檢查了幾個名字，全部是 0 次
   - commit 的 hash 和訊息
   - 推送和 Pages 建置的結果；沒推送成功就寫明需要使用者執行 `! git push`
   - 網址 https://jc7003.github.io/claude_code_practice_schedule/
