# 授業で使用しているnodeイメージをベースにする
FROM node:20-alpine

WORKDIR /app

# 依存だけ先にコピーしてキャッシュを効かせる
COPY package*.json ./
RUN npm install --omit=dev

# アプリ本体をコピー
COPY . .

# Cloud Run / Render などは PORT を環境変数で渡してくる
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.js"]
