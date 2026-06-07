"use strict";

const express = require("express");
const path = require("path");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

// ---- PostgreSQL接続 ----
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://snip:snip@localhost:5432/snip",
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes("sslmode=require")
    ? { rejectUnauthorized: false }
    : false,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS links (
      code        TEXT PRIMARY KEY,
      url         TEXT NOT NULL,
      clicks      INTEGER NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

// 6文字のbase62コードを生成
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
function randomCode(len = 6) {
  let code = "";
  for (let i = 0; i < len; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
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

// 予約パス
const RESERVED = new Set(["api", "favicon.ico", "robots.txt", "health"]);

// ---- ミドルウェア ----
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ---- API ----

// ヘルスチェック
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true });
  } catch (_) {
    res.status(500).json({ ok: false });
  }
});

// 短縮URLの作成
app.post("/api/shorten", async (req, res) => {
  const url = (req.body && req.body.url ? String(req.body.url) : "").trim();
  if (!url) return res.status(400).json({ error: "URLを入力してください。" });
  if (!isValidHttpUrl(url)) {
    return res.status(400).json({ error: "http(s):// から始まる正しいURLを入力してください。" });
  }

  const MAX_RETRIES = 5;
  for (let i = 0; i < MAX_RETRIES; i++) {
    const code = randomCode();
    try {
      const result = await pool.query(
        "INSERT INTO links (code, url) VALUES ($1, $2) RETURNING code, url, clicks",
        [code, url]
      );
      const row = result.rows[0];
      return res.status(201).json({ code: row.code, url: row.url, clicks: row.clicks });
    } catch (err) {
      if (err.code === "23505") continue; // PK衝突時はリトライ
      throw err;
    }
  }
  res.status(500).json({ error: "コードの生成に失敗しました。再度お試しください。" });
});

// 一覧（新しい順）
app.get("/api/links", async (_req, res) => {
  const result = await pool.query(
    "SELECT code, url, clicks, created_at AS \"createdAt\" FROM links ORDER BY created_at DESC"
  );
  res.json(result.rows);
});

// 削除
app.delete("/api/links/:code", async (req, res) => {
  const result = await pool.query("DELETE FROM links WHERE code = $1", [req.params.code]);
  res.json({ deleted: result.rowCount > 0 });
});

// ---- 短縮URLのリダイレクト ----
app.get("/:code", async (req, res, next) => {
  const { code } = req.params;
  if (RESERVED.has(code)) return next();
  const result = await pool.query(
    "UPDATE links SET clicks = clicks + 1 WHERE code = $1 RETURNING url",
    [code]
  );
  if (result.rowCount === 0) {
    return res
      .status(404)
      .send("<h1>404</h1><p>このリンクは存在しません。</p><p><a href='/'>トップへ</a></p>");
  }
  res.redirect(302, result.rows[0].url);
});

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`URL shortener running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("DB初期化失敗:", err.message);
    process.exit(1);
  });
