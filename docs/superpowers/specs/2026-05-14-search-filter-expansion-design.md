# 検索フィルター拡張 設計ドキュメント

**日付**: 2026-05-14
**対象ブランチ**: dev

---

## 概要

検索UIのフィルターを大幅に拡張する。
フォロワー数スライダーを廃止して数値入力に統一し、年齢・居住地・担当・プラットフォーム・事務所フィルターを追加する。

---

## 要件

| フィルター | 種別 | 仕様 |
|---|---|---|
| フォロワー数 | 数値2入力（万単位） | 既存スライダーを廃止。空欄=制限なし |
| 年齢 | 数値2入力（歳） | 空欄=制限なし。'28歳'形式を数値変換 |
| 居住地 | テキスト入力 | 部分一致 |
| 担当 | テキスト入力 | 部分一致 |
| プラットフォーム | セレクト | 全て / Instagram / TikTok / YouTube / X(Twitter) |
| 事務所 | セレクト | 全て / 有（登録あり）/ 無（登録なし） |

---

## フォームレイアウト（components.html）

`tpl-search-view` の `#search-form` を4行構成に変更する。

```
行1: [フリーワード(wide)] [区分▼] [ステータス▼] [優先度▼] [検索]
行2: [タグ▼(disabled)] [身長__~__cm(disabled)]   ← 既存カテゴリフィルター
行3: [F数 __万~__万] [年齢 __~__歳] [居住地____] [担当____]
行4: [プラットフォーム▼] [事務所▼]
```

### フォロワー数（行3）

```html
<div class="form-group" style="display:flex; align-items:center; gap:4px; min-width:200px;">
  <span class="text-sm text-muted">F数</span>
  <input type="number" class="form-control" id="search-followers-min-input"
         placeholder="下限(万)" min="0" style="width:80px;">
  <span class="text-sm text-muted">〜</span>
  <input type="number" class="form-control" id="search-followers-max-input"
         placeholder="上限(万)" min="0" style="width:80px;">
  <span class="text-sm text-muted">万</span>
</div>
```

値は万単位で入力。doSearch() 内で ×10000 して API に渡す。

### 年齢（行3）

```html
<div class="form-group" style="display:flex; align-items:center; gap:4px; min-width:180px;">
  <span class="text-sm text-muted">年齢</span>
  <input type="number" class="form-control" id="search-age-min"
         placeholder="下限" min="0" max="100" style="width:70px;">
  <span class="text-sm text-muted">〜</span>
  <input type="number" class="form-control" id="search-age-max"
         placeholder="上限" min="0" max="100" style="width:70px;">
  <span class="text-sm text-muted">歳</span>
</div>
```

### 居住地（行3）

```html
<div class="form-group" style="min-width:120px;">
  <input type="text" class="form-control" id="search-location" placeholder="居住地">
</div>
```

### 担当（行3）

```html
<div class="form-group" style="min-width:120px;">
  <input type="text" class="form-control" id="search-owner" placeholder="担当">
</div>
```

### プラットフォーム（行4）

```html
<div class="form-group" style="min-width:150px;">
  <select class="form-control" id="search-platform">
    <option value="">プラットフォーム（全て）</option>
    <option value="Instagram">Instagram</option>
    <option value="TikTok">TikTok</option>
    <option value="YouTube">YouTube</option>
    <option value="X(Twitter)">X(Twitter)</option>
  </select>
</div>
```

### 事務所（行4）

```html
<div class="form-group" style="min-width:120px;">
  <select class="form-control" id="search-agency">
    <option value="">事務所（全て）</option>
    <option value="有">有（登録あり）</option>
    <option value="無">無（登録なし）</option>
  </select>
</div>
```

### 削除する要素

- `#follower-slider-wrap`（フォロワー数レンジスライダー全体）
- `#search-followers-min`、`#search-followers-max`（hidden input）

---

## JS設計（app.js.html）

### 削除するコード

- `FOLLOWER_STEPS` 配列（L280付近）
- `sliderToFollowers()` 関数
- `formatFollowers()` 関数
- `initFollowerSlider()` 関数
- `initSearchView()` 内の `initFollowerSlider()` 呼び出し

### doSearch() の params 変更

```javascript
// 変更前
followersMin: document.getElementById('search-followers-min').value,
followersMax: document.getElementById('search-followers-max').value,

// 変更後（万単位 → 実数変換）
followersMin: _toFollowerVal(document.getElementById('search-followers-min-input').value),
followersMax: _toFollowerVal(document.getElementById('search-followers-max-input').value),
ageMin:       (document.getElementById('search-age-min') || {}).value || '',
ageMax:       (document.getElementById('search-age-max') || {}).value || '',
location:     (document.getElementById('search-location') || {}).value || '',
owner:        (document.getElementById('search-owner') || {}).value || '',
platform:     (document.getElementById('search-platform') || {}).value || '',
agency:       (document.getElementById('search-agency') || {}).value || '',
```

### 追加するヘルパー関数

```javascript
function _toFollowerVal(val) {
  var n = parseFloat(val);
  if (isNaN(n) || val === '') return '';
  return String(Math.round(n * 10000));
}
```

---

## バックエンド設計（Main.js / Main.gs / IndexService.js / IndexService.gs）

### INDEX_HEADERS への追加（Main.js / Main.gs）

`"担当（社内）"` の直後に3列を追加する：

```javascript
"年齢",
"メインプラットフォーム",
"所属事務所",
```

### searchPeople() への追加（IndexService.js / IndexService.gs）

#### 既存 filters オブジェクトに追加

```javascript
if (params.platform) filters["メインプラットフォーム"] = params.platform;
```

#### 年齢フィルタ変数（身長フィルタ変数宣言の直後に追加）

```javascript
// ── 年齢フィルタ ──
var ageMin = params.ageMin ? parseInt(params.ageMin, 10) : NaN;
var ageMax = params.ageMax ? parseInt(params.ageMax, 10) : NaN;
var ageColIdx = INDEX_HEADERS.indexOf("年齢");
```

#### 事務所フィルタ変数（年齢フィルタ変数の直後に追加）

```javascript
// ── 事務所フィルタ ──
var agency = params.agency || '';
var agencyColIdx = INDEX_HEADERS.indexOf("所属事務所");
```

#### フィルタリングループへの追加（身長フィルタの直後に追加）

```javascript
// 年齢フィルタ（'28歳' → 28 に変換）
if (ageColIdx !== -1 && (!isNaN(ageMin) || !isNaN(ageMax))) {
  var ageStr = String(row[ageColIdx]).replace(/[歳才]/g, '').trim();
  var aVal = parseInt(ageStr, 10);
  if (isNaN(aVal)) aVal = 0;
  if (!isNaN(ageMin) && aVal < ageMin) continue;
  if (!isNaN(ageMax) && aVal > ageMax) continue;
}

// 事務所フィルタ
if (agency && agencyColIdx !== -1) {
  var agencyVal = String(row[agencyColIdx]).trim();
  if (agency === '有' && !agencyVal) continue;
  if (agency === '無' && agencyVal) continue;
}
```

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `components.html` | フォーム行3・行4の追加、スライダー削除 |
| `app.js.html` | スライダー関連コード削除、doSearch()パラメータ追加、_toFollowerVal()追加 |
| `Main.js` | INDEX_HEADERSに年齢・メインプラットフォーム・所属事務所を追加 |
| `Main.gs` | 同上 |
| `IndexService.js` | platform/年齢/事務所フィルターを追加 |
| `IndexService.gs` | 同上 |

---

## 非機能要件

- フォロワー数の入力は万単位（例: 5 → 50,000人）
- 年齢は '28歳' / '28' / 整数のいずれの形式でも正しくフィルタされること
- 事務所「有」はスペースのみの値も空として扱うこと（trim()で判定）
- rebuildIndex() 実行後に新列（年齢・メインプラットフォーム・所属事務所）がインデックスに反映されること
