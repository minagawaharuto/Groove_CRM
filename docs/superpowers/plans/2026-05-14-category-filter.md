# カテゴリ固有フィルター機能 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 検索UIで区分（モデル/インフルエンサー）を選択したとき、カテゴリ固有のフィルター（タグ選択 / 身長範囲）を動的に表示する。

**Architecture:** `components.html` にフィルターUI行を追加し、`app.js.html` でカテゴリ変更イベントを処理する。バックエンド（GAS）は `Main.js`/`Main.gs` の INDEX_HEADERS に`身長(cm)`を追加し、`IndexService.js`/`IndexService.gs` の `searchPeople()` にタグ・身長フィルターを追加する。`.js` と `.gs` は同内容を保つ。

**Tech Stack:** Vanilla JS, Google Apps Script (GAS), HTML templates

---

## ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `Main.js` | INDEX_HEADERS に `"身長(cm)"` を追加 |
| `Main.gs` | 同上（GAS デプロイ版） |
| `IndexService.js` | `searchPeople()` にタグ・身長フィルターを追加 |
| `IndexService.gs` | 同上（GAS デプロイ版） |
| `components.html` | `tpl-search-view` にカテゴリ固有フィルター行を追加 |
| `app.js.html` | `updateCategoryFilter()` 追加、`initSearchView()` / `doSearch()` 修正 |

---

## Task 1: Main.js / Main.gs に身長列を INDEX_HEADERS へ追加

**Files:**
- Modify: `Main.js:71` （`"タグ",` の直後に挿入）
- Modify: `Main.gs` （同じ箇所）

- [ ] **Step 1: `Main.js` の INDEX_HEADERS を修正**

`Main.js` の `INDEX_HEADERS` 配列（現在18要素）に `"身長(cm)"` を追加する。
位置は `"タグ"` の直後（index 10）に挿入。

変更前（L61-80）:
```javascript
var INDEX_HEADERS = [
  "person_id",
  "区分",
  "名前",
  "ユーザー名",
  "URL",
  "フォロワー数",
  "ギャラ目安",
  "所在地",
  "サブカテゴリ",
  "タグ",
  "ステータス",
  "最終接触日",
  "次アクション日",
  "優先度",
  "担当（社内）",
  "source_sheet",
  "source_row",
  "_search_text",
];
```

変更後:
```javascript
var INDEX_HEADERS = [
  "person_id",
  "区分",
  "名前",
  "ユーザー名",
  "URL",
  "フォロワー数",
  "ギャラ目安",
  "所在地",
  "サブカテゴリ",
  "タグ",
  "身長(cm)",
  "ステータス",
  "最終接触日",
  "次アクション日",
  "優先度",
  "担当（社内）",
  "source_sheet",
  "source_row",
  "_search_text",
];
```

- [ ] **Step 2: `Main.gs` にも同じ変更を適用**

`Main.gs` の `INDEX_HEADERS` も同じ変更を行う（`.js` と `.gs` は常に同内容を保つ）。

- [ ] **Step 3: コミット**

```bash
git add Main.js Main.gs
git commit -m "INDEX_HEADERSに身長(cm)列を追加"
```

---

## Task 2: IndexService.js / IndexService.gs にタグ・身長フィルターを追加

**Files:**
- Modify: `IndexService.js:303-331`（フィルタ定義ブロック）
- Modify: `IndexService.gs`（同じ箇所）

- [ ] **Step 1: `IndexService.js` のタグフィルター追加**

`searchPeople()` 内のフィルタ定義ブロック（L303-309）を修正。
`params.tag` を既存の `filters` オブジェクトに追加する。

変更前（L303-309）:
```javascript
    var filters = {};
    if (params.category) filters["区分"] = params.category;
    if (params.location) filters["所在地"] = params.location;
    if (params.status) filters["ステータス"] = params.status;
    if (params.priority) filters["優先度"] = params.priority;
    if (params.owner) filters["担当（社内）"] = params.owner;
```

変更後:
```javascript
    var filters = {};
    if (params.category) filters["区分"] = params.category;
    if (params.location) filters["所在地"] = params.location;
    if (params.status) filters["ステータス"] = params.status;
    if (params.priority) filters["優先度"] = params.priority;
    if (params.owner) filters["担当（社内）"] = params.owner;
    if (params.tag) filters["タグ"] = params.tag;
```

既存のフィルタ機構は `String(row[colI]).indexOf(expected) === -1` で部分一致判定するため、タグは追加行1行で動作する。

- [ ] **Step 2: `IndexService.js` に身長フィルターを追加**

フォロワー数フィルタ変数宣言ブロック（L318-329）の直後に身長フィルター変数宣言を追加する。

変更前（L318-329）:
```javascript
    // ── フォロワー数フィルタ ──
    var followersMin = params.followersMin
      ? parseInt(params.followersMin, 10)
      : NaN;
    var followersMax = params.followersMax
      ? parseInt(params.followersMax, 10)
      : NaN;
    var followersColIdx = INDEX_HEADERS.indexOf("フォロワー数");

    // ── 次アクション日フィルタ ──
```

変更後:
```javascript
    // ── フォロワー数フィルタ ──
    var followersMin = params.followersMin
      ? parseInt(params.followersMin, 10)
      : NaN;
    var followersMax = params.followersMax
      ? parseInt(params.followersMax, 10)
      : NaN;
    var followersColIdx = INDEX_HEADERS.indexOf("フォロワー数");

    // ── 身長フィルタ ──
    var heightMin = params.heightMin ? parseFloat(params.heightMin) : NaN;
    var heightMax = params.heightMax ? parseFloat(params.heightMax) : NaN;
    var heightColIdx = INDEX_HEADERS.indexOf("身長(cm)");

    // ── 次アクション日フィルタ ──
```

- [ ] **Step 3: `IndexService.js` のフィルタリングループに身長フィルタを追加**

次アクション日フィルタの直後（L388-392）に身長フィルタ処理を追加する。

変更前（L388-395）:
```javascript
      // 次アクション日フィルタ
      if (nextActionFilter && nextActionColIdx !== -1) {
        var dateVal = row[nextActionColIdx];
        if (!_passNextActionFilter(dateVal, nextActionFilter, today)) continue;
      }

      matched.push(row);
```

変更後:
```javascript
      // 次アクション日フィルタ
      if (nextActionFilter && nextActionColIdx !== -1) {
        var dateVal = row[nextActionColIdx];
        if (!_passNextActionFilter(dateVal, nextActionFilter, today)) continue;
      }

      // 身長フィルタ（モデル区分のみ値が存在する）
      if (heightColIdx !== -1 && (!isNaN(heightMin) || !isNaN(heightMax))) {
        var hVal = parseFloat(String(row[heightColIdx]).replace(/[,，]/g, ""));
        if (isNaN(hVal)) hVal = 0;
        if (!isNaN(heightMin) && hVal < heightMin) continue;
        if (!isNaN(heightMax) && hVal > heightMax) continue;
      }

      matched.push(row);
```

- [ ] **Step 4: `IndexService.gs` に同じ変更を適用**

`IndexService.gs` の同該当箇所（Step 1〜3と同じ変更）を適用する。

- [ ] **Step 5: コミット**

```bash
git add IndexService.js IndexService.gs
git commit -m "searchPeople()にタグ・身長フィルターを追加"
```

---

## Task 3: components.html にカテゴリ固有フィルターUIを追加

**Files:**
- Modify: `components.html:50`（`<button type="submit">` の直前に挿入）

- [ ] **Step 1: フィルター行を挿入**

`components.html` の `tpl-search-view` 内、`<button type="submit" ...>` の直前（現在L50）に以下を挿入する。

変更前（L49-51）:
```html
          <div class="form-group" style="min-width:100px;">
            <select class="form-control" id="search-priority">
              <option value="">優先度（全て）</option>
              <option value="高">高</option>
              <option value="中">中</option>
              <option value="低">低</option>
            </select>
          </div>
          <button type="submit" class="btn btn-primary">&#128269; 検索</button>
```

変更後:
```html
          <div class="form-group" style="min-width:100px;">
            <select class="form-control" id="search-priority">
              <option value="">優先度（全て）</option>
              <option value="高">高</option>
              <option value="中">中</option>
              <option value="低">低</option>
            </select>
          </div>
          <!-- カテゴリ固有フィルター -->
          <div id="category-filter-row" style="display:none; flex-basis:100%; display:none;">
            <div id="filter-influencer" class="form-group" style="display:none; min-width:180px;">
              <select class="form-control" id="search-tag">
                <option value="">タグ（全て）</option>
                <option value="TikToker">TikToker</option>
                <option value="YouTuber">YouTuber</option>
                <option value="vlog">vlog</option>
                <option value="アイドル">アイドル</option>
                <option value="アニメ・ゲーム">アニメ・ゲーム</option>
                <option value="アーティスト">アーティスト</option>
                <option value="インフルエンサー">インフルエンサー</option>
                <option value="カップル">カップル</option>
                <option value="クリエイター">クリエイター</option>
                <option value="グルメ">グルメ</option>
                <option value="コスプレ">コスプレ</option>
                <option value="スタイル">スタイル</option>
                <option value="タレント">タレント</option>
                <option value="バーチャルYouTuber">バーチャルYouTuber</option>
                <option value="フィード">フィード</option>
                <option value="フリーアナウンサー">フリーアナウンサー</option>
                <option value="ブランドディレクター">ブランドディレクター</option>
                <option value="ヘルス">ヘルス</option>
                <option value="ホテル・カフェ">ホテル・カフェ</option>
                <option value="ママ">ママ</option>
                <option value="ママ、主婦層">ママ、主婦層</option>
                <option value="マルチタレント">マルチタレント</option>
                <option value="マンガ・イラスト">マンガ・イラスト</option>
                <option value="メンズアイドル">メンズアイドル</option>
                <option value="メンズノンノモデル">メンズノンノモデル</option>
                <option value="モデル">モデル</option>
                <option value="モデル/カメラマン">モデル/カメラマン</option>
                <option value="モデル/タレント">モデル/タレント</option>
                <option value="モデル、インフルエンサー">モデル、インフルエンサー</option>
                <option value="モデル、俳優">モデル、俳優</option>
                <option value="ライフ">ライフ</option>
                <option value="ライフスタイル">ライフスタイル</option>
                <option value="ライフハック">ライフハック</option>
                <option value="ライブ">ライブ</option>
                <option value="リール">リール</option>
                <option value="一人暮らし">一人暮らし</option>
                <option value="丁寧な暮らし">丁寧な暮らし</option>
                <option value="中高生人気IP系">中高生人気IP系</option>
                <option value="俳優">俳優</option>
                <option value="元アイドル">元アイドル</option>
                <option value="元アナウンサー">元アナウンサー</option>
                <option value="勉強/作業動画系">勉強/作業動画系</option>
                <option value="勉強系">勉強系</option>
                <option value="動画クリエイター">動画クリエイター</option>
                <option value="千葉県グルメ">千葉県グルメ</option>
                <option value="双子大食いYouTuber">双子大食いYouTuber</option>
                <option value="大阪グルメ">大阪グルメ</option>
                <option value="奈良県グルメ">奈良県グルメ</option>
                <option value="女優">女優</option>
                <option value="女優/タレント">女優/タレント</option>
                <option value="女子会系">女子会系</option>
                <option value="女性大食いYouTuber">女性大食いYouTuber</option>
                <option value="妊婦・妊活">妊婦・妊活</option>
                <option value="学生人気">学生人気</option>
                <option value="実績あり">実績あり</option>
                <option value="家族">家族</option>
                <option value="文房具紹介系">文房具紹介系</option>
                <option value="旅行">旅行</option>
                <option value="男性大食いYouTuber">男性大食いYouTuber</option>
                <option value="過去PR枠">過去PR枠</option>
                <option value="関西グルメ">関西グルメ</option>
                <option value="音楽">音楽</option>
                <option value="食・ワイン">食・ワイン</option>
              </select>
            </div>
            <div id="filter-model" class="form-group" style="display:none; align-items:center; gap:6px;">
              <span class="text-sm text-muted">身長</span>
              <input type="number" class="form-control" id="search-height-min"
                     placeholder="下限(cm)" min="140" max="200" style="width:90px;">
              <span class="text-sm text-muted">〜</span>
              <input type="number" class="form-control" id="search-height-max"
                     placeholder="上限(cm)" min="140" max="200" style="width:90px;">
              <span class="text-sm text-muted">cm</span>
            </div>
          </div>
          <button type="submit" class="btn btn-primary">&#128269; 検索</button>
```

- [ ] **Step 2: コミット**

```bash
git add components.html
git commit -m "検索フォームにカテゴリ固有フィルター行を追加"
```

---

## Task 4: app.js.html に JS ロジックを追加

**Files:**
- Modify: `app.js.html:194-237`（`initSearchView()` 関数）
- Modify: `app.js.html:307-321`（`doSearch()` 関数の params オブジェクト）

- [ ] **Step 1: `updateCategoryFilter()` 関数を追加**

`initFollowerSlider` 関数の直前（L239 付近）に新しい `updateCategoryFilter()` 関数を挿入する。

```javascript
  // ─── カテゴリ固有フィルター切り替え ──────────────────────────
  function updateCategoryFilter(category) {
    var row = document.getElementById('category-filter-row');
    var filterInfluencer = document.getElementById('filter-influencer');
    var filterModel = document.getElementById('filter-model');
    if (!row || !filterInfluencer || !filterModel) return;

    // 前のフィルター値をリセット
    var tagEl = document.getElementById('search-tag');
    var heightMinEl = document.getElementById('search-height-min');
    var heightMaxEl = document.getElementById('search-height-max');
    if (tagEl) tagEl.value = '';
    if (heightMinEl) heightMinEl.value = '';
    if (heightMaxEl) heightMaxEl.value = '';

    if (category === 'インフルエンサー') {
      row.style.display = 'flex';
      filterInfluencer.style.display = 'block';
      filterModel.style.display = 'none';
    } else if (category === 'モデル') {
      row.style.display = 'flex';
      filterInfluencer.style.display = 'none';
      filterModel.style.display = 'flex';
    } else {
      row.style.display = 'none';
      filterInfluencer.style.display = 'none';
      filterModel.style.display = 'none';
    }
  }
```

- [ ] **Step 2: `initSearchView()` に category change イベントを追加**

`initSearchView()` 内のスライダー初期化行（`initFollowerSlider();`）の直前に以下を追加する。

変更前（L232-236）:
```javascript
    // フォロワー数レンジスライダー
    initFollowerSlider();

    // 初期検索
    doSearch();
```

変更後:
```javascript
    // 区分変更でカテゴリ固有フィルターを切り替え
    var categorySelect = document.getElementById('search-category');
    if (categorySelect) {
      categorySelect.addEventListener('change', function() {
        updateCategoryFilter(this.value);
        state.searchPage = 1;
        doSearch();
      });
    }

    // フォロワー数レンジスライダー
    initFollowerSlider();

    // 初期検索
    doSearch();
```

- [ ] **Step 3: `doSearch()` の params にタグ・身長を追加**

`doSearch()` 内の `params` オブジェクト（L311-321）に3行追加する。

変更前（L311-321）:
```javascript
    var params = {
      keyword:          document.getElementById('search-keyword').value,
      category:         document.getElementById('search-category').value,
      status:           document.getElementById('search-status').value,
      priority:         document.getElementById('search-priority').value,
      followersMin:     document.getElementById('search-followers-min').value,
      followersMax:     document.getElementById('search-followers-max').value,
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

- [ ] **Step 4: コミット**

```bash
git add app.js.html
git commit -m "カテゴリ固有フィルターのJSロジックを追加"
```

---

## Task 5: rebuildIndex() 実行（GASデプロイ後）

身長列をインデックスに反映するために、GASデプロイ後に `rebuildIndex()` を実行する必要がある。

- [ ] **Step 1: GAS エディタまたはCRMの管理画面から `rebuildIndex()` を実行する**

  GAS プロジェクトにデプロイ後、スクリプトエディタで `rebuildIndex` を手動実行するか、CRMの管理画面のインデックス再構築ボタンを使用する。

- [ ] **Step 2: 90_Index シートに `身長(cm)` 列が追加されたことを確認する**

  スプレッドシートの 90_Index シートを開き、ヘッダー行に `身長(cm)` が含まれており、モデルの行に身長値が入っていることを確認する。

---

## 実装後の動作確認チェックリスト

- [ ] 区分「インフルエンサー」を選択するとタグドロップダウンが表示される
- [ ] 区分「モデル」を選択すると身長範囲入力が表示される
- [ ] 区分「スポーツ選手・著名人」を選択するとカテゴリフィルターは非表示
- [ ] 区分を変更すると前のフィルター値がクリアされる
- [ ] タグ選択後に検索するとタグに一致する人物のみ表示される
- [ ] 身長範囲指定後に検索すると範囲内のモデルのみ表示される
