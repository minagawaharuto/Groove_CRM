/**
 * ============================================================
 *  DealService.gs — 案件管理
 *  タレント・インフルエンサー管理 CRM
 * ============================================================
 */

/**
 * listDeals(filters)
 * 10_Deals の一覧を返す。フィルタ対応。
 *
 * @param {Object=} filters
 *   - status {string}  状態フィルタ
 *   - owner  {string}  担当フィルタ
 *   - keyword {string} フリーワード（案件名/クライアント 部分一致）
 * @return {Object}
 */
function listDeals(filters) {
  try {
    requireViewer();

    filters = filters || {};
    var sheet = getSheet(SHEET.DEALS);
    var data = sheet.getDataRange().getValues();
    if (data.length < 2) return response(true, []);

    var headers = data[0];
    var results = [];

    for (var i = 1; i < data.length; i++) {
      // deal_id（1列目）が空なら空行としてスキップ
      if (!data[i][0] || String(data[i][0]).trim() === "") continue;

      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        var key = String(headers[j]).trim();
        var val = data[i][j];
        obj[key] = val instanceof Date ? formatDate(val) : val;
      }
      obj["_row"] = i + 1;

      // フィルタ適用
      if (filters.status && String(obj["状態"]).indexOf(filters.status) === -1)
        continue;
      if (filters.owner && String(obj["担当"]).indexOf(filters.owner) === -1)
        continue;
      if (filters.keyword) {
        var kw = filters.keyword.toLowerCase();
        var matchName =
          String(obj["案件名"] || "")
            .toLowerCase()
            .indexOf(kw) !== -1;
        var matchClient =
          String(obj["クライアント"] || "")
            .toLowerCase()
            .indexOf(kw) !== -1;
        if (!matchName && !matchClient) continue;
      }

      results.push(obj);
    }

    return response(true, results);
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * createDeal(payload)
 * 10_Deals に新規案件を追加。deal_id は MAX+1 採番。
 *
 * @param {Object} payload
 *   - 案件名      {string} 必須
 *   - クライアント {string}
 *   - 状態        {string} デフォルト '企画中'
 *   - 担当        {string}
 *   - 納期        {string} 'YYYY-MM-DD'
 * @return {Object}
 */
function createDeal(payload) {
  try {
    requireEditor();

    if (!payload || !payload["案件名"]) {
      throw new Error("案件名は必須です。");
    }

    var sheet = getSheet(SHEET.DEALS);
    var dealId = getNextId(sheet, 0); // deal_id = 1列目(0-indexed)

    var newRow = [
      dealId,
      payload["案件名"],
      payload["クライアント"] || "",
      payload["状態"] || "企画中",
      payload["担当"] || getCurrentUserEmail().split("@")[0],
      payload["納期"] || "",
    ];

    sheet.appendRow(newRow);
    return response(
      true,
      { deal_id: dealId },
      "案件を作成しました（ID: " + dealId + "）。",
    );
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * getDeal(dealId)
 * 案件詳細 + 紐づく DealCasting 一覧を返す
 *
 * @param {number|string} dealId
 * @return {Object}
 */
function getDeal(dealId) {
  try {
    requireViewer();

    if (!dealId) throw new Error("deal_id が指定されていません。");
    dealId = String(dealId).trim();

    // ── 案件マスター取得 ──
    var dealSheet = getSheet(SHEET.DEALS);
    var dealData = dealSheet.getDataRange().getValues();
    var dealHeaders = dealData[0];
    var dealObj = null;

    for (var i = 1; i < dealData.length; i++) {
      if (String(dealData[i][0]).trim() === dealId) {
        dealObj = {};
        for (var j = 0; j < dealHeaders.length; j++) {
          var key = String(dealHeaders[j]).trim();
          var val = dealData[i][j];
          dealObj[key] = val instanceof Date ? formatDate(val) : val;
        }
        dealObj["_row"] = i + 1;
        break;
      }
    }

    if (!dealObj) {
      throw new Error('deal_id "' + dealId + '" が見つかりません。');
    }

    // ── DealCasting 一覧取得 ──
    var castingSheet = getSheet(SHEET.DEAL_CASTING);
    var castingData = castingSheet.getDataRange().getValues();
    var castingHeaders = castingData[0];
    var castings = [];

    for (var ci = 1; ci < castingData.length; ci++) {
      // deal_id は 2列目（index 1）
      if (String(castingData[ci][1]).trim() === dealId) {
        var cObj = {};
        for (var cj = 0; cj < castingHeaders.length; cj++) {
          var ck = String(castingHeaders[cj]).trim();
          var cv = castingData[ci][cj];
          cObj[ck] = cv instanceof Date ? formatDate(cv) : cv;
        }
        cObj["_row"] = ci + 1;

        // person_id から名前を取得（軽量版）
        cObj["person_name"] = _getPersonDisplayName(
          String(cObj["person_id"] || ""),
        );

        castings.push(cObj);
      }
    }

    dealObj["castings"] = castings;
    return response(true, dealObj);
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * addPersonToDeal(dealId, personId, initStatus)
 * 11_DealCasting に候補者を追加。deal_casting_id は MAX+1 採番。
 *
 * @param {number|string} dealId
 * @param {string} personId
 * @param {string=} initStatus 初期ステータス（デフォルト: '候補'）
 * @return {Object}
 */
function addPersonToDeal(dealId, personId, initStatus) {
  try {
    requireEditor();

    if (!dealId) throw new Error("deal_id が指定されていません。");
    if (!personId) throw new Error("person_id が指定されていません。");

    // person_id 存在確認
    var personRow = _findPersonRow(personId);
    if (!personRow) {
      throw new Error('person_id "' + personId + '" が見つかりません。');
    }

    // 重複チェック（同じ deal_id × person_id が既にあるか）
    var castingSheet = getSheet(SHEET.DEAL_CASTING);
    var castingData = castingSheet.getDataRange().getValues();
    for (var i = 1; i < castingData.length; i++) {
      if (
        String(castingData[i][1]).trim() === String(dealId).trim() &&
        String(castingData[i][2]).trim() === String(personId).trim()
      ) {
        throw new Error("この人物は既にこの案件に追加されています。");
      }
    }

    var dcId = getNextId(castingSheet, 0); // deal_casting_id = 1列目

    var newRow = [
      dcId,
      dealId,
      personId,
      initStatus || "候補",
      "", // 提示条件
      "", // NG理由
      "", // メモ
    ];

    castingSheet.appendRow(newRow);
    return response(true, { deal_casting_id: dcId }, "候補者を追加しました。");
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * updateDealCasting(dealCastingId, patch)
 * 11_DealCasting の指定行を部分更新
 *
 * @param {number|string} dealCastingId
 * @param {Object} patch { 列名: 値, ... }
 * @return {Object}
 */
function updateDealCasting(dealCastingId, patch) {
  try {
    requireEditor();

    if (!dealCastingId)
      throw new Error("deal_casting_id が指定されていません。");
    if (!patch || typeof patch !== "object")
      throw new Error("更新データが不正です。");

    dealCastingId = String(dealCastingId).trim();

    var sheet = getSheet(SHEET.DEAL_CASTING);
    var data = sheet.getDataRange().getValues();
    var headers = data[0];

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() !== dealCastingId) continue;

      // マッチ — patch のキーに対応する列を更新
      var keys = Object.keys(patch);
      for (var k = 0; k < keys.length; k++) {
        var colName = keys[k];
        // ヘッダから列番号を検索
        for (var h = 0; h < headers.length; h++) {
          if (String(headers[h]).trim() === colName) {
            sheet.getRange(i + 1, h + 1).setValue(patch[colName]);
            break;
          }
        }
      }

      return response(true, null, "キャスティング情報を更新しました。");
    }

    throw new Error(
      'deal_casting_id "' + dealCastingId + '" が見つかりません。',
    );
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── 内部ヘルパー ────────────────────────────────────────────

/**
 * person_id から名前を軽量取得（Index を使う）
 * @param {string} personId
 * @return {string}
 * @private
 */
function _getPersonDisplayName(personId) {
  if (!personId) return "";

  try {
    var indexData = _loadIndexData();
    // person_id は INDEX_HEADERS[0], 名前は INDEX_HEADERS[2]
    for (var i = 0; i < indexData.length; i++) {
      if (String(indexData[i][0]).trim() === personId.trim()) {
        return String(indexData[i][2] || "");
      }
    }
  } catch (e) {
    // Index取得に失敗した場合は空文字を返す
  }

  return "";
}
