---
name: ocr
description: 用 Azure AI Vision 辨識圖片文字（OCR，含繁體中文），輸出每行文字、座標與低信心字。轉錄班表等密集中文表格時使用；/deploy_schedule 第 1 步會呼叫。
---

# 本專案用法（先看這段）

```bash
.venv/bin/python .claude/skills/ocr/analyze.py <圖檔> [--json <scratchpad>/raw.json]
```

- 每行輸出 `y<TAB>x<TAB>最低信心<TAB>文字`，依 y、x 排序。x/y 是該行外框中心：依 x 分欄、依 y 分列，對回表格的格子。
- 信心 < 0.8 的字以【】標示，這些字要列進核對報告。
- 相鄰格子有時會被合成一行，要看圖拆開。
- 憑證在專案根目錄 `.azure-vision.env`（`VISION_ENDPOINT`、`VISION_KEY`，已 gitignore）。不要印出或 commit 金鑰。
- 做 READ 時不要傳 `language`：服務會自動判斷，指定了反而可能漏字。
- 執行失敗（沒有憑證、網路或驗證錯誤）會以非 0 結束並印出原因；呼叫端應退回只讀圖並註明。

## 參考
- [Azure AI Vision Image Analysis SDK for Python](https://learn.microsoft.com/python/api/overview/azure/ai-vision-imageanalysis-readme)
- [OCR（READ）概覽](https://learn.microsoft.com/azure/ai-services/computer-vision/overview-ocr)
