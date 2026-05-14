/**
 * ============================================================
 *  IndexService.gs — 90_Index 構築・検索
 *  タレント・インフルエンサー管理 CRM
 * ============================================================
 */

/**
 * rebuildIndex()
 * 3人物シートを順に読み込み、90_Index シートを全クリア後に書き込み。
 * - person_id が無い行は UUID を生成して人物シートにも書き込む
 * - source_sheet, source_row を記録
 * - 冪等性: 毎回全削除→再生成
 *
 * @return {Object}
 */
function rebuildIndex() {
  try {
    requireAdmin();

    var ss = getSpreadsheet();
    var indexSheet = getSheet(SHEET.INDEX);

    // ── 90_Index を全クリア ──
    var lastRow = indexSheet.getLastRow();
    if (lastRow > 1) {
      indexSheet
        .getRange(2, 1, lastRow - 1, indexSheet.getLastColumn() || INDEX_HEADERS.length)
        .clearContent();
      if (lastRow > 2) {
        indexSheet.deleteRows(2, lastRow - 1);
      }
    }

    // ヘッダを常に最新の INDEX_HEADERS で上書き（列順を保証）
    if (indexSheet.getLastRow() === 0) {
      indexSheet.appendRow(INDEX_HEADERS);
    } else {
      indexSheet.getRange(1, 1, 1, INDEX_HEADERS.length).setValues([INDEX_HEADERS]);
    }
    indexSheet
      .getRange(1, 1, 1, INDEX_HEADERS.length)
      .setFontWeight("bold")
      .setBackground("#4a90d9")
      .setFontColor("#ffffff");

    var allRows = [];
    var diagnostics = [];

    // ── 人物シート（モデル/インフルエンサー/スポーツ選手・著名人）を順に処理 ──
    for (var s = 0; s < PERSON_SHEETS.length; s++) {
      var sheetName = PERSON_SHEETS[s];
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        diagnostics.push(sheetName + ":シートなし");
        continue;
      }

      var data = sheet.getDataRange().getValues();
      if (data.length < 2) {
        diagnostics.push(sheetName + ":データなし");
        continue;
      }

      var headers = data[0];

      // 名前列をヘッダから動的に特定（見つからなければスキップ）
      var nameColIdx = -1;
      for (var hh = 0; hh < headers.length; hh++) {
        if (String(headers[hh]).trim() === "名前") { nameColIdx = hh; break; }
      }
      if (nameColIdx === -1) {
        diagnostics.push(sheetName + ":名前列なし(スキップ)");
        continue; // 「名前」列のないシートは人物シートではない
      }

      // person_id列をヘッダから動的に特定
      var personIdColIdx = -1;
      for (var hp = 0; hp < headers.length; hp++) {
        if (String(headers[hp]).trim() === "person_id") { personIdColIdx = hp; break; }
      }

      // 見つからなければ、一番右端に列を新規作成
      if (personIdColIdx === -1) {
        var lastCol = sheet.getLastColumn();
        if (lastCol === 0) lastCol = headers.length;
        personIdColIdx = lastCol; // 0-indexed

        var targetHeader = sheet.getRange(1, personIdColIdx + 1);
        targetHeader.setValue("person_id")
                    .setFontWeight("bold")
                    .setBackground("#4a90d9")
                    .setFontColor("#ffffff");
        
        headers[personIdColIdx] = "person_id"; // ヘッダ情報の更新
      }

      // シート名から区分を推定
      var category = _inferCategory(sheetName);

      var sheetCount = 0;
      for (var i = 1; i < data.length; i++) {
        // 空行スキップ（名前列が空なら無視）
        if (!data[i][nameColIdx] || String(data[i][nameColIdx]).trim() === "") continue;

        // 行の配列長が足りない場合は拡張する
        if (data[i].length <= personIdColIdx) {
          while (data[i].length <= personIdColIdx) {
            data[i].push("");
          }
        }

        // person_id が無ければ生成して人物シートにも書き込む
        var personId = String(data[i][personIdColIdx] || "").trim();
        if (!personId) {
          personId = generateId("P");
          sheet.getRange(i + 1, personIdColIdx + 1).setValue(personId);
          data[i][personIdColIdx] = personId; // メモリ上も更新
        }

        // Index行を組み立て（INDEX_HEADERS の順序に従う）
        var row = _buildIndexRow(data[i], sheetName, i + 1, category, headers);
        row[0] = personId; // person_id を確実にセット
        allRows.push(row);
        sheetCount++;
      }
      diagnostics.push(sheetName + ":" + sheetCount + "件");
    }

    // ── 一括書き込み ──
    if (allRows.length > 0) {
      indexSheet
        .getRange(2, 1, allRows.length, INDEX_HEADERS.length)
        .setValues(allRows);
    }

    // キャッシュクリア
    clearIndexCache();

    return response(
      true,
      { count: allRows.length },
      "インデックスを再構築しました（" + allRows.length + "件）。[" + diagnostics.join(" / ") + "]"
    );
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * シート名から区分（カテゴリ）を推定する
 * @param {string} sheetName
 * @return {string}
 * @private
 */
function _inferCategory(sheetName) {
  if (PERSON_CATEGORY[sheetName]) return PERSON_CATEGORY[sheetName];
  var lower = sheetName.toLowerCase();
  if (lower.indexOf('model') !== -1 || sheetName.indexOf('モデル') !== -1) return 'モデル';
  if (lower.indexOf('influencer') !== -1 || sheetName.indexOf('インフルエンサー') !== -1) return 'インフルエンサー';
  if (lower.indexOf('sports') !== -1 || sheetName.indexOf('スポーツ') !== -1 || sheetName.indexOf('著名') !== -1) return 'スポーツ選手・著名人';
  return sheetName; // 判定できない場合はシート名をそのまま使用
}

/**
 * 人物シートの1行データから 90_Index 用の行配列を作る
 * @param {Array} rowData 人物シートの1行（0-indexed 配列）
 * @param {string} sheetName シート名
 * @param {number} sourceRow 1-indexed 行番号
 * @param {string=} category 区分（省略時はシート名から推定）
 * @param {Array=} sheetHeaders シートのヘッダー行（列名で動的ルックアップするため）
 * @return {Array}
 * @private
 */
function _buildIndexRow(rowData, sheetName, sourceRow, category, sheetHeaders) {
  // シートヘッダーから列名→インデックスのマップを構築（動的ルックアップ優先）
  var sheetHeaderMap = {};
  if (sheetHeaders) {
    for (var sh = 0; sh < sheetHeaders.length; sh++) {
      var hn = String(sheetHeaders[sh]).trim();
      if (hn) sheetHeaderMap[hn] = sh;
    }
  }

  var row = [];
  for (var h = 0; h < INDEX_HEADERS.length; h++) {
    var header = INDEX_HEADERS[h];

    if (header === "区分") {
      row.push(category || PERSON_CATEGORY[sheetName] || sheetName);
      continue;
    }
    if (header === "source_sheet") {
      row.push(sheetName);
      continue;
    }
    if (header === "source_row") {
      row.push(sourceRow);
      continue;
    }
    if (header === "_search_text") {
      // 人物シートの全列値をスペース区切りで結合（フリーワード検索用）
      var parts = [];
      for (var c = 0; c < rowData.length; c++) {
        var v = rowData[c];
        if (v instanceof Date) {
          parts.push(formatDate(v));
        } else if (v !== "" && v !== null && v !== undefined) {
          parts.push(String(v));
        }
      }
      // 区分も検索対象に含める
      parts.push(category || PERSON_CATEGORY[sheetName] || sheetName);
      row.push(parts.join(" "));
      continue;
    }

    // 列ルックアップ: シートヘッダー優先 → INDEX_TO_PERSON_COL フォールバック
    var colIdx = -1;
    if (sheetHeaderMap.hasOwnProperty(header)) {
      colIdx = sheetHeaderMap[header];
    } else if (INDEX_TO_PERSON_COL.hasOwnProperty(header)) {
      colIdx = INDEX_TO_PERSON_COL[header];
    }

    if (colIdx !== -1 && colIdx < rowData.length) {
      var val = rowData[colIdx];
      row.push(val instanceof Date ? formatDate(val) : val);
    } else {
      row.push("");
    }
  }
  return row;
}

// ─── 検索 ────────────────────────────────────────────────────

/**
 * searchPeople(params)
 * CacheService から Index を取得（なければシートから読みキャッシュ）。
 * フリーワードは 名前/ユーザー名/タグ に対して AND 部分一致。
 * フィルタ（区分/所在地/ステータス等）は AND 条件。
 * nextActionFilter: 'overdue' | 'today' | 'week' で期限フィルタ。
 * ページング: { page, pageSize } → { total, results }
 * クエリ別キャッシュ: paramsのハッシュをキーにして検索結果をキャッシュ。
 *
 * @param {Object} params
 *   - keyword {string}           フリーワード（スペース区切りでAND）
 *   - category {string}          区分フィルタ
 *   - location {string}          所在地フィルタ
 *   - status {string}            ステータスフィルタ
 *   - priority {string}          優先度フィルタ
 *   - owner {string}             担当フィルタ
 *   - nextActionFilter {string}  'overdue' | 'today' | 'week'
 *   - page {number}              ページ番号（1始まり、デフォルト1）
 *   - pageSize {number}          1ページあたり件数（デフォルト50）
 * @return {Object} { success, data: { total, page, pageSize, results:[] } }
 */
function searchPeople(params) {
  try {
    requireViewer();

    params = params || {};
    var page = parseInt(params.page, 10) || 1;
    var pageSize = parseInt(params.pageSize, 10) || DEFAULT_PAGE_SIZE;

    // ── クエリ別キャッシュチェック ──
    var cacheKey = _buildSearchCacheKey(params);
    var cache = CacheService.getScriptCache();
    var cachedResult = cache.get(cacheKey);
    if (cachedResult) {
      try {
        return JSON.parse(cachedResult);
      } catch (e) {
        /* キャッシュ破損 → 再検索 */
      }
    }

    // Index データをロード（キャッシュ優先）
    var indexData = _loadIndexData();

    // person_id のない行を除外（rebuildIndex 未実行の行を安全にスキップ）
    var validIndexData = [];
    for (var vi = 0; vi < indexData.length; vi++) {
      if (indexData[vi] && String(indexData[vi][0] || '').trim() !== '') {
        validIndexData.push(indexData[vi]);
      }
    }
    indexData = validIndexData;

    // ── フリーワード AND 部分一致 ──
    var keyword = String(params.keyword || "").trim();
    var keywords = keyword ? keyword.split(/\s+/) : [];

    // 検索対象列のインデックス（_search_text 列で全64列を横断検索）
    var searchColNames = ["_search_text"];
    var searchColIdx = [];
    for (var c = 0; c < searchColNames.length; c++) {
      var idx = INDEX_HEADERS.indexOf(searchColNames[c]);
      if (idx !== -1) searchColIdx.push(idx);
    }

    // フィルタ定義
    var filters = {};
    if (params.category) filters["区分"] = params.category;
    if (params.location) filters["所在地"] = params.location;
    if (params.status) filters["ステータス"] = params.status;
    if (params.priority) filters["優先度"] = params.priority;
    if (params.owner) filters["担当（社内）"] = params.owner;
    if (params.tag) filters["タグ"] = params.tag;

    var filterCols = {};
    var filterKeys = Object.keys(filters);
    for (var f = 0; f < filterKeys.length; f++) {
      var fi = INDEX_HEADERS.indexOf(filterKeys[f]);
      if (fi !== -1) filterCols[fi] = filters[filterKeys[f]];
    }

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
    var nextActionFilter = params.nextActionFilter || "";
    var nextActionColIdx = INDEX_HEADERS.indexOf("次アクション日");
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── フィルタリング ──
    var matched = [];
    for (var r = 0; r < indexData.length; r++) {
      var row = indexData[r];

      // フリーワード AND 部分一致
      if (keywords.length > 0) {
        var allMatch = true;
        for (var kw = 0; kw < keywords.length; kw++) {
          var kwLower = keywords[kw].toLowerCase();
          var found = false;
          for (var sc = 0; sc < searchColIdx.length; sc++) {
            if (
              String(row[searchColIdx[sc]]).toLowerCase().indexOf(kwLower) !==
              -1
            ) {
              found = true;
              break;
            }
          }
          if (!found) {
            allMatch = false;
            break;
          }
        }
        if (!allMatch) continue;
      }

      // フィルタ AND 条件
      var passFilter = true;
      var filterColKeys = Object.keys(filterCols);
      for (var fc = 0; fc < filterColKeys.length; fc++) {
        var colI = parseInt(filterColKeys[fc], 10);
        var expected = filterCols[colI];
        if (String(row[colI]).indexOf(expected) === -1) {
          passFilter = false;
          break;
        }
      }
      if (!passFilter) continue;

      // フォロワー数フィルタ
      if (
        followersColIdx !== -1 &&
        (!isNaN(followersMin) || !isNaN(followersMax))
      ) {
        var followerVal = parseInt(
          String(row[followersColIdx]).replace(/[,，]/g, ""),
          10,
        );
        if (isNaN(followerVal)) followerVal = 0;
        if (!isNaN(followersMin) && followerVal < followersMin) continue;
        if (!isNaN(followersMax) && followerVal > followersMax) continue;
      }

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
    }

    // ── ページング ──
    var total = matched.length;
    var startIdx = (page - 1) * pageSize;
    var paged = matched.slice(startIdx, startIdx + pageSize);

    // 行配列 → オブジェクト配列に変換（_search_text はフロントエンドに返さない）
    var results = [];
    for (var p = 0; p < paged.length; p++) {
      var obj = {};
      for (var h = 0; h < INDEX_HEADERS.length; h++) {
        if (INDEX_HEADERS[h] === "_search_text") continue;
        obj[INDEX_HEADERS[h]] = paged[p][h] !== undefined ? paged[p][h] : "";
      }
      results.push(obj);
    }

    var result = response(true, {
      total: total,
      page: page,
      pageSize: pageSize,
      results: results,
    });

    // ── クエリ別キャッシュに保存 ──
    _cacheSearchResult(cacheKey, result);

    return result;
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * 次アクション日フィルタのチェック
 * @param {*} dateVal セルの値（Date or string）
 * @param {string} filter 'overdue' | 'today' | 'week'
 * @param {Date} today 今日（0時リセット済）
 * @return {boolean} フィルタを通過するか
 * @private
 */
function _passNextActionFilter(dateVal, filter, today) {
  if (!dateVal || String(dateVal).trim() === "") return false;

  var d;
  if (dateVal instanceof Date) {
    d = dateVal;
  } else {
    d = new Date(String(dateVal));
    if (isNaN(d.getTime())) return false;
  }
  d.setHours(0, 0, 0, 0);

  switch (filter) {
    case "overdue":
      return d.getTime() < today.getTime();
    case "today":
      return d.getTime() === today.getTime();
    case "week":
      var weekLater = new Date(today);
      weekLater.setDate(weekLater.getDate() + 7);
      return (
        d.getTime() >= today.getTime() && d.getTime() <= weekLater.getTime()
      );
    default:
      return true;
  }
}

/**
 * paramsからキャッシュキーを生成
 * @param {Object} params
 * @return {string}
 * @private
 */
function _buildSearchCacheKey(params) {
  var parts = [
    params.keyword || "",
    params.category || "",
    params.status || "",
    params.priority || "",
    params.owner || "",
    params.nextActionFilter || "",
    params.page || "1",
    params.pageSize || String(DEFAULT_PAGE_SIZE),
  ];
  // 簡易ハッシュ: 文字コードを足し合わせる
  var str = parts.join("|");
  var hash = 0;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return CACHE_KEY_SEARCH_PREFIX + Math.abs(hash);
}

/**
 * 検索結果をキャッシュに保存し、キー一覧をトラッキング
 * @param {string} cacheKey
 * @param {Object} result
 * @private
 */
function _cacheSearchResult(cacheKey, result) {
  try {
    var json = JSON.stringify(result);
    if (json.length > 90000) return; // 90KB超は保存しない

    var cache = CacheService.getScriptCache();
    cache.put(cacheKey, json, CACHE_TTL);

    // トラッキングキー一覧を更新
    var trackingKey = CACHE_KEY_SEARCH_PREFIX + "KEYS";
    var existing = cache.get(trackingKey);
    var keyList = [];
    if (existing) {
      try {
        keyList = JSON.parse(existing);
      } catch (e) {
        keyList = [];
      }
    }
    if (keyList.indexOf(cacheKey) === -1) {
      keyList.push(cacheKey);
      // 最大50クエリまでトラッキング
      if (keyList.length > 50) keyList = keyList.slice(-50);
    }
    cache.put(trackingKey, JSON.stringify(keyList), CACHE_TTL);
  } catch (e) {
    // キャッシュ保存失敗は無視
  }
}

// ─── Data検証 ────────────────────────────────────────────────

/**
 * validateData()
 * 必須欠落・URL重複・person_id 重複をチェック
 *
 * @return {Object}
 */
function validateData() {
  try {
    requireAdmin();

    var ss = getSpreadsheet();
    var errors = [];
    var personIds = {};
    var urls = {};

    for (var s = 0; s < PERSON_SHEETS.length; s++) {
      var sheetName = PERSON_SHEETS[s];
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) continue;

      var data = sheet.getDataRange().getValues();
      if (data.length < 2) continue;

      for (var i = 1; i < data.length; i++) {
        var row = i + 1;
        var displayName = String(data[i][2]).trim();
        if (!displayName) continue; // 空行はスキップ

        // person_id 重複チェック
        var pid =
          PERSON_EXTRA_COL.PERSON_ID < data[i].length
            ? String(data[i][PERSON_EXTRA_COL.PERSON_ID]).trim()
            : "";
        if (pid) {
          if (personIds[pid]) {
            errors.push({
              type: "person_id重複",
              sheet: sheetName,
              row: row,
              detail:
                'person_id "' + pid + '" は ' + personIds[pid] + " と重複",
            });
          } else {
            personIds[pid] = sheetName + ":行" + row;
          }
        } else {
          errors.push({
            type: "必須欠落",
            sheet: sheetName,
            row: row,
            detail: "person_id が未設定（rebuildIndex で自動付番されます）",
          });
        }

        // URL 重複チェック（9列目 = index 8 が URL）
        var url = String(data[i][8] || "").trim();
        if (url) {
          if (urls[url]) {
            errors.push({
              type: "URL重複",
              sheet: sheetName,
              row: row,
              detail: 'URL "' + url + '" は ' + urls[url] + " と重複",
            });
          } else {
            urls[url] = sheetName + ":行" + row;
          }
        }
      }
    }

    return response(
      true,
      {
        errorCount: errors.length,
        errors: errors,
      },
      errors.length === 0
        ? "データに問題はありません。"
        : errors.length + "件の問題が見つかりました。",
    );
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── 内部ヘルパー ────────────────────────────────────────────

/**
 * 90_Index のデータを取得（CacheService 優先）
 * @return {Array<Array>} ヘッダ行を含まない2次元配列
 * @private
 */
function _loadIndexData() {
  var cache = CacheService.getScriptCache();

  // CacheService の制限（100KB）があるので、チャンク分割して保存/取得
  var chunkKeys = [];
  for (var ck = 0; ck < 10; ck++) {
    chunkKeys.push(CACHE_KEY_INDEX + "_" + ck);
  }

  // キャッシュから結合取得を試みる
  var cachedChunks = cache.getAll(chunkKeys);
  if (cachedChunks && cachedChunks[CACHE_KEY_INDEX + "_0"]) {
    try {
      var combined = "";
      for (var ci = 0; ci < 10; ci++) {
        var chunk = cachedChunks[CACHE_KEY_INDEX + "_" + ci];
        if (!chunk) break;
        combined += chunk;
      }
      if (combined) return JSON.parse(combined);
    } catch (e) {
      // キャッシュ破損 → シートから再取得
    }
  }

  // シートから読み込み
  var sheet = getSheet(SHEET.INDEX);
  var data = sheet.getDataRange().getValues();
  var rows = data.length > 1 ? data.slice(1) : [];

  // キャッシュに保存（チャンク分割）
  _cacheIndexData(rows);

  return rows;
}

/**
 * Index データをチャンク分割してキャッシュに保存
 * @param {Array<Array>} rows
 * @private
 */
function _cacheIndexData(rows) {
  try {
    var json = JSON.stringify(rows);
    var chunkSize = 90000; // 90KB per chunk (CacheService limit = 100KB)
    var chunks = {};
    var chunkIndex = 0;

    for (var start = 0; start < json.length; start += chunkSize) {
      chunks[CACHE_KEY_INDEX + "_" + chunkIndex] = json.substring(
        start,
        start + chunkSize,
      );
      chunkIndex++;
      if (chunkIndex >= 10) break; // 最大10チャンク = 約900KB
    }

    CacheService.getScriptCache().putAll(chunks, CACHE_TTL);
  } catch (e) {
    console.error("Indexキャッシュ保存エラー: " + e.message);
  }
}
