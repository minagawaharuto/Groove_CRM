/**
 * ============================================================
 *  FollowerScraper.gs — insta.refetter.com フォロワー数自動更新
 *  タレント・インフルエンサー管理 CRM
 * ============================================================
 *
 * 使い方:
 *   1. updateFollowerCounts() を手動実行、または時間主導型トリガーに設定
 *   2. 初回は debugFetchRankingPage() を実行して HTML 構造を確認し、
 *      必要に応じて _parseFollowersFromHtml() 内の正規表現を調整する
 *
 * 更新対象:
 *   - モデル / インフルエンサー / スポーツ選手・著名人 シートの「フォロワー数」列 (col 0)
 *   - 90_Index シートの「フォロワー数」列も連動更新
 */

/** スクレイピング対象の URL（ページ送りは ?page=N を使用） */
var RANKING_BASE_URL = "https://insta.refetter.com/ranking/";

/** 取得するページ数（1ページ100件程度 × 5 = 最大500件） */
var RANKING_MAX_PAGES = 5;

// ─── メイン関数 ───────────────────────────────────────────────

/**
 * フォロワー数一括更新
 * ランキングサイトから全ページのデータを取得し、
 * CRM のユーザー名と照合してフォロワー数を更新する。
 *
 * @return {Object} { success, data: { updated, skipped, notFound } }
 */
function updateFollowerCounts() {
  try {
    requireEditor();

    Logger.log("=== フォロワー数更新 開始 ===");

    // ── Step1: ランキングサイトからデータ収集 ──
    var rankingMap = _fetchAllRankingData();
    Logger.log("ランキングデータ取得件数: " + Object.keys(rankingMap).length);

    if (Object.keys(rankingMap).length === 0) {
      throw new Error(
        "ランキングデータを取得できませんでした。" +
          "debugFetchRankingPage() を実行して HTML 構造を確認してください。"
      );
    }

    // ── Step2: 人物シートのユーザー名と照合・更新 ──
    var stats = { updated: 0, skipped: 0, notFound: 0 };
    var ss = getSpreadsheet();

    for (var s = 0; s < PERSON_SHEETS.length; s++) {
      var sheetName = PERSON_SHEETS[s];
      var sheet = ss.getSheetByName(sheetName);
      if (!sheet) continue;

      var data = sheet.getDataRange().getValues();
      if (data.length < 2) continue;

      for (var i = 1; i < data.length; i++) {
        // 名前が空行はスキップ
        if (!data[i][2] || String(data[i][2]).trim() === "") continue;

        var username = String(data[i][INDEX_TO_PERSON_COL["ユーザー名"]] || "").trim();
        if (!username) {
          stats.skipped++;
          continue;
        }

        // @ を除去して小文字に統一
        var normalizedUsername = username.replace(/^@/, "").toLowerCase();

        if (!rankingMap.hasOwnProperty(normalizedUsername)) {
          stats.notFound++;
          Logger.log("未マッチ: " + username);
          continue;
        }

        var newFollowers = rankingMap[normalizedUsername];
        var currentFollowers = data[i][INDEX_TO_PERSON_COL["フォロワー数"]];

        // 値が同じなら書き込みをスキップ（API クォータ節約）
        if (String(currentFollowers) === String(newFollowers)) {
          stats.skipped++;
          continue;
        }

        sheet
          .getRange(i + 1, INDEX_TO_PERSON_COL["フォロワー数"] + 1)
          .setValue(newFollowers);
        stats.updated++;
        Logger.log("更新: " + username + " → " + newFollowers);
      }
    }

    // ── Step3: Index キャッシュクリア（次の検索で最新値を反映） ──
    clearIndexCache();

    // ── Step4: 更新日時を記録 ──
    _recordLastUpdate(stats);

    Logger.log(
      "=== 完了 === 更新:" + stats.updated +
      " スキップ:" + stats.skipped +
      " 未マッチ:" + stats.notFound
    );

    return response(
      true,
      stats,
      "フォロワー数を更新しました（更新:" + stats.updated +
        "件 / 未マッチ:" + stats.notFound + "件）"
    );
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── スクレイピング ───────────────────────────────────────────

/**
 * 全ページを巡回してユーザー名→フォロワー数のマップを返す
 * @return {Object} { "username_lowercase": followerCount(number), ... }
 * @private
 */
function _fetchAllRankingData() {
  var result = {};

  for (var page = 1; page <= RANKING_MAX_PAGES; page++) {
    var url = RANKING_BASE_URL + (page > 1 ? "?page=" + page : "");
    Logger.log("取得中: " + url);

    var html = _fetchPage(url);
    if (!html) {
      Logger.log("ページ取得失敗 (page=" + page + ")、終了");
      break;
    }

    var pageData = _parseFollowersFromHtml(html);
    var pageCount = Object.keys(pageData).length;
    Logger.log("  → " + pageCount + " 件取得");

    if (pageCount === 0) {
      // これ以上ページが存在しない
      break;
    }

    // マージ
    var keys = Object.keys(pageData);
    for (var k = 0; k < keys.length; k++) {
      result[keys[k]] = pageData[keys[k]];
    }

    // レート制限対策
    if (page < RANKING_MAX_PAGES) {
      Utilities.sleep(1500);
    }
  }

  return result;
}

/**
 * URL から HTML テキストを取得
 * @param {string} url
 * @return {string|null}
 * @private
 */
function _fetchPage(url) {
  try {
    var options = {
      method: "get",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "ja,en-US;q=0.9,en;q=0.8",
      },
      followRedirects: true,
      muteHttpExceptions: true,
    };
    var res = UrlFetchApp.fetch(url, options);
    var code = res.getResponseCode();
    if (code !== 200) {
      Logger.log("HTTP " + code + ": " + url);
      return null;
    }
    return res.getContentText("UTF-8");
  } catch (e) {
    Logger.log("fetch エラー: " + e.message);
    return null;
  }
}

/**
 * HTML からユーザー名→フォロワー数を抽出する
 *
 * ★ サイトの HTML 構造が変わった場合はここの正規表現を修正してください ★
 * debugFetchRankingPage() で実際の HTML を確認できます。
 *
 * @param {string} html
 * @return {Object} { "username_lowercase": followerCount(number), ... }
 * @private
 */
function _parseFollowersFromHtml(html) {
  var result = {};

  // ─── パターン A ───────────────────────────────────────────
  // <a href="/user/USERNAME/">～</a> と フォロワー数が近傍にある構造
  // 例: <td class="username">@username</td><td class="followers">12,345</td>
  var patternA = /@([\w.]+)[^<]*<\/[^>]+>[^<]*<[^>]+>\s*([\d,，万]+)\s*(?:人|フォロワー)?/gi;
  var matchA;
  while ((matchA = patternA.exec(html)) !== null) {
    var username = matchA[1].toLowerCase();
    var followers = _parseFollowerNumber(matchA[2]);
    if (followers > 0) {
      result[username] = followers;
    }
  }

  // ─── パターン B ───────────────────────────────────────────
  // href="/user/USERNAME" 形式の URL からユーザー名を取得し、
  // 同一ブロック内のフォロワー数を取得
  var patternB = /href=["'](?:https?:\/\/(?:www\.)?instagram\.com\/|\/(?:user\/)?)([\w.]+)\/?["'][^>]*>[\s\S]{0,500}?([\d,，万]+)\s*(?:人|フォロワー|followers)/gi;
  var matchB;
  while ((matchB = patternB.exec(html)) !== null) {
    var usernameB = matchB[1].toLowerCase();
    var followersB = _parseFollowerNumber(matchB[2]);
    if (followersB > 0 && !result.hasOwnProperty(usernameB)) {
      result[usernameB] = followersB;
    }
  }

  // ─── パターン C (JSON-LD / data 属性) ─────────────────────
  // data-username="foo" data-followers="12345" 形式
  var patternC = /data-(?:username|account)=["']([\w.]+)["'][^>]*data-followers=["']([\d,]+)["']/gi;
  var matchC;
  while ((matchC = patternC.exec(html)) !== null) {
    var usernameC = matchC[1].toLowerCase();
    var followersC = _parseFollowerNumber(matchC[2]);
    if (followersC > 0 && !result.hasOwnProperty(usernameC)) {
      result[usernameC] = followersC;
    }
  }

  return result;
}

/**
 * "12,345" "1.2万" "1200000" などを数値に変換
 * @param {string} str
 * @return {number} パース失敗時は 0
 * @private
 */
function _parseFollowerNumber(str) {
  if (!str) return 0;
  var s = String(str).replace(/[,，\s]/g, "");

  // 「万」単位の変換（例: "12.3万" → 123000）
  var manMatch = s.match(/^([\d.]+)万$/);
  if (manMatch) {
    return Math.round(parseFloat(manMatch[1]) * 10000);
  }

  var n = parseInt(s, 10);
  return isNaN(n) ? 0 : n;
}

/**
 * 更新日時と結果を 99_Config シートに記録
 * @param {Object} stats
 * @private
 */
function _recordLastUpdate(stats) {
  try {
    var ss = getSpreadsheet();
    var cfg = ss.getSheetByName(SHEET.CONFIG);
    if (!cfg) return;

    var now = formatDateTime(new Date());
    var message =
      now +
      " | 更新:" + stats.updated +
      " スキップ:" + stats.skipped +
      " 未マッチ:" + stats.notFound;

    // "follower_last_update" 行を探して上書き、なければ追加
    var data = cfg.getDataRange().getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][0]).trim() === "follower_last_update") {
        cfg.getRange(i + 1, 2).setValue(message);
        return;
      }
    }
    cfg.appendRow(["follower_last_update", message]);
  } catch (e) {
    Logger.log("更新日時記録エラー: " + e.message);
  }
}

// ─── トリガー設定ヘルパー ─────────────────────────────────────

/**
 * 毎日 AM 6:00 に updateFollowerCounts() を自動実行するトリガーを設定
 * 手動で1回だけ実行すること。既存トリガーがあれば削除して再作成する。
 */
function setupDailyTrigger() {
  // 既存の updateFollowerCounts トリガーを削除
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "updateFollowerCounts") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // 毎日 6:00〜7:00 に実行
  ScriptApp.newTrigger("updateFollowerCounts")
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  Logger.log("✅ 毎日 AM6:00 の自動更新トリガーを設定しました。");
}

/**
 * 自動実行トリガーを削除する
 */
function removeDailyTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "updateFollowerCounts") {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  Logger.log("削除したトリガー数: " + removed);
}

// ─── デバッグ・診断用 ─────────────────────────────────────────

/**
 * ランキングページの HTML を取得してログに出力する
 * ★ 初回実行時に必ずこれを実行し、HTML 構造を確認してください ★
 * Apps Script エディタの「実行ログ」で確認できます。
 */
function debugFetchRankingPage() {
  var html = _fetchPage(RANKING_BASE_URL);
  if (!html) {
    Logger.log("❌ HTML を取得できませんでした。URL を確認してください: " + RANKING_BASE_URL);
    return;
  }

  Logger.log("✅ HTML 取得成功 (全体 " + html.length + " 文字)");
  Logger.log("─── 先頭 3000文字 ───");
  Logger.log(html.substring(0, 3000));
  Logger.log("─── 末尾 1000文字 ───");
  Logger.log(html.substring(Math.max(0, html.length - 1000)));

  // テスト: 現在の正規表現で何件取れるか
  var parsed = _parseFollowersFromHtml(html);
  var keys = Object.keys(parsed);
  Logger.log("─── パース結果: " + keys.length + " 件 ───");
  for (var i = 0; i < Math.min(keys.length, 20); i++) {
    Logger.log("  @" + keys[i] + " → " + parsed[keys[i]]);
  }

  if (keys.length === 0) {
    Logger.log(
      "⚠️ パースできませんでした。HTML を確認して " +
      "_parseFollowersFromHtml() 内の正規表現を修正してください。"
    );
  }
}

/**
 * CRM に登録されているユーザー名の一覧をログ出力する（デバッグ用）
 * ランキングサイトのユーザー名形式と比較するために使う
 */
function debugListUsernames() {
  var ss = getSpreadsheet();
  var count = 0;

  for (var s = 0; s < PERSON_SHEETS.length; s++) {
    var sheetName = PERSON_SHEETS[s];
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) continue;

    var data = sheet.getDataRange().getValues();
    Logger.log("── " + sheetName + " ──");

    for (var i = 1; i < data.length; i++) {
      if (!data[i][2] || String(data[i][2]).trim() === "") continue;
      var name = String(data[i][2]).trim();
      var username = String(data[i][INDEX_TO_PERSON_COL["ユーザー名"]] || "").trim();
      var followers = data[i][INDEX_TO_PERSON_COL["フォロワー数"]];
      Logger.log("  " + name + " | @" + username + " | 現フォロワー: " + followers);
      count++;
    }
  }
  Logger.log("合計: " + count + " 件");
}
