# Snip — URL Shortener

長いURLを短縮し、クリック数をサーバー側で計測する小さなサーバーサイドWebアプリケーション。
Node.js + Express で実装し、`node` イメージベースの Docker コンテナで動作します。

## 機能
- URLの短縮（6文字のランダムコードを払い出し）
- 短縮URLへのアクセスを 302 リダイレクト
- クリック数の自動計測
- 作成済みリンクの一覧・コピー・削除
- `http(s)://` 以外を弾く入力バリデーション

## ローカル実行
```bash
npm install
npm start
# http://localhost:3000
```

## Docker
```bash
docker build -t snip .
docker run -p 8080:8080 snip
# http://localhost:8080
```

## エンドポイント
| Method | Path              | 説明                       |
|--------|-------------------|----------------------------|
| GET    | `/`               | UI                         |
| POST   | `/api/shorten`    | `{ "url": "..." }` で作成   |
| GET    | `/api/links`      | 一覧（新しい順）           |
| DELETE | `/api/links/:code`| 削除                       |
| GET    | `/:code`          | リダイレクト＋クリック計測 |
| GET    | `/health`         | ヘルスチェック             |

## メモ
データは `data/links.json` に保存します。無料ホスティングの一時ファイルシステムでは
再デプロイ時にリセットされる場合があります（デモ用途では問題ありません）。
