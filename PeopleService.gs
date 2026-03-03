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
