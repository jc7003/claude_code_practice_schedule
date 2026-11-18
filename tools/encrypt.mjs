// 把 private/*.json（明文）用 .password 加密成 data/*.json，並重寫 data/index.json
// 用法：node tools/encrypt.mjs
import fs from "node:fs";
import path from "node:path";
import { webcrypto as crypto } from "node:crypto";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const ITER = 600000;
const b64 = u8 => Buffer.from(u8).toString("base64");
const unb64 = s => new Uint8Array(Buffer.from(s, "base64"));

const password = fs.readFileSync(path.join(root, ".password"), "utf8").trim();
if (!password) throw new Error(".password 是空的");

const indexPath = path.join(root, "data/index.json");
let old = {};
try { old = JSON.parse(fs.readFileSync(indexPath, "utf8")); } catch {}
const salt = old.kdf?.salt ? unb64(old.kdf.salt) : crypto.getRandomValues(new Uint8Array(16));
const iter = old.kdf?.iter || ITER;

const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
const key = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter },
  base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

async function enc(text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
  return { iv: b64(iv), ct: b64(ct) };
}

// 用舊的 check 驗證密碼沒打錯，避免同一組 salt 混用不同密碼
if (old.check) {
  try { await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(old.check.iv) }, key, unb64(old.check.ct)); }
  catch { throw new Error("密碼與現有 data/index.json 不符；若要換密碼，先刪除 data/index.json 再執行"); }
}

// 網站只保留最近 30 天（含今天，台北時間）；更早的日期不加密，data/ 裡的舊檔刪除。private/ 不動
const KEEP_DAYS = 30;
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" });
const cutoff = new Date(Date.parse(today + "T00:00:00Z") - (KEEP_DAYS - 1) * 864e5).toISOString().slice(0, 10);
const isDay = f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f);

const files = fs.readdirSync(path.join(root, "private")).filter(isDay).filter(f => f.slice(0, 10) >= cutoff).sort();
const removed = fs.readdirSync(path.join(root, "data")).filter(isDay).filter(f => f.slice(0, 10) < cutoff);
for (const f of removed) fs.unlinkSync(path.join(root, "data", f));
for (const f of files) {
  const text = fs.readFileSync(path.join(root, "private", f), "utf8");
  JSON.parse(text); // 格式錯誤就直接中止
  fs.writeFileSync(path.join(root, "data", f), JSON.stringify({ v: 1, ...(await enc(text)) }) + "\n");
}
const index = { dates: files.map(f => f.slice(0, 10)), kdf: { salt: b64(salt), iter }, check: await enc("schedule-ok") };
fs.writeFileSync(indexPath, JSON.stringify(index, null, 2) + "\n");
console.log(`已加密 ${files.length} 天（保留 ${cutoff} 以後）：${index.dates.join(", ")}`);
if (removed.length) console.log(`已從網站移除超過 ${KEEP_DAYS} 天的班表：${removed.map(f => f.slice(0, 10)).join(", ")}`);
