"""用 Azure AI Vision (Image Analysis 4.0 READ) 辨識圖片文字。

用法：.venv/bin/python .claude/skills/ocr/analyze.py <圖檔> [--json 原始結果.json]
輸出每行：y<TAB>x<TAB>最低信心<TAB>文字（x/y 為該行外框中心，依 y、x 排序；
信心 < 0.8 的字以【】框起來）。
憑證：環境變數 VISION_ENDPOINT / VISION_KEY，否則讀專案根目錄 .azure-vision.env。
"""
import argparse
import json
import os
import sys
from pathlib import Path

LOW = 0.8
ROOT = Path(__file__).resolve().parents[3]


def load_creds():
    env = {}
    f = ROOT / ".azure-vision.env"
    if f.exists():
        for line in f.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    endpoint = os.environ.get("VISION_ENDPOINT") or env.get("VISION_ENDPOINT")
    key = os.environ.get("VISION_KEY") or env.get("VISION_KEY")
    if not endpoint or not key:
        sys.exit("找不到 Azure 憑證：請在專案根目錄建立 .azure-vision.env，內容為\n"
                 "VISION_ENDPOINT=https://<資源>.cognitiveservices.azure.com/\nVISION_KEY=<金鑰>")
    return endpoint, key


def center(poly):
    xs = [p.x for p in poly]
    ys = [p.y for p in poly]
    return round(sum(xs) / len(xs)), round(sum(ys) / len(ys))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("--json", help="另存原始結果的路徑")
    a = ap.parse_args()

    from azure.ai.vision.imageanalysis import ImageAnalysisClient
    from azure.ai.vision.imageanalysis.models import VisualFeatures
    from azure.core.credentials import AzureKeyCredential
    from azure.core.exceptions import ClientAuthenticationError, HttpResponseError

    endpoint, key = load_creds()
    client = ImageAnalysisClient(endpoint=endpoint, credential=AzureKeyCredential(key))
    try:
        # READ 不指定 language：官方建議讓服務自動判斷，指定錯反而漏字
        result = client.analyze(image_data=Path(a.image).read_bytes(),
                                visual_features=[VisualFeatures.READ])
    except ClientAuthenticationError as e:
        sys.exit(f"Azure 驗證失敗（金鑰或端點錯誤）：{e.message}")
    except HttpResponseError as e:
        sys.exit(f"Azure 錯誤 {e.status_code}：{e.message}")

    if a.json:
        Path(a.json).write_text(json.dumps(result.as_dict(), ensure_ascii=False, indent=1))

    rows = []
    for block in (result.read.blocks if result.read else []):
        for line in block.lines:
            x, y = center(line.bounding_polygon)
            words = line.words or []
            low = min((w.confidence for w in words), default=1.0)
            text = "".join(f"【{w.text}】" if w.confidence < LOW else w.text for w in words) or line.text
            rows.append((y, x, low, text))
    for y, x, low, text in sorted(rows):
        print(f"{y}\t{x}\t{low:.2f}\t{text}")
    print(f"# {len(rows)} 行；信心 < {LOW} 的字以【】標示", file=sys.stderr)


if __name__ == "__main__":
    main()
