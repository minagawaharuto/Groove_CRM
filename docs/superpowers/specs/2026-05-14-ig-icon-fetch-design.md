# IGアイコン自動取得スクリプト 設計書

**日付:** 2026-05-14
**対象ファイル:** `fetch_ig_icons.py`

---

## 概要

Instaloaderを使ってGoogleスプレッドシートの人物シートからInstagramプロフィール画像を取得し、Google Driveにアップロード後、シートの「IGアイコン」列に `=IMAGE()` 数式を書き込む。

---

## 対象シート

- モデル
- インフルエンサー
- スポーツ選手・著名人

各シートのヘッダ行を走査し、「IGアイコン」列を自動検出（なければ末尾に追加）。

---

## アーキテクチャ

```
fetch_ig_icons.py
├── SpreadsheetClient    # gspread経由でシート読み書き（既存のservice_account.jsonを使用）
├── InstagramFetcher     # Instaloaderでプロフィール画像取得
├── DriveUploader        # Google Drive APIで画像をアップロード・公開設定
└── main()              # 3シートをループ処理
```

---

## データフロー

1. SpreadsheetClientで対象シートの全行を読み込む
2. 各行に対して：
   a. 「IGアイコン」列にすでに値がある場合はスキップ
   b. 「ユーザー名」列（列インデックス1）に値があれば `Profile.from_username()` で直接取得
   c. ユーザー名が空の場合は「名前」列（列インデックス2）で `search_for_user()` を実行し、最初のヒットを使用
3. InstagramFetcherでプロフィール画像URLを取得し、ローカルのtempディレクトリにダウンロード
4. DriveUploaderでGoogle Driveにアップロードし、一般公開URLを生成
5. `=IMAGE("https://drive.google.com/uc?id=<FILE_ID>")` をIGアイコン列に書き込む
6. 各処理後に2秒スリープ（レート制限対策）

---

## 列定義

| 列名 | インデックス（0-based） | 用途 |
|------|------------------------|------|
| ユーザー名 | 1 | Instagramユーザー名（優先使用） |
| 名前 | 2 | 検索用フォールバック |
| IGアイコン | 自動検出/末尾追加 | IMAGE()数式を書き込む |

---

## スキップ条件

- 名前列・ユーザー名列がともに空の行
- IGアイコン列にすでに値がある行（上書き防止）

---

## 認証

- **Googleスプレッドシート / Drive:** 既存の `service_account.json` を使用
- **Instagram:** 匿名アクセス（Instaloader）。レート制限が発生した場合は `.env` に `IG_USERNAME` / `IG_PASSWORD` を追加してログインに切り替え可能

---

## エラーハンドリング

- Instagramプロフィールが見つからない場合: 警告ログを出力してスキップ
- Drive アップロード失敗: 警告ログを出力してスキップ
- シート書き込み失敗: エラーをログに記録して次の行へ継続

---

## 依存パッケージ（追加）

```
instaloader
google-api-python-client
```

（既存の `gspread`, `google-auth` はそのまま流用）

---

## 出力ファイル

| ファイル | 説明 |
|----------|------|
| `fetch_ig_icons.py` | メインスクリプト |
| `temp_icons/` | ダウンロード済みアイコンの一時保存先（処理後削除） |
