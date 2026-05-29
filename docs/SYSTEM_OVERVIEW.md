# Groove CRM — システム概要ドキュメント

**作成日:** 2026-04-23
**対象システム:** タレント・インフルエンサー管理 CRM
**実行環境:** Google Apps Script (V8) + Google スプレッドシート

---

## 1. システム概要

タレント・インフルエンサー・スポーツ選手・著名人を対象とした社内向け CRM（顧客管理システム）。Google スプレッドシートをデータベースとし、Google Apps Script で Web アプリを構築した SPA（シングルページアプリケーション）。

### 主な機能

| 機能 | 概要 |
|------|------|
| 人物検索 | フリーワード・区分・フォロワー数・所在地・事務所・タグ・ギャラ目安など多条件で高速検索 |
| AI アシスタント | Gemini API による自然言語での人物検索・質問応答 |
| 人物詳細・編集 | ステータス・担当者・メモ・次アクション日などの CRM 情報を管理 |
| 活動ログ | 接触履歴（電話・メール・面談・DM）の記録と人物情報の自動更新 |
| 案件管理 | キャスティング案件と候補人物の紐付け管理 |
| スクレイピング | Wikipedia・refetter・DuckDuckGo から性別・事務所・所在地・各種 SNS URL を自動取得 |
| フォロワー更新 | insta.refetter.com からフォロワー数を自動更新（バッチ処理） |
| 週次バックアップ | スプレッドシート全体を Google Drive に毎週自動複製 |
| 権限管理 | Admin / Editor / Viewer の 3 段階ロール制御 |

---

## 2. アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│                  ブラウザ (SPA)                       │
│  index.html + components.html + app.js.html          │
│  ・ハッシュルーティング (#/, #/deals, #/admin)        │
│  ・google.script.run でサーバー関数を呼び出し         │
└────────────────────┬────────────────────────────────┘
                     │ google.script.run.*()
┌────────────────────▼────────────────────────────────┐
│           Google Apps Script (サーバー側)             │
│                                                      │
│  Main.gs          — 定数・エントリポイント・ユーティリティ │
│  Auth.gs          — 権限管理・Config 設定              │
│  IndexService.gs  — 検索インデックス構築・検索          │
│  PeopleService.gs — 人物 CRUD                        │
│  DealService.gs   — 案件・キャスティング管理            │
│  LogService.gs    — 活動ログ・人物情報同期              │
│  AIService.gs     — Gemini API 連携                  │
│  FollowerScraper.gs — フォロワー数自動更新             │
│  PersonInfoScraper.gs — 人物属性スクレイピング         │
│  WeeklyBackup.gs  — 週次バックアップ                  │
└────────────────────┬────────────────────────────────┘
                     │ SpreadsheetApp API
┌────────────────────▼────────────────────────────────┐
│           Google スプレッドシート（DB）                │
│  モデル / インフルエンサー / スポーツ選手・著名人       │
│  90_Index / 10_Deals / 11_DealCasting               │
│  20_ActivityLog / 99_Config / スクレイピングログ       │
└─────────────────────────────────────────────────────┘
```

---

## 3. ファイル構成

### バックエンド（Google Apps Script）

| ファイル | 役割 |
|---------|------|
| `Main.gs` | グローバル定数（シート名・列定義）、`doGet()`、ユーティリティ関数、カスタムメニュー |
| `Auth.gs` | ユーザー認証・ロール判定・Config 管理 |
| `IndexService.gs` | 90_Index の構築・再生成、高速検索、キャッシュ管理 |
| `PeopleService.gs` | 人物シートへの CRUD 操作・Index 同期 |
| `DealService.gs` | 案件・キャスティングの CRUD |
| `LogService.gs` | 活動ログ記録・人物マスター自動更新 |
| `AIService.gs` | Gemini 2.0 Flash API 呼び出し・検索パラメータ抽出 |
| `FollowerScraper.gs` | insta.refetter.com からフォロワー数・位置情報をスクレイピング |
| `PersonInfoScraper.gs` | Wikipedia・DuckDuckGo・refetter から人物属性を自動取得 |
| `WeeklyBackup.gs` | スプレッドシートの週次 Google Drive バックアップ |

### フロントエンド（HTML テンプレート）

| ファイル | 役割 |
|---------|------|
| `index.html` | SPA エントリーポイント。ナビ・トースト・テンプレートコンテナ |
| `components.html` | 各ビューの HTML テンプレート（検索・詳細・案件・管理） |
| `app.js.html` | SPA ロジック。ルーティング・イベント処理・サーバー通信 |
| `style.html` | CSS スタイル定義 |
| `xlsx.js.html` | SheetJS ライブラリ（Excel 出力用） |

---

## 4. データベース（スプレッドシート）構成

### 人物マスターシート（3枚・同一列構成）

| シート名 | 対象 |
|---------|------|
| `モデル` | モデル |
| `インフルエンサー` | インフルエンサー |
| `スポーツ選手・著名人` | スポーツ選手・著名人 |

**主要列（0-indexed）:**

| 列番号 | 列名 | 内容 |
|--------|------|------|
| 0 | フォロワー数 | Instagram フォロワー数 |
| 1 | ユーザー名 | Instagram ユーザー名 |
| 2 | 名前 | 人物名 |
| 6 | 所在地 | 居住地（都道府県） |
| 8 | URL | Instagram プロフィール URL |
| 16 | person_id | 一意 ID（CRM 追加列） |
| 28 | 社内担当 | 担当者名 |
| 29 | 所属事務所 | 所属事務所名 |
| 36 | ギャラ目安 | 出演料目安 |
| 49 | ステータス | CRM ステータス |
| 51 | 最終接触日 | 最終コンタクト日 |
| 52 | 次アクション日 | 次回アクション予定日 |
| 53 | 次アクション内容 | アクション内容 |
| 54 | 優先度 | 優先度（高/中/低） |
| 59 | メモ | 備考メモ |
| 61 | 性別 | スクレイピング取得 |
| 62 | Twitter | Twitter/X URL |
| 63 | YouTube | YouTube チャンネル URL |
| 64 | TikTok | TikTok URL |
| 65 | その他SNS | note.com 等 |
| 66 | IGアイコン | Instagram プロフィール画像 URL |

### CRM 管理シート

| シート名 | 用途 | 主要列 |
|---------|------|--------|
| `90_Index` | 検索用インデックス（全人物を統合） | person_id, 区分, 名前, フォロワー数, ステータス, 所在地, _search_text 他 |
| `10_Deals` | 案件マスター | deal_id, 案件名, クライアント, 状態, 担当, 納期 |
| `11_DealCasting` | 案件キャスティング | deal_casting_id, deal_id, person_id, 候補ステータス, 提示条件, NG理由 |
| `20_ActivityLog` | 活動ログ | log_id, person_id, 日時, 種別, 内容, 結果, 次アクション日 |
| `99_Config` | システム設定 | key, value（admin_emails / editor_emails / viewer_emails, Gemini API キー等） |
| `スクレイピングログ` | スクレイピング実行ログ | タイムスタンプ, メッセージ |

---

## 5. 主要機能の詳細

### 5-1. 人物検索（IndexService.gs）

```
searchPeople(params) の検索フロー:

1. params をハッシュ化してキャッシュキーを生成
2. CacheService にキャッシュがあれば即返却（TTL: 10分）
3. 90_Index をチャンク分割キャッシュから読み込み
4. フィルタリング:
   - フリーワード (_search_text に AND 検索)
   - 区分 / ステータス / 優先度 / 担当者
   - フォロワー数・ギャラ目安（範囲指定）
   - 所在地・所属事務所・タグ（部分一致）
   - 次アクション日（期限切れ/今日/今週）
5. ソート（任意列・昇降順）
6. ページング（デフォルト 50件/ページ）
7. 結果をキャッシュ保存して返却
```

### 5-2. 人物情報スクレイピング（PersonInfoScraper.gs）

取得する情報と書き込み先:

| 情報 | 取得列 | 書き込みポリシー |
|------|--------|----------------|
| 所在地 | 既存列 (col 6) | 空欄のみ書き込み |
| Instagram URL | 既存列 (col 8) | 空欄のみ書き込み |
| 所属事務所 | 既存列 (col 29) | 空欄のみ書き込み |
| 性別 | 新規列 (col 61) | 常に上書き |
| Twitter/X | 新規列 (col 62) | 常に上書き |
| YouTube | 新規列 (col 63) | 常に上書き |
| TikTok | 新規列 (col 64) | 常に上書き |
| その他SNS | 新規列 (col 65) | 常に上書き |
| IGアイコン | 新規列 (col 66) | 常に上書き |

**データ取得の優先順位:**

```
1. Wikipedia API（主ソース・APIキー不要）
   └ MediaWiki Search API → REST Summary API → 外部リンク抽出
   └ 性別・事務所・所在地・SNS URL を抽出

2. insta.refetter.com（補完）
   └ ユーザー名でプロフィールページ取得
   └ bio テキスト・所在地・SNS リンクを抽出
   └ Instagram URL を確定

3. DuckDuckGo Lite HTML（フォールバック）
   └ APIキー不要、直リンク形式で SNS URL 取得
   └ kl=jp-jp で日本語ロケール指定

4. Google HTML（最終フォールバック）
   └ DDG がブロックされた場合のみ使用

5. YouTube Data API（オプション・APIキー要）

6. Instagram アイコン（og:image 取得）
```

**バッチ処理:**
- `PropertiesService` に進捗（シート名・行番号）を保存
- 1バッチ: 最大 10 件 or 5 分でタイムアウト（GAS 上限 6 分の安全マージン）
- `続きから実行` で中断箇所から再開可能

**自動トリガー:**
- 名前列への入力を検知してスクレイピングを自動実行
- シンプルトリガーでは UrlFetchApp 不可のため installable trigger を使用

### 5-3. AI アシスタント（AIService.gs）

```
ユーザー入力 → Gemini 2.0 Flash API
  ┌ システムコンテキスト:
  │   - 人物総数
  │   - Index からサンプルデータ（最大10件）
  │   - 操作可能なフィルタ条件の説明
  └ ユーザー質問

Gemini 応答:
  ├ テキスト回答（チャットボットに表示）
  └ [SEARCH_PARAMS]{"keyword":"...", "category":"..."}[/SEARCH_PARAMS]
       ↓ タグがある場合
    searchPeople() を自動実行して結果カードを表示
```

### 5-4. 活動ログ（LogService.gs）

```
addActivityLog(payload):
  1. 20_ActivityLog に行追加（log_id 採番）
  2. updatePerson() で人物マスターを自動更新:
     - 最終接触日 ← 当日日付
     - 最終接触日 ← 当日日付
     - 次アクション日 ← payload の値
     - 次アクション内容 ← payload の値
     - ステータス ← payload に含む場合のみ更新
  3. syncIndexForPerson() で 90_Index も同期
  4. clearIndexCache() でキャッシュクリア
```

### 5-5. 権限管理（Auth.gs）

| ロール | レベル | 許可操作 |
|--------|--------|---------|
| Admin | 3 | 全操作（Config 変更・Index 再構築・バックアップ・データ検証） |
| Editor | 2 | 人物追加・編集・案件・ログ操作 |
| Viewer | 1 | 検索・閲覧のみ |
| None | 0 | アクセス不可 |

- `99_Config` シートの `admin_emails` / `editor_emails` / `viewer_emails` 列でメールアドレスを管理
- Config は CacheService に 5 分間キャッシュ（頻繁な読み込みを抑制）

---

## 6. フロントエンドからのサーバー呼び出し一覧

| 関数 | ファイル | 最低ロール |
|------|---------|-----------|
| `getCurrentUser()` | Auth.gs | Viewer |
| `getConfig()` | Auth.gs | Admin |
| `updateConfig(patch)` | Auth.gs | Admin |
| `searchPeople(params)` | IndexService.gs | Viewer |
| `rebuildIndex()` | IndexService.gs | Admin |
| `validateData()` | IndexService.gs | Admin |
| `getPerson(personId)` | PeopleService.gs | Viewer |
| `updatePerson(personId, patch)` | PeopleService.gs | Editor |
| `addPerson(payload)` | PeopleService.gs | Editor |
| `listDeals(filters)` | DealService.gs | Viewer |
| `createDeal(payload)` | DealService.gs | Editor |
| `getDeal(dealId)` | DealService.gs | Viewer |
| `addPersonToDeal(...)` | DealService.gs | Editor |
| `updateDealCasting(...)` | DealService.gs | Editor |
| `addActivityLog(payload)` | LogService.gs | Editor |
| `getPersonTimeline(personId)` | LogService.gs | Viewer |
| `askAI(prompt)` | AIService.gs | Viewer |
| `createWeeklyBackup()` | WeeklyBackup.gs | Admin |

---

## 7. カスタムメニュー（スプレッドシート上）

```
スクレイピング
├── 【初回】ヘッダを設定     → setupScrapeHeaders()
├── ─────────────────────
├── 選択行を実行            → scrapeSelectedRows()
├── 全件実行（バッチ）      → scrapeAllSheets()
├── 続きから実行            → resumeScrape()
├── 進捗リセット            → resetScrapeProgress()
├── ─────────────────────
├── 【自動】トリガーを登録   → createScrapeEditTrigger()
└── 【自動】トリガーを削除   → deleteScrapeEditTrigger()
```

---

## 8. 初回セットアップ手順

1. `Main.gs` の `SPREADSHEET_ID` を実際のスプレッドシート ID に設定
2. スプレッドシートからスクリプトエディタを開き `setupSheets()` を手動実行（CRM シートとヘッダを初期化）
3. `99_Config` シートにロール別メールアドレスを登録
4. `GEMINI_API_KEY` をスクリプトプロパティに設定（AI 機能使用時）
5. スクレイピング列のヘッダを追加: メニュー「スクレイピング → 【初回】ヘッダを設定」
6. 自動スクレイピングを有効化: メニュー「スクレイピング → 【自動】トリガーを登録」
7. 週次バックアップを有効化: `setupWeeklyBackupTrigger()` を手動実行

---

## 9. キャッシュ戦略

| キャッシュ対象 | キー | TTL |
|--------------|------|-----|
| 90_Index 全データ | `CRM_INDEX_CACHE_0` ～ `_9`（チャンク分割） | 10 分 |
| 検索結果 | `CRM_SEARCH_{ハッシュ}` | 10 分 |
| Config 設定 | `CRM_CONFIG_CACHE` | 5 分 |

- 人物追加・更新・ログ追加時は `clearIndexCache()` でキャッシュを全クリア
- キャッシュクリア時は検索キーのトラッキングリストも合わせて削除

---

## 10. 外部 API 依存

| API | 用途 | 認証 |
|-----|------|------|
| Gemini 2.0 Flash | AI アシスタント | スクリプトプロパティ `GEMINI_API_KEY` |
| insta.refetter.com | フォロワー数・人物情報取得 | 不要（HTML スクレイピング） |
| Wikipedia API（MediaWiki） | 人物属性取得（主ソース） | 不要 |
| DuckDuckGo Lite | Web 検索フォールバック | 不要 |
| Google Custom Search API | Web 検索（オプション） | `SCRAPER_CONFIG.CUSTOM_SEARCH_API_KEY` |
| YouTube Data API v3 | YouTube チャンネル検索（オプション） | `SCRAPER_CONFIG.YOUTUBE_API_KEY` |
