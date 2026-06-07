"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ---- 簡易ストレージ（DBレスでデモを成立させる） ----
// data/links.json にJSONで永続化。読み込み失敗時は空で起動する。
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "links.json");

/** @type {Map<string, {url:string, clicks:number, createdAt:string}>} */
let links = new Map();

function loadLinks() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    const obj = JSON.parse(raw);
    links = new Map(Object.entries(obj));
  } catch (_) {
    links = new Map();
  }
}

function saveLinks() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(Object.fromEntries(links), null, 2));
  } catch (err) {
    // 書き込み失敗してもプロセスは落とさない（読み取り専用FS対策）
    console.error("persist failed:", err.message);
  }
}

// 衝突しない6文字のbase62コードを生成
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
function generateCode(len = 6) {
  let code;
  do {
    code = "";
    for (let i = 0; i < len; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
  } while (links.has(code));
  return code;
}

function isValidHttpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (_) {
    return false;
  }
}

// 予約パス（短縮コードとして払い出さない）
const RESERVED = new Set(["api", "favicon.ico", "robots.txt", "health"]);

// ---- ミドルウェア ----
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---- API ----

// ヘルスチェック（デプロイ先の監視用）
app.get("/health", (_req, res) => res.json({ ok: true }));

// 短縮URLの作成
app.post("/api/shorten", (req, res) => {
  const url = (req.body && req.body.url ? String(req.body.url) : "").trim();
  if (!url) return res.status(400).json({ error: "URLを入力してください。" });
  if (!isValidHttpUrl(url)) {
    return res.status(400).json({ error: "http(s):// から始まる正しいURLを入力してください。" });
  }
  const code = generateCode();
  links.set(code, { url, clicks: 0, createdAt: new Date().toISOString() });
  saveLinks();
  res.status(201).json({ code, url, clicks: 0 });
});

// 一覧（新しい順）
app.get("/api/links", (_req, res) => {
  const list = [...links.entries()]
    .map(([code, v]) => ({ code, ...v }))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

// 削除
app.delete("/api/links/:code", (req, res) => {
  const ok = links.delete(req.params.code);
  if (ok) saveLinks();
  res.json({ deleted: ok });
});

// ---- 短縮URLのリダイレクト（ここがサーバーサイドの肝） ----
app.get("/:code", (req, res, next) => {
  const { code } = req.params;
  if (RESERVED.has(code)) return next();
  const entry = links.get(code);
  if (!entry) {
    return res
      .status(404)
      .send("<h1>404</h1><p>このリンクは存在しません。</p><p><a href='/'>トップへ</a></p>");
  }
  entry.clicks += 1;
  saveLinks();
  res.redirect(302, entry.url);
});

loadLinks();
app.listen(PORT, () => {
  console.log(`URL shortener running on port ${PORT}`);
});
