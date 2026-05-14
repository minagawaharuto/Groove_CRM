# カテゴリ固有フィルター機能 設計ドキュメント

**日付**: 2026-05-14
**対象ブランチ**: dev

---

## 概要

検索UIにカテゴリ（区分）選択に連動した固有フィルターを追加する。
区分セレクトボックスで選択した値に応じて、フォーム内に追加フィルター行が動的に表示される。

---

## 要件

| カテゴリ | 追加フィルター |
|---|---|
| インフルエンサー | タグ（プルダウン、単一選択） |
| モデル | 身長(cm) 範囲（下限・上限の数値入力） |
| スポーツ選手・著名人 | なし |
| 全て（未選択） | なし |

---

## UI設計（components.html）

### 変更箇所

`tpl-search-view` 内の検索フォーム（`#search-form`）に、カテゴリ固有フィルター行を追加する。
既存フォームの `<button type="submit">` の直前に挿入。

### カテゴリ固有フィルター行

```html
<div id="category-filter-row" style="display:none; width:100%; flex-basis:100%;">
  <!-- インフルエンサー用タグドロップダウン -->
  <div id="filter-influencer" class="form-group" style="display:none; min-width:160px;">
    <select class="form-control" id="search-tag">
      <option value="">タグ（全て）</option>
      <!-- 64件のタグをoptionとして列挙 -->
    </select>
  </div>
  <!-- モデル用身長範囲入力 -->
  <div id="filter-model" class="form-group" style="display:none; align-items:center; gap:6px; display:flex;">
    <span class="text-sm">身長</span>
    <input type="number" class="form-control" id="search-height-min"
           placeholder="下限(cm)" min="140" max="200" style="width:90px;">
    <span class="text-sm">〜</span>
    <input type="number" class="form-control" id="search-height-max"
           placeholder="上限(cm)" min="140" max="200" style="width:90px;">
    <span class="text-sm">cm</span>
  </div>
</div>
```

### タグ選択肢（インフルエンサーシートの「タグ」カラムから抽出、64件）

TikToker / YouTuber / vlog / アイドル / アニメ・ゲーム / アーティスト / インフルエンサー / カップル / クリエイター / グルメ / コスプレ / スタイル / タレント / バーチャルYouTuber / フィード / フリーアナウンサー / ブランドディレクター / ヘルス / ホテル・カフェ / ママ / ママ、主婦層 / マルチタレント / マンガ・イラスト / メンズアイドル / メンズノンノモデル / モデル / モデル/カメラマン / モデル/タレント / モデル、インフルエンサー / モデル、俳優 / ライフ / ライフスタイル / ライフハック / ライブ / リール / 一人暮らし / 丁寧な暮らし / 中高生人気IP系 / 俳優 / 元アイドル / 元アナウンサー / 勉強/作業動画系 / 勉強系 / 動画クリエイター / 千葉県グルメ / 双子大食いYouTuber / 大阪グルメ / 奈良県グルメ / 女優 / 女優/タレント / 女子会系 / 女性大食いYouTuber / 妊婦・妊活 / 学生人気 / 実績あり / 家族 / 文房具紹介系 / 旅行 / 男性大食いYouTuber / 過去PR枠 / 関西グルメ / 音楽 / 食・ワイン

---

## JS設計（app.js.html）

### initSearchView() への追加

区分セレクト（`#search-category`）の `change` イベントで `updateCategoryFilter()` を呼び出す。

```
#search-category change
  → updateCategoryFilter(value)
    - 'インフルエンサー': #category-filter-row を表示、#filter-influencer を表示、#filter-model を非表示
    - 'モデル':           #category-filter-row を表示、#filter-model を表示、#filter-influencer を非表示
    - その他:            #category-filter-row を非表示、両フィルターを非表示、入力値をリセット
```

### doSearch() への追加

既存パラメータに以下を追加してAPIに渡す：

- `tag` = `#search-tag` の値（インフルエンサー選択時のみ使用されるが、常に収集）
- `heightMin` = `#search-height-min` の値
- `heightMax` = `#search-height-max` の値

### カテゴリ変更時のリセット

`updateCategoryFilter()` 内で、切り替え時に前のカテゴリのフィルター値をクリアする。

---

## バックエンド設計（api_views.py）

### search_people エンドポイントへの追加

#### タグフィルター

```python
tag = request.GET.get('tag', '').strip()
if tag:
    people = [p for p in people if tag in str(p.get('タグ', ''))]
```

#### 身長フィルター

```python
height_min = request.GET.get('heightMin', '').strip()
height_max = request.GET.get('heightMax', '').strip()
if height_min:
    people = [p for p in people if _to_float(p.get('身長(cm)')) >= float(height_min)]
if height_max:
    people = [p for p in people if _to_float(p.get('身長(cm)')) <= float(height_max)]
```

`_to_float()` は既存の数値変換ヘルパーを流用（なければ追加）。

---

## 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `components.html` | `tpl-search-view` にカテゴリ固有フィルター行を追加 |
| `app.js.html` | `updateCategoryFilter()` 関数追加、`initSearchView()` と `doSearch()` を修正 |
| `django_backend/crm_app/api_views.py` | `tag` / `heightMin` / `heightMax` フィルター処理を追加 |

---

## 非機能要件

- カテゴリ変更時にフィルターが即座に切り替わること（アニメーション不要）
- 区分が「全て」に戻ったとき、カテゴリ固有フィルターの値は自動クリアされること
- 身長の入力はmin/max属性で140〜200cmの範囲に制限する
