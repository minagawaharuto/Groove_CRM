/**
 * ============================================================
 *  FollowerUpdateService.gs — フォロワー数自動更新
 *  タレント・インフルエンサー管理 CRM
 * ============================================================
 */

/**
 * トラッキング対象のSNS
 */
var SNS_TYPE = {
  INSTAGRAM: 'instagram',
  UNKNOWN: 'unknown'
};

/**
 * 全人物シートを巡回して、Instagramのフォロワー数を更新する
 * 週1回のトリガーで実行される想定
 */
function updateAllFollowers() {
  try {
    var ss = getSpreadsheet();
    var configSheet = ss.getSheetByName(SHEET.CONFIG);
    
    // ConfigからAPI設定を取得
    var configData = sheetToObjects(configSheet);
    var configMap = {};
    for (var i = 0; i < configData.length; i++) {
        configMap[configData[i].key] = configData[i].value;
    }
    
    var accessToken = configMap['instagram_access_token'];
    var businessAccountId = configMap['instagram_business_account_id'];
    
    if (!accessToken || !businessAccountId) {
      console.warn("Instagram APIのアクセストークンまたはビジネスアカウントIDが設定されていません。Configシートを確認してください。");
      return;
    }

    var updatedCount = 0;

    for (var s = 0; s < PERSON_SHEETS.length; s++) {
      var sheetName = PERSON_SHEETS[s];
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) continue;

      var data = sheet.getDataRange().getValues();
      if (data.length < 2) continue;

      // 0-indexed に変換 (例: A列 = 0)
      var urlColIdx = 8; // URL: 9列目
      var followerColIdx = 0; // フォロワー数: 1列目

      // 更新結果を一括で書き込むための配列を準備（処理速度向上のため）
      // しかし、各行でエラーが発生しても継続できるよう、1行ずつ更新する実装とします。
      for (var r = 1; r < data.length; r++) {
        var url = (urlColIdx < data[r].length) ? String(data[r][urlColIdx]).trim() : '';
        if (!url) continue;

        var snsType = _detectSnsType(url);
        if (snsType === SNS_TYPE.INSTAGRAM) {
          var username = _extractInstagramUsername(url);
          if (username) {
            try {
              var followers = null;
              
              // ① まず Graph API で取得を試みる（プロアカウント対応）
              try {
                followers = _fetchInstagramFollowersGraphApi(username, businessAccountId, accessToken);
              } catch (apiErr) {
                // Graph API失敗 → ② スクレイピングでフォールバック（個人アカウント対応）
                console.info("ユーザー " + username + " : Graph API失敗、スクレイピングで再試行...");
                try {
                  followers = _fetchFollowersByScraping(username);
                  if (followers !== null) {
                    console.info("ユーザー " + username + " : スクレイピングで取得成功 → " + followers);
                  }
                } catch (scrapeErr) {
                  console.warn("ユーザー " + username + " : スクレイピングも失敗: " + scrapeErr.message);
                }
              }
              
              if (followers !== null) {
                sheet.getRange(r + 1, followerColIdx + 1).setValue(followers);
                updatedCount++;
                // APIレートリミット対策として少しスリープ
                Utilities.sleep(500);
              }
            } catch (err) {
              console.error("ユーザー " + username + " の取得エラー: " + err.message);
            }
          }
        }
      }
    }

    console.log("フォロワー数の自動更新が完了しました。更新件数: " + updatedCount);

    // 更新があった場合、インデックスを再構築して検索画面に反映させる
    if (updatedCount > 0) {
      rebuildIndex();
      console.log("インデックスの再構築を実行しました。");
    }

  } catch (e) {
    console.error("フォロワー数更新全体でエラー発生: " + e.message);
  }
}

/**
 * URLからSNSの種類を判別する
 * @param {string} url
 * @return {string} SNS_TYPE
 * @private
 */
function _detectSnsType(url) {
  var u = url.toLowerCase();
  if (u.indexOf('instagram.com') !== -1) {
    return SNS_TYPE.INSTAGRAM;
  }
  return SNS_TYPE.UNKNOWN;
}

/**
 * InstagramのURLからユーザー名を抽出する
 * @param {string} url
 * @return {string|null}
 * @private
 */
function _extractInstagramUsername(url) {
  // 例: https://www.instagram.com/username/ -> username
  var match = url.match(/instagram\.com\/([a-zA-Z0-9._]+)/);
  if (match && match[1]) {
      return match[1];
  }
  return null;
}

/**
 * Instagram Graph API を使用してフォロワー数を取得する
 * @param {string} targetUsername 取得対象のユーザー名
 * @param {string} businessAccountId 連携済みのFacebookページに紐づくInstagramビジネスアカウントID
 * @param {string} accessToken 有効なアクセストークン
 * @return {number|null} フォロワー数、取得失敗時はnull
 * @private
 */
function _fetchInstagramFollowersGraphApi(targetUsername, businessAccountId, accessToken) {
  // Graph API URL組み立て
  var fieldsParam = "business_discovery.username(" + targetUsername + "){followers_count}";
  var url = "https://graph.facebook.com/v18.0/" + businessAccountId + 
            "?fields=" + encodeURIComponent(fieldsParam) + "&access_token=" + accessToken;

  var options = {
    method: "get",
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(url, options);
  var responseCode = response.getResponseCode();
  var contentText = response.getContentText();

  if (responseCode === 200) {
    var json = JSON.parse(contentText);
    if (json.business_discovery && typeof json.business_discovery.followers_count !== 'undefined') {
      return parseInt(json.business_discovery.followers_count, 10);
    }
  } else {
    throw new Error("APIレスポンスエラー (" + responseCode + "): " + contentText);
  }

  return null;
}

/**
 * Webスクレイピングによるフォロワー数取得（Graph API フォールバック用）
 * Instagramプロフィールページの meta description からフォロワー数を抽出する。
 * 個人アカウント（非プロアカウント）にも対応。
 * 
 * @param {string} username Instagramユーザー名
 * @return {number|null} フォロワー数、取得失敗時はnull
 * @private
 */
function _fetchFollowersByScraping(username) {
  var profileUrl = "https://www.instagram.com/" + username + "/";
  
  var options = {
    method: "get",
    muteHttpExceptions: true,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "ja,en-US;q=0.9,en;q=0.8"
    },
    followRedirects: true
  };
  
  var resp = UrlFetchApp.fetch(profileUrl, options);
  var code = resp.getResponseCode();
  
  if (code !== 200) {
    throw new Error("プロフィールページの取得に失敗 (HTTP " + code + ")");
  }
  
  var html = resp.getContentText();
  
  // パターン1: meta description から抽出
  var metaMatch = html.match(/<meta[^>]*(?:name="description"|property="og:description")[^>]*content="([^"]*)"/i);
  if (!metaMatch) {
    metaMatch = html.match(/<meta[^>]*content="([^"]*?)"[^>]*(?:name="description"|property="og:description")/i);
  }
  
  if (metaMatch && metaMatch[1]) {
    var desc = metaMatch[1];
    
    // 英語形式: "1,234 Followers" or "12.3K Followers" or "1.5M Followers"
    var enMatch = desc.match(/([\d,.]+[KMkm]?)\s*Followers/i);
    if (enMatch) {
      return _parseFollowerString(enMatch[1]);
    }
    
    // 日本語形式: "フォロワー1.2万人" or "フォロワー1,234人"
    var jaMatch = desc.match(/フォロワー([\d,.]+万?)人/i);
    if (jaMatch) {
      return _parseFollowerString(jaMatch[1]);
    }
    
    // 先頭の数値を取得する汎用パターン
    var genericMatch = desc.match(/^([\d,]+)/i);
    if (genericMatch) {
      var num = parseInt(genericMatch[1].replace(/,/g, ''), 10);
      if (!isNaN(num) && num > 0) return num;
    }
  }
  
  // パターン2: 埋め込みJSONから抽出
  var jsonMatch = html.match(/"edge_followed_by"\s*:\s*\{\s*"count"\s*:\s*(\d+)/i);
  if (jsonMatch) {
    return parseInt(jsonMatch[1], 10);
  }
  
  // パターン3: interactionStatistic から抽出
  var statMatch = html.match(/"userInteractionCount"\s*:\s*"?(\d+)"?/i);
  if (statMatch) {
    return parseInt(statMatch[1], 10);
  }
  
  return null;
}

/**
 * フォロワー数の文字列（"12.3K", "1.5M", "1,234", "1.2万" 等）を整数に変換
 * @param {string} str
 * @return {number|null}
 * @private
 */
function _parseFollowerString(str) {
  if (!str) return null;
  str = str.trim().replace(/,/g, '');
  
  // 日本語「万」対応
  if (str.indexOf('万') !== -1) {
    var manVal = parseFloat(str.replace('万', ''));
    return isNaN(manVal) ? null : Math.round(manVal * 10000);
  }
  
  // "K" = 千
  if (str.match(/[Kk]$/)) {
    var kVal = parseFloat(str.replace(/[Kk]$/, ''));
    return isNaN(kVal) ? null : Math.round(kVal * 1000);
  }
  
  // "M" = 百万
  if (str.match(/[Mm]$/)) {
    var mVal = parseFloat(str.replace(/[Mm]$/, ''));
    return isNaN(mVal) ? null : Math.round(mVal * 1000000);
  }
  
  // 普通の数値
  var plainNum = parseInt(str, 10);
  return isNaN(plainNum) ? null : plainNum;
}

/**
 * 週1回（例：毎週日曜日の午前3時）フォロワー数更新を実行するトリガーをセットアップする
 * （手動で1回実行して設定します）
 */
function setupWeeklyFollowerUpdateTrigger() {
  // 既存の同名トリガーを削除
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'updateAllFollowers') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // 新しくトリガーを作成 (毎週日曜日の午前3時頃実行)
  ScriptApp.newTrigger('updateAllFollowers')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(3)
    .create();
    
  console.log("週1回のフォロワー数更新トリガー（毎週日曜日午前3時台）を設定しました。");
}
