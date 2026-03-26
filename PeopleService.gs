/**
 * ============================================================
 *  PeopleService.gs — 人物取得・更新
 *  タレント・インフルエンサー管理 CRM
 * ============================================================
 */

/**
 * person_id から人物データを取得
 * 3シート（モデル/インフルエンサー/スポーツ選手・著名人）をループし、
 * person_id 列（0-indexed: 16）でマッチした行を返す。
 *
 * @param {string} personId
 * @return {Object} { success, data: { sheetName, rowIndex, data: {列名:値} } }
 */
function getPerson(personId) {
  try {
    requireViewer();

    if (!personId) throw new Error('person_id が指定されていません。');

    var ss = getSpreadsheet();
    var personIdCol = PERSON_EXTRA_COL.PERSON_ID; // 0-indexed = 16

    for (var s = 0; s < PERSON_SHEETS.length; s++) {
      var sheetName = PERSON_SHEETS[s];
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) continue;

      var data = sheet.getDataRange().getValues();
      if (data.length < 2) continue;

      var headers = data[0];

      for (var i = 1; i < data.length; i++) {
        var cellId = (personIdCol < data[i].length) ? String(data[i][personIdCol]).trim() : '';
        if (cellId === String(personId).trim()) {
          // マッチ — 列名:値 のオブジェクトを構築
          var rowData = {};
          for (var j = 0; j < headers.length; j++) {
            var key = String(headers[j]).trim();
            if (!key) key = 'col_' + j;
            var val = (j < data[i].length) ? data[i][j] : '';
            rowData[key] = (val instanceof Date) ? formatDate(val) : val;
          }

          return response(true, {
            sheetName: sheetName,
            rowIndex: i + 1, // 1-indexed シート行番号
            data: rowData
          });
        }
      }
    }

    throw new Error('person_id "' + personId + '" が見つかりません。');
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * 人物データを部分更新
 * patch のキーに対応する列だけ更新する。
 * 更新後に 90_Index のキャッシュを削除する。
 *
 * @param {string} personId
 * @param {Object} patch { 列名: 新しい値, ... }
 * @return {Object}
 */
function updatePerson(personId, patch) {
  try {
    requireEditor();

    if (!personId) throw new Error('person_id が指定されていません。');
    if (!patch || typeof patch !== 'object') throw new Error('更新データが不正です。');

    var ss = getSpreadsheet();
    var personIdCol = PERSON_EXTRA_COL.PERSON_ID;

    for (var s = 0; s < PERSON_SHEETS.length; s++) {
      var sheetName = PERSON_SHEETS[s];
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) continue;

      var data = sheet.getDataRange().getValues();
      if (data.length < 2) continue;

      var headers = data[0];

      for (var i = 1; i < data.length; i++) {
        var cellId = (personIdCol < data[i].length) ? String(data[i][personIdCol]).trim() : '';
        if (cellId !== String(personId).trim()) continue;

        // マッチ — patch のキーに対応する列を更新
        var keys = Object.keys(patch);
        for (var k = 0; k < keys.length; k++) {
          var colName = keys[k];
          var newVal = patch[colName];

          // まず PERSON_COL_MAP（CRM追加列）を確認
          if (PERSON_COL_MAP.hasOwnProperty(colName)) {
            var colIdx = PERSON_COL_MAP[colName]; // 0-indexed
            sheet.getRange(i + 1, colIdx + 1).setValue(newVal);
            continue;
          }

          // 次にヘッダ行から列名を検索（既存16列もカバー）
          var headerIdx = -1;
          for (var h = 0; h < headers.length; h++) {
            if (String(headers[h]).trim() === colName) {
              headerIdx = h;
              break;
            }
          }
          if (headerIdx !== -1) {
            sheet.getRange(i + 1, headerIdx + 1).setValue(newVal);
          }
          // 見つからない列名は無視（エラーにしない）
        }

        // Indexキャッシュ削除
        clearIndexCache();

        return response(true, null, '人物データを更新しました。');
      }
    }

    throw new Error('person_id "' + personId + '" が見つかりません。');
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * 人物の person_id を内部的に解決（sheetName + 行番号を返す）
 * 他のサービスファイルからも呼べるヘルパー
 *
 * @param {string} personId
 * @return {Object|null} { sheetName, rowIndex, data[] } or null
 */
function _findPersonRow(personId) {
  var ss = getSpreadsheet();
  var personIdCol = PERSON_EXTRA_COL.PERSON_ID;

  for (var s = 0; s < PERSON_SHEETS.length; s++) {
    var sheetName = PERSON_SHEETS[s];
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var cellId = (personIdCol < data[i].length) ? String(data[i][personIdCol]).trim() : '';
      if (cellId === String(personId).trim()) {
        return {
          sheetName: sheetName,
          sheet: sheet,
          rowIndex: i + 1,
          rowData: data[i],
          headers: data[0]
        };
      }
    }
  }
  return null;
}

/**
 * 新規人物データを追加
 * @param {Object} payload { 区分, 名前, ユーザー名, ... }
 * @return {Object}
 */
function createPerson(payload) {
  try {
    requireEditor(); // 編集権限チェック

    if (!payload || !payload['区分']) throw new Error('区分が指定されていません。');
    if (!payload['名前']) throw new Error('名前が指定されていません。');

    var sheetName = payload['区分'];
    if (PERSON_SHEETS.indexOf(sheetName) === -1) {
      throw new Error('不正な区分です: ' + sheetName);
    }

    var ss = getSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error('対象のシートが見つかりません: ' + sheetName);

    // ヘッダー行を取得
    var dataRange = sheet.getDataRange();
    var headers = dataRange.getValues()[0];
    if (!headers) headers = [];

    // 最大64列または現在のヘッダー長のどちらか大きい方の空配列を作成
    var totalCols = Math.max(64, headers.length);
    var newRow = new Array(totalCols);
    for (var i = 0; i < totalCols; i++) newRow[i] = '';

    // person_id 発行
    var newPersonId = generateId('P');
    var personIdCol = PERSON_EXTRA_COL.PERSON_ID; // 16
    newRow[personIdCol] = newPersonId;

    // ヘッダーのインデックスマップを作成
    var headerMap = {};
    for (var h = 0; h < headers.length; h++) {
      var headerName = String(headers[h]).trim();
      if (headerName) headerMap[headerName] = h;
    }

    // ペイロードの内容を対応する列インデックスにマッピング
    var keys = Object.keys(payload);
    for (var k = 0; k < keys.length; k++) {
      var colName = keys[k];
      var val = payload[colName] || '';

      if (INDEX_TO_PERSON_COL.hasOwnProperty(colName)) {
        newRow[INDEX_TO_PERSON_COL[colName]] = val;
      } else if (PERSON_COL_MAP.hasOwnProperty(colName)) {
        newRow[PERSON_COL_MAP[colName]] = val;
      } else if (headerMap.hasOwnProperty(colName)) {
        // ヘッダーに存在する場合
        newRow[headerMap[colName]] = val;
      } else {
        // 全く新しい項目の場合はヘッダー列を追加する
        headers.push(colName);
        sheet.getRange(1, headers.length).setValue(colName);
        newRow[headers.length - 1] = val; // 末尾に追加されたインデックス
      }
    }

    sheet.appendRow(newRow);

    // 検索インデックスのキャッシュを削除
    clearIndexCache();

    return response(true, { person_id: newPersonId }, '人物を追加しました。');
  } catch (e) {
    return errorResponse(e);
  }
}
