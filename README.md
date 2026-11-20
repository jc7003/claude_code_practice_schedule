# 班表查詢

進站先輸入密碼，再輸入姓名查看當天班表，並加入手機行事曆：
- iPhone：按「加入 iPhone 行事曆」一次匯入（.ics）
- Android：每筆班按「＋ Google 日曆」；三星等日曆可下載 .ics 匯入

## 畫面示意
<table><tr>
<td align="center"><img src="docs/screenshot-date.jpg" width="260" alt="選擇日期"><br>點日期旁的 ▾ 選日期</td>
<td align="center"><img src="docs/screenshot-name.jpg" width="260" alt="輸入姓名查詢"><br>輸入或選擇姓名，顯示當天的班</td>
</tr></table>

## 安裝成 App
- iPhone：用 Safari 開網址 → 分享 →「加入主畫面」
- Android：用 Chrome 開網址 → 選單 →「安裝應用程式」
裝好後從主畫面開啟是全螢幕；沒網路時也能看上次看過的日期。iPhone 的主畫面 App 和 Safari 分開記憶，第一次開要重新輸入密碼。

## 結構
```
index.html               查詢網頁（純前端，輸入密碼後在瀏覽器解密）
data/index.json          日期清單＋解密參數（salt、密碼檢查值）
data/YYYY-MM-DD.json     加密後的每日班表（會上傳）
private/YYYY-MM-DD.json  明文班表（只在本機，不上傳）
.password                加密密碼（只在本機，不上傳）
tools/encrypt.mjs        把 private/ 加密成 data/
manifest.webmanifest、sw.js、icons/  加入主畫面（PWA）用
```

## 開發方式：用 Claude Code 把紙本班表變成網站資料
每天的班表是一張手寫表格的照片。辨識、核對、加密到上線，都由 Claude Code 的 slash command、sub agent 和 skill 串起來，只有「核對」這一步由人來做。

```mermaid
flowchart LR
    A["班表照片"] --> B["/deploy_schedule"]
    B --> C1["schedule-transcriber<br>（一張圖一個，平行）"]
    C1 --> D["Azure OCR 取字<br>＋看圖判斷結構"]
    D --> E["private/YYYY-MM-DD.json<br>＋核對報告"]
    E --> F{"人工核對"}
    F -- 更正 --> E
    F -- 確認 --> G["schedule-publisher"]
    G --> H["encrypt.mjs<br>AES-256-GCM"]
    H --> I["檢查 data/ 沒有姓名"]
    I --> J["commit／push"]
    J --> K["確認 GitHub Pages 上線"]
```

設計重點：
- **文字以 OCR 為準，結構看圖**：中文字交給 Azure AI Vision，比直接讀圖的錯字少。欄位、底色和劃掉的格子則由模型看圖判斷。
- **一張圖一個 sub agent，平行處理**：主對話只合併報告、處理更正，不會被圖片和 OCR 原始輸出塞滿 context。
- **沒有人工確認就不能發布**：低信心的字、對不上的姓名和規則沒涵蓋的格子，都會列成問題請人決定。
- **發布前先擋明文外洩**：publisher 只有 Read 和 Bash 權限。它推送前會檢查 `data/` 裡沒有任何姓名，有一項不過就不 commit。
- **規則只寫在一處**：轉錄慣例都寫在 `CLAUDE.md`；遇到新的符號，就補進規則裡。

相關檔案：`.claude/commands/deploy_schedule.md`（流程）、`.claude/agents/`（轉錄與發布的 agent）、`.claude/skills/ocr/`（OCR）。通知 hook（`.claude/settings.json`）用 `afplay` 和 `osascript`，只能在 macOS 上執行。

## 每日更新
1. 在 Claude Code 輸入 `/deploy_schedule <圖檔路徑>`（或傳班表圖，說「更新班表」）
2. 核對辨識結果。明文存在 `private/YYYY-MM-DD.json`
3. 確認後，`schedule-publisher` agent 會執行 `node tools/encrypt.mjs`，把最近 30 天的 `private/` 檔案加密到 `data/`，並更新 `data/index.json` 的日期清單。超過 30 天的班表會從網站移除，`private/` 裡的明文則保留在本機
4. agent 以 `chore(data): 更新班表 YYYY-MM-DD` commit 並推送，約 1 分鐘後 GitHub Pages 更新

## OCR 設定（上傳者的電腦要做一次）
轉錄時字以 Azure AI Vision 的 OCR 為準，錯字比直接讀圖少。
1. 在 Azure 入口網站建立「電腦視覺」資源（區域 East Asia，定價層 F0 或 S1）
2. 到資源的「金鑰與端點」，把端點和金鑰寫進專案根目錄的 `.azure-vision.env`：
   ```
   VISION_ENDPOINT=https://<資源名稱>.cognitiveservices.azure.com/
   VISION_KEY=<金鑰1>
   ```
3. `python3 -m venv .venv && .venv/bin/pip install azure-ai-vision-imageanalysis`

`.azure-vision.env` 和 `.venv/` 已列在 `.gitignore`，不要 commit 金鑰。

## 資料格式（`private/` 裡的明文）
```json
{
  "date": "2026-11-18",
  "weekday": "三",
  "entries": [
    { "name": "王小明", "shift": "早班", "task": "衛教室", "extra": "+開25",
      "start": "08:30", "end": "12:30", "hours": 4, "color": "", "raw": "8'-12'(衛教室)4+開25" }
  ]
}
```
- `start` / `end`：台北時間，原表「'」代表半點（8' = 08:30）
- `color`：原表底色，`yellow` 會顯示 🟡；其他底色顯示為標籤

## 注意
- GitHub Pages 和這個 repo 都是公開的，所以上傳的班表一律是加密檔；`private/` 和 `.password` 已列在 `.gitignore`，絕對不要 commit。
- 加密：PBKDF2-SHA256（600,000 次）＋ AES-256-GCM。密碼是 6 位數字，只擋得住一般人。
- 換密碼：改 `.password`，刪除 `data/index.json`，再執行 `node tools/encrypt.mjs`（已記住舊密碼的裝置要重新輸入）。
