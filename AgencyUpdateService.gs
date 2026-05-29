/**
 * ============================================================
 *  AgencyUpdateService.gs — 所属事務所自動取得
 *  Google Custom Search API + LLM（OpenAI）を組み合わせて
 *  タレント・著名人の所属事務所を自動取得・更新する
 * ============================================================
 */

/**
 * 所属事務所が未設定の全人物を対象に、
 * Google Custom Search + LLM で所属事務所を取得してシートに書き込む。
 * 月次トリガーでの実行を想定。
 */
function updateAllAgencies() {
  try {
    var config = _loadAgencyConfig();
    if (!config) return;

    var ss = getSpreadsheet();
    var updatedCount = 0;
    var agencyColIdx = PERSON_COL_MAP['所属事務所'];

    for (var s = 0; s < PERSON_SHEETS.length; s++) {
      var sheetName = PERSON_SHEETS[s];
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) continue;

      var data = sheet.getDataRange().getValues();
      if (data.length < 2) continue;

      var nameColIdx = INDEX_TO_PERSON_COL['名前']; // 2

      for (var r = 1; r < data.length; r++) {
        var name = (nameColIdx < data[r].length) ? String(data[r][nameColIdx]).trim() : '';
        if (!name) continue;

        // 既に取得済みの場合はスキップ
        var existing = (agencyColIdx < data[r].length) ? String(data[r][agencyColIdx]).trim() : '';
        if (existing) continue;

        try {
          var agency = _fetchAgencyByLLM(name, config);
          if (agency !== null) {
            sheet.getRange(r + 1, agencyColIdx + 1).setValue(agency);
            updatedCount++;
            console.log('[AgencyUpdate] ' + name + ' → ' + agency);
          }
          // APIレートリミット対策（Google CSE: 100 queries/day の無料枠に配慮）
          Utilities.sleep(1500);
        } catch (err) {
          console.error('[AgencyUpdate] ' + name + ' エラー: ' + err.message);
        }
      }
    }

    console.log('[AgencyUpdate] 完了。更新件数: ' + updatedCount);

    if (updatedCount > 0) {
      clearIndexCache();
    }

  } catch (e) {
    console.error('[AgencyUpdate] 全体エラー: ' + e.message);
  }
}

/**
 * 特定の1人物の所属事務所を取得・更新する（手動テスト・個別更新用）
 *
 * @param {string} personId
 * @return {string|null} 取得した事務所名
 */
function updateAgencyForPerson(personId) {
  try {
    var config = _loadAgencyConfig();
    if (!config) return null;

    var found = _findPersonRow(personId);
    if (!found) throw new Error('person_id "' + personId + '" が見つかりません。');

    var name = String(found.rowData[INDEX_TO_PERSON_COL['名前']] || '').trim();
    if (!name) throw new Error('名前が取得できませんでした。');

    var agency = _fetchAgencyByLLM(name, config);
    console.log('[AgencyUpdate] ' + name + ' → ' + agency);

    if (agency !== null) {
      var agencyColIdx = PERSON_COL_MAP['所属事務所'];
      found.sheet.getRange(found.rowIndex, agencyColIdx + 1).setValue(agency);
      clearIndexCache();
    }

    return agency;
  } catch (e) {
    console.error('[AgencyUpdate] エラー: ' + e.message);
    return null;
  }
}

/**
 * Google Custom Search でスニペットを取得し、LLMで所属事務所を抽出する
 *
 * @param {string} name 人物名
 * @param {Object} config APIキー一式
 * @return {string|null} 所属事務所名（"なし" を含む）/ null は取得失敗
 * @private
 */
function _fetchAgencyByLLM(name, config) {
  var snippets = _searchGoogleSnippets(name, config.googleApiKey, config.googleCx);
  if (!snippets || snippets.length === 0) {
    console.warn('[AgencyUpdate] ' + name + ': 検索結果が0件でした。');
    return null;
  }

  return _extractAgencyWithLLM(name, snippets, config.openaiApiKey);
}

/**
 * Google Custom Search API でスニペットを取得する
 *
 * @param {string} name 人物名
 * @param {string} apiKey Google Custom Search API キー
 * @param {string} cx    カスタム検索エンジン ID
 * @return {Array<string>} スニペット配列（最大5件）
 * @private
 */
function _searchGoogleSnippets(name, apiKey, cx) {
  var query = name + ' 所属事務所 プロフィール';
  var url = 'https://www.googleapis.com/customsearch/v1'
    + '?key=' + encodeURIComponent(apiKey)
    + '&cx='  + encodeURIComponent(cx)
    + '&q='   + encodeURIComponent(query)
    + '&num=5'
    + '&lr=lang_ja'
    + '&gl=jp';

  var options = {
    method: 'get',
    muteHttpExceptions: true
  };

  var resp = UrlFetchApp.fetch(url, options);
  var code = resp.getResponseCode();
  var text = resp.getContentText();

  if (code !== 200) {
    throw new Error('Google Custom Search APIエラー (' + code + '): ' + text.substring(0, 300));
  }

  var json = JSON.parse(text);
  var snippets = [];

  if (json.items && json.items.length > 0) {
    for (var i = 0; i < json.items.length && i < 5; i++) {
      var item = json.items[i];
      // タイトル + スニペットをまとめてLLMに渡す
      var line = (item.title || '') + ': ' + (item.snippet || '');
      snippets.push(line.trim());
    }
  }

  return snippets;
}

/**
 * OpenAI Chat Completions API を使って所属事務所名を抽出する
 *
 * @param {string} name     人物名
 * @param {Array<string>} snippets 検索スニペット
 * @param {string} apiKey   OpenAI API キー
 * @return {string} 所属事務所名 or "なし"
 * @private
 */
function _extractAgencyWithLLM(name, snippets, apiKey) {
  var snippetText = snippets.map(function(s, i) {
    return (i + 1) + '. ' + s;
  }).join('\n');

  var prompt =
    '以下の検索結果から、「' + name + '」の所属事務所名を抽出してください。\n' +
    'フリーランスの場合、または情報が見つからない場合は「なし」とだけ出力してください。\n' +
    '事務所名のみを簡潔に出力してください（説明文・補足は不要です）。\n\n' +
    '【検索結果】\n' + snippetText;

  var payload = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'あなたは芸能・タレント情報の専門家です。検索結果から所属事務所名のみを正確に抽出します。' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 100,
    temperature: 0
  };

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var resp = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', options);
  var code = resp.getResponseCode();
  var text = resp.getContentText();

  if (code !== 200) {
    throw new Error('OpenAI APIエラー (' + code + '): ' + text.substring(0, 300));
  }

  var json = JSON.parse(text);
  if (json.choices && json.choices[0] && json.choices[0].message) {
    return json.choices[0].message.content.trim();
  }

  return null;
}

/**
 * スクリプトプロパティから所属事務所更新に必要なAPIキーを読み込む
 *
 * 設定方法: GASエディタ上部「プロジェクトの設定」→「スクリプト プロパティ」に
 * 以下のキーを登録してください。
 *   GOOGLE_CUSTOM_SEARCH_API_KEY  — Google Custom Search JSON API キー
 *   GOOGLE_CUSTOM_SEARCH_CX       — カスタム検索エンジン ID
 *   OPENAI_API_KEY                — OpenAI API キー
 *
 * @return {Object|null} { googleApiKey, googleCx, openaiApiKey } / null は設定不備
 * @private
 */
function _loadAgencyConfig() {
  var props = PropertiesService.getScriptProperties();

  var googleApiKey = String(props.getProperty('GOOGLE_CUSTOM_SEARCH_API_KEY') || '').trim();
  var googleCx     = String(props.getProperty('GOOGLE_CUSTOM_SEARCH_CX')       || '').trim();
  var openaiApiKey = String(props.getProperty('OPENAI_API_KEY')                || '').trim();

  if (!googleApiKey || !googleCx) {
    console.warn('[AgencyUpdate] スクリプトプロパティに GOOGLE_CUSTOM_SEARCH_API_KEY または GOOGLE_CUSTOM_SEARCH_CX が設定されていません。');
    return null;
  }
  if (!openaiApiKey) {
    console.warn('[AgencyUpdate] スクリプトプロパティに OPENAI_API_KEY が設定されていません。');
    return null;
  }

  return { googleApiKey: googleApiKey, googleCx: googleCx, openaiApiKey: openaiApiKey };
}

/**
 * 月次（毎月1日 午前4時台）の所属事務所更新トリガーをセットアップする
 * （手動で1回実行して設定します）
 */
function setupMonthlyAgencyUpdateTrigger() {
  // 既存の同名トリガーを削除
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'updateAllAgencies') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('updateAllAgencies')
    .timeBased()
    .onMonthDay(1)
    .atHour(4)
    .create();

  console.log('[AgencyUpdate] 月次トリガー（毎月1日 午前4時台）を設定しました。');
}
