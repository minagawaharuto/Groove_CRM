/**
 * ============================================================
 *  LogService.gs — 活動ログ管理
 *  タレント・インフルエンサー管理 CRM
 * ============================================================
 */

/**
 * addActivityLog(payload)
 * 1. 20_ActivityLog に行追加（log_id は MAX+1 採番）
 * 2. updatePerson() で最終接触日・次アクション日/内容・ステータスを更新
 * 3. CacheService の Index 削除
 *
 * @param {Object} payload
 *   - person_id   {string}  必須
 *   - 種別        {string}  例: '電話', 'メール', '面談', 'DM'
 *   - 内容        {string}
 *   - 結果        {string}
 *   - 次アクション日     {string} 'YYYY-MM-DD'
 *   - 次アクション内容   {string}
 *   - 担当        {string}
 *   - ステータス  {string}  省略可 — 設定時は人物マスターも更新
 * @return {Object}
 */
function addActivityLog(payload) {
  try {
    requireEditor();

    if (!payload || !payload.person_id) {
      throw new Error('person_id は必須です。');
    }

    // person_id の存在確認
    var personRow = _findPersonRow(payload.person_id);
    if (!personRow) {
      throw new Error('person_id "' + payload.person_id + '" が見つかりません。');
    }

    // ── 1. 20_ActivityLog に行追加 ──
    var logSheet = getSheet(SHEET.ACTIVITY_LOG);
    var logId = getNextId(logSheet, 0); // log_id = 1列目(0-indexed)
    var now = formatDateTime(new Date());

    var newRow = [
      logId,
      payload.person_id,
      payload['日時'] || now,
      payload['種別'] || '',
      payload['内容'] || '',
      payload['結果'] || '',
      payload['次アクション日'] || '',
      payload['次アクション内容'] || '',
      payload['担当'] || getCurrentUserEmail().split('@')[0]
    ];

    logSheet.appendRow(newRow);

    // ── 2. 人物マスターの連動更新 ──
    var personPatch = {
      '最終接触日': formatDate(new Date())
    };

    if (payload['次アクション日']) {
      personPatch['次アクション日'] = payload['次アクション日'];
    }
    if (payload['次アクション内容']) {
      personPatch['次アクション内容'] = payload['次アクション内容'];
    }
    if (payload['ステータス']) {
      personPatch['ステータス'] = payload['ステータス'];
    }

    // updatePerson は内部で clearIndexCache() を呼ぶ
    updatePerson(payload.person_id, personPatch);

    return response(true, { log_id: logId }, '活動ログを追加しました（ID: ' + logId + '）。');
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * getPersonTimeline(person_id)
 * 20_ActivityLog から指定 person_id のログを時系列（新しい順）で返す
 *
 * @param {string} personId
 * @return {Object}
 */
function getPersonTimeline(personId) {
  try {
    requireViewer();

    if (!personId) throw new Error('person_id が指定されていません。');

    var logSheet = getSheet(SHEET.ACTIVITY_LOG);
    var data = logSheet.getDataRange().getValues();
    if (data.length < 2) return response(true, []);

    var headers = data[0];
    var logs = [];

    for (var i = 1; i < data.length; i++) {
      // person_id は 2列目（index 1）
      var pid = String(data[i][1]).trim();
      if (pid !== String(personId).trim()) continue;

      var obj = {};
      for (var j = 0; j < headers.length; j++) {
        var key = String(headers[j]).trim();
        var val = data[i][j];
        obj[key] = (val instanceof Date) ? formatDateTime(val) : val;
      }
      logs.push(obj);
    }

    // 新しい順にソート（日時列 = index 2）
    logs.sort(function(a, b) {
      var dateA = a['日時'] || '';
      var dateB = b['日時'] || '';
      return dateB.localeCompare(dateA);
    });

    return response(true, logs);
  } catch (e) {
    return errorResponse(e);
  }
}
