# 検索フィルター拡張 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 検索UIにフォロワー数手入力・年齢・居住地・担当・プラットフォーム・事務所フィルターを追加し、フォロワー数スライダーを廃止する。

**Architecture:** `Main.js`/`Main.gs` の INDEX_HEADERS に3列追加 → `IndexService.js`/`IndexService.gs` にフィルターロジック追加 → `components.html` でUIを再構成 → `app.js.html` でスライダー関連コードを削除しパラメータを追加する。

**Tech Stack:** Vanilla JS, Google Apps Script (GAS), HTML templates

---

## ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `Main.js` | INDEX_HEADERS に 年齢・メインプラットフォーム・所属事務所 を追加 |
| `Main.gs` | 同上 |
| `IndexService.js` | platform/年齢/事務所フィルターを追加 |
| `IndexService.gs` | 同上 |
| `components.html` | フォーム行3・行4追加、スライダー削除 |
| `app.js.html` | スライダー関連コード削除、doSearch()パラメータ追加、_toFollowerVal()追加 |

---

## Task 1: Main.js / Main.gs に3列追加

**Files:**
- Modify: `Main.js:61-80`
- Modify: `Main.gs:61-80`

- [ ] **Step 1: `Main.js` の INDEX_HEADERS を修正**

`"担当（社内）"` の直後に3行を挿入する。

変更前:
```javascript
  "担当（社内）",
  "source_sheet",
```

変更後:
```javascript
  "担当（社内）",
  "年齢",
  "メインプラットフォーム",
  "所属事務所",
  "source_sheet",
```

- [ ] **Step 2: `Main.gs` に同じ変更を適用**

`Main.gs` の同箇所（`"担当（社内）"` の直後）に同じ3行を挿入する。

- [ ] **Step 3: コミット**

```bash
git add Main.js Main.gs
git commit -m "INDEX_HEADERSに年齢・プラットフォーム・事務所列を追加"
```

---

## Task 2: IndexService.js / IndexService.gs にフィルターを追加

**Files:**
- Modify: `IndexService.js:303-400`
- Modify: `IndexService.gs:303-400`（行番号は同等）

- [ ] **Step 1: `IndexService.js` に platform フィルターを追加**

既存の filters オブジェクト定義ブロックを修正する。

変更前:
```javascript
    if (params.tag) filters["タグ"] = params.tag;
```

変更後:
```javascript
    if (params.tag) filters["タグ"] = params.tag;
    if (params.platform) filters["メインプラットフォーム"] = params.platform;
```

- [ ] **Step 2: `IndexService.js` に年齢・事務所のフィルタ変数を追加**

身長フィルタ変数宣言ブロックの直後に追加する。

変更前:
```javascript
    // ── 身長フィルタ ──
    var heightMin = params.heightMin ? parseFloat(params.heightMin) : NaN;
    var heightMax = params.heightMax ? parseFloat(params.heightMax) : NaN;
    var heightColIdx = INDEX_HEADERS.indexOf("身長(cm)");

    // ── 次アクション日フィルタ ──
```

変更後:
```javascript
    // ── 身長フィルタ ──
    var heightMin = params.heightMin ? parseFloat(params.heightMin) : NaN;
    var heightMax = params.heightMax ? parseFloat(params.heightMax) : NaN;
    var heightColIdx = INDEX_HEADERS.indexOf("身長(cm)");

    // ── 年齢フィルタ ──
    var ageMin = params.ageMin ? parseInt(params.ageMin, 10) : NaN;
    var ageMax = params.ageMax ? parseInt(params.ageMax, 10) : NaN;
    var ageColIdx = INDEX_HEADERS.indexOf("年齢");

    // ── 事務所フィルタ ──
    var agency = params.agency || '';
    var agencyColIdx = INDEX_HEADERS.indexOf("所属事務所");

    // ── 次アクション日フィルタ ──
```

- [ ] **Step 3: `IndexService.js` のフィルタリングループに年齢・事務所を追加**

身長フィルタブロックの直後（`matched.push(row)` の直前）に追加する。

変更前:
```javascript
      // 身長フィルタ（モデル区分のみ値が存在する）
      if (heightColIdx !== -1 && (!isNaN(heightMin) || !isNaN(heightMax))) {
        var hVal = parseFloat(String(row[heightColIdx]).replace(/[,，]/g, ""));
        if (isNaN(hVal)) hVal = 0;
        if (!isNaN(heightMin) && hVal < heightMin) continue;
        if (!isNaN(heightMax) && hVal > heightMax) continue;
      }

      matched.push(row);
```

変更後:
```javascript
      // 身長フィルタ（モデル区分のみ値が存在する）
      if (heightColIdx !== -1 && (!isNaN(heightMin) || !isNaN(heightMax))) {
        var hVal = parseFloat(String(row[heightColIdx]).replace(/[,，]/g, ""));
        if (isNaN(hVal)) hVal = 0;
        if (!isNaN(heightMin) && hVal < heightMin) continue;
        if (!isNaN(heightMax) && hVal > heightMax) continue;
      }

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

      matched.push(row);
```

- [ ] **Step 4: `IndexService.gs` に同じ変更を適用（Step 1〜3と同内容）**

- [ ] **Step 5: コミット**

```bash
git add IndexService.js IndexService.gs
git commit -m "searchPeople()にプラットフォーム・年齢・事務所フィルターを追加"
```

---

## Task 3: components.html のUI再構成

**Files:**
- Modify: `components.html:19-73`（`#search-form` 内と `#follower-slider-wrap`）

- [ ] **Step 1: フォーム行3・行4を追加**

`#category-filter-row` の直後（`<button type="submit">` の直前）に行3・行4を挿入する。

変更前:
```html
          <!-- カテゴリ固有フィルター（常時表示・区分に応じてdisabled切替） -->
          <div id="category-filter-row" ...>
            ...
          </div>
          <button type="submit" class="btn btn-primary">&#128269; 検索</button>
```

変更後:
```html
          <!-- カテゴリ固有フィルター（常時表示・区分に応じてdisabled切替） -->
          <div id="category-filter-row" ...>
            ...
          </div>
          <!-- 行3: フォロワー数・年齢・居住地・担当 -->
          <div style="flex-basis:100%; display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">
            <div class="form-group" style="display:flex; align-items:center; gap:4px;">
              <span class="text-sm text-muted">F数</span>
              <input type="number" class="form-control" id="search-followers-min-input"
                     placeholder="下限(万)" min="0" style="width:80px;">
              <span class="text-sm text-muted">〜</span>
              <input type="number" class="form-control" id="search-followers-max-input"
                     placeholder="上限(万)" min="0" style="width:80px;">
              <span class="text-sm text-muted">万</span>
            </div>
            <div class="form-group" style="display:flex; align-items:center; gap:4px;">
              <span class="text-sm text-muted">年齢</span>
              <input type="number" class="form-control" id="search-age-min"
                     placeholder="下限" min="0" max="100" style="width:70px;">
              <span class="text-sm text-muted">〜</span>
              <input type="number" class="form-control" id="search-age-max"
                     placeholder="上限" min="0" max="100" style="width:70px;">
              <span class="text-sm text-muted">歳</span>
            </div>
            <div class="form-group" style="min-width:120px;">
              <input type="text" class="form-control" id="search-location" placeholder="居住地">
            </div>
            <div class="form-group" style="min-width:120px;">
              <input type="text" class="form-control" id="search-owner" placeholder="担当">
            </div>
          </div>
          <!-- 行4: プラットフォーム・事務所 -->
          <div style="flex-basis:100%; display:flex; flex-wrap:wrap; gap:10px; align-items:flex-end;">
            <div class="form-group" style="min-width:170px;">
              <select class="form-control" id="search-platform">
                <option value="">プラットフォーム（全て）</option>
                <option value="Instagram">Instagram</option>
                <option value="TikTok">TikTok</option>
                <option value="YouTube">YouTube</option>
                <option value="X(Twitter)">X(Twitter)</option>
              </select>
            </div>
            <div class="form-group" style="min-width:140px;">
              <select class="form-control" id="search-agency">
                <option value="">事務所（全て）</option>
                <option value="有">有（登録あり）</option>
                <option value="無">無（登録なし）</option>
              </select>
            </div>
          </div>
          <button type="submit" class="btn btn-primary">&#128269; 検索</button>
```

- [ ] **Step 2: フォロワー数スライダーを削除**

`<!-- フォロワー数レンジスライダー -->` の div（`#follower-slider-wrap`）全体を削除する。

削除対象（`</form>` の直後から `<!-- クイックフィルタ -->` の直前まで）:
```html
        <!-- フォロワー数レンジスライダー -->
        <div class="range-slider-wrap" id="follower-slider-wrap">
          <div class="range-slider-header">
            <span class="range-slider-label">📊 フォロワー数</span>
            <span class="range-slider-values" id="follower-range-display">0 〜 1,000,000+</span>
          </div>
          <div class="range-slider-container">
            <div class="range-slider-track"></div>
            <div class="range-slider-fill" id="follower-slider-fill"></div>
            <input type="range" id="follower-range-min" min="0" max="100" value="0" step="1">
            <input type="range" id="follower-range-max" min="0" max="100" value="100" step="1">
          </div>
          <input type="hidden" id="search-followers-min">
          <input type="hidden" id="search-followers-max">
        </div>
```

- [ ] **Step 3: コミット**

```bash
git add components.html
git commit -m "検索フォームにフィルター行3・行4を追加しスライダーを削除"
```

---

## Task 4: app.js.html のJS更新

**Files:**
- Modify: `app.js.html:232-362`

- [ ] **Step 1: スライダー関連コードを削除**

以下のコードブロックをまとめて削除する（`updateCategoryFilter` 関数の直前まで）:

削除対象（`// ─── フォロワー数スライダー ───` から `initFollowerSlider()` 関数の末尾 `}` まで）:
```javascript
  // ─── フォロワー数スライダー ──────────────────────────────
  var FOLLOWER_STEPS = [
    0, 500, 1000, 2000, 3000, 5000, 7000,
    10000, 15000, 20000, 30000, 50000, 70000,
    100000, 150000, 200000, 300000, 500000, 700000, 1000000
  ];

  function sliderToFollowers(val) {
    var idx = Math.round(val / 100 * (FOLLOWER_STEPS.length - 1));
    return FOLLOWER_STEPS[Math.min(idx, FOLLOWER_STEPS.length - 1)];
  }

  function formatFollowers(n) {
    if (n >= 1000000) return (n / 10000).toLocaleString() + '万+';
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(n);
  }

  function initFollowerSlider() {
    var rangeMin = document.getElementById('follower-range-min');
    var rangeMax = document.getElementById('follower-range-max');
    var fill = document.getElementById('follower-slider-fill');
    var display = document.getElementById('follower-range-display');
    var hiddenMin = document.getElementById('search-followers-min');
    var hiddenMax = document.getElementById('search-followers-max');
    if (!rangeMin || !rangeMax) return;

    var searchTimer = null;

    function updateSlider() {
      var minVal = parseInt(rangeMin.value, 10);
      var maxVal = parseInt(rangeMax.value, 10);
      // MIN が MAX を超えないようガード
      if (minVal > maxVal) {
        rangeMin.value = maxVal;
        minVal = maxVal;
      }
      var minFollowers = sliderToFollowers(minVal);
      var maxFollowers = sliderToFollowers(maxVal);
      // hidden input に反映
      hiddenMin.value = minVal === 0 ? '' : String(minFollowers);
      hiddenMax.value = maxVal === 100 ? '' : String(maxFollowers);
      // 表示更新
      var minStr = formatFollowers(minFollowers);
      var maxStr = maxVal === 100 ? '上限なし' : formatFollowers(maxFollowers);
      display.textContent = minStr + ' 〜 ' + maxStr;
      // バー位置更新
      fill.style.left = minVal + '%';
      fill.style.width = (maxVal - minVal) + '%';
    }

    function triggerSearch() {
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function() {
        state.searchPage = 1;
        doSearch();
      }, 400);
    }

    rangeMin.addEventListener('input', updateSlider);
    rangeMax.addEventListener('input', updateSlider);
    rangeMin.addEventListener('change', triggerSearch);
    rangeMax.addEventListener('change', triggerSearch);

    updateSlider();
  }
```

- [ ] **Step 2: `initSearchView()` から `initFollowerSlider()` 呼び出しを削除**

変更前:
```javascript
    // フォロワー数レンジスライダー
    initFollowerSlider();

    // 初期検索
    doSearch();
```

変更後:
```javascript
    // 初期検索
    doSearch();
```

- [ ] **Step 3: `_toFollowerVal()` ヘルパーを追加**

`updateCategoryFilter()` 関数の直前に追加する:

```javascript
  // ─── フォロワー数変換（万単位 → 実数） ──────────────────────
  function _toFollowerVal(val) {
    var n = parseFloat(val);
    if (isNaN(n) || val === '') return '';
    return String(Math.round(n * 10000));
  }
```

- [ ] **Step 4: `doSearch()` の params を更新**

変更前:
```javascript
    var params = {
      keyword:          document.getElementById('search-keyword').value,
      category:         document.getElementById('search-category').value,
      status:           document.getElementById('search-status').value,
      priority:         document.getElementById('search-priority').value,
      followersMin:     document.getElementById('search-followers-min').value,
      followersMax:     document.getElementById('search-followers-max').value,
      tag:              (document.getElementById('search-tag') || {}).value || '',
      heightMin:        (document.getElementById('search-height-min') || {}).value || '',
      heightMax:        (document.getElementById('search-height-max') || {}).value || '',
      nextActionFilter: state.nextActionFilter,
      page:             state.searchPage,
      pageSize:         state.searchPageSize
    };
```

変更後:
```javascript
    var params = {
      keyword:          document.getElementById('search-keyword').value,
      category:         document.getElementById('search-category').value,
      status:           document.getElementById('search-status').value,
      priority:         document.getElementById('search-priority').value,
      followersMin:     _toFollowerVal((document.getElementById('search-followers-min-input') || {}).value || ''),
      followersMax:     _toFollowerVal((document.getElementById('search-followers-max-input') || {}).value || ''),
      tag:              (document.getElementById('search-tag') || {}).value || '',
      heightMin:        (document.getElementById('search-height-min') || {}).value || '',
      heightMax:        (document.getElementById('search-height-max') || {}).value || '',
      ageMin:           (document.getElementById('search-age-min') || {}).value || '',
      ageMax:           (document.getElementById('search-age-max') || {}).value || '',
      location:         (document.getElementById('search-location') || {}).value || '',
      owner:            (document.getElementById('search-owner') || {}).value || '',
      platform:         (document.getElementById('search-platform') || {}).value || '',
      agency:           (document.getElementById('search-agency') || {}).value || '',
      nextActionFilter: state.nextActionFilter,
      page:             state.searchPage,
      pageSize:         state.searchPageSize
    };
```

- [ ] **Step 5: コミット**

```bash
git add app.js.html
git commit -m "スライダー削除・新フィルターパラメータをdoSearch()に追加"
```

---

## 動作確認チェックリスト

- [ ] フォロワー数欄に「5」と入力して検索 → 5万人以上がフィルタされること
- [ ] 年齢欄に「20〜30」を入力して検索 → 20〜30歳のみ表示されること
- [ ] プラットフォーム「Instagram」を選択して検索 → Instagramのみ表示されること
- [ ] 事務所「有」を選択して検索 → 事務所登録ありのみ表示されること
- [ ] rebuildIndex() 実行後に年齢・プラットフォーム・事務所列がインデックスに含まれること
