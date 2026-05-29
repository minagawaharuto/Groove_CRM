/**
 * ============================================================
 *  Main.gs — エントリポイント & グローバル定数・ユーティリティ
 *  タレント・インフルエンサー管理 CRM
 * ============================================================
 */

// ─── グローバル定数 ─────────────────────────────────────────
/** @const {string} メインスプレッドシートID（デプロイ前に実ID へ差し替え） */
var SPREADSHEET_ID = "14HAgG2wwQh54CiV0wONCjxI6VXA2Mt-tpmBv3YL_RUM";

/** シート名定義 */
var SHEET = {
  MODEL: "モデル",
  INFLUENCER: "インフルエンサー",
  SPORTS: "スポーツ選手・著名人",
  INDEX: "90_Index",
  DEALS: "10_Deals",
  DEAL_CASTING: "11_DealCasting",
  ACTIVITY_LOG: "20_ActivityLog",
  CONFIG: "99_Config",
};

/** 人物シート一覧（ループ用） */
var PERSON_SHEETS = [SHEET.MODEL, SHEET.INFLUENCER, SHEET.SPORTS];

/** 人物シートの区分ラベル（source_sheet → 区分 に使う） */
var PERSON_CATEGORY = {};
PERSON_CATEGORY[SHEET.MODEL] = "モデル";
PERSON_CATEGORY[SHEET.INFLUENCER] = "インフルエンサー";
PERSON_CATEGORY[SHEET.SPORTS] = "スポーツ選手・著名人";

/**
 * 人物シートの先頭16列は既存。17列目以降に CRM 追加列を配置する。
 * 0-indexed で列番号を定義。
 */
var PERSON_EXTRA_COL = {
  PERSON_ID: 16, // 17列目 (0-indexed)
  STATUS: 49, // ステータス
  LAST_CONTACT: 51, // 最終接触日
  NEXT_ACTION_DATE: 52, // 次アクション日
  NEXT_ACTION: 53, // 次アクション内容
  PRIORITY: 54, // 優先度
  OWNER: 28, // 担当（社内）
  MEMO: 59, // メモ
};

/** CRM追加列のキー名と 0-indexed 列番号のマッピング */
var PERSON_COL_MAP = {
  person_id: 16,
  ステータス: 49,
  最終接触日: 51,
  次アクション日: 52,
  次アクション内容: 53,
  優先度: 54,
  社内担当: 28,
  メモ: 59,
};

/** 90_Index のヘッダ順 */
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
  "年齢",
  "メインプラットフォーム",
  "所属事務所",
  "source_sheet",
  "source_row",
  "_search_text",
];

/**
 * Indexの列名 → 人物シート上の 0-indexed 列番号マッピング
 * （人物シート3種は同じ列構成を前提）
 */
var INDEX_TO_PERSON_COL = {
  person_id: 16,
  名前: 2,
  ユーザー名: 1,
  URL: 8,
  フォロワー数: 0,
  ギャラ目安: 36,
  所在地: 6,
  サブカテゴリ: 26,
  タグ: 27,
  ステータス: 49,
  最終接触日: 51,
  次アクション日: 52,
  優先度: 54,
  "担当（社内）": 28,
  年齢: -1,
  メインプラットフォーム: -1,
  所属事務所: -1,
};

/** 10_Deals ヘッダ */
var DEAL_HEADERS = [
  "deal_id",
  "案件名",
  "クライアント",
  "状態",
  "担当",
  "納期",
];

/** 11_DealCasting ヘッダ */
var DEAL_CASTING_HEADERS = [
  "deal_casting_id",
  "deal_id",
  "person_id",
  "候補ステータス",
  "提示条件",
  "NG理由",
  "メモ",
];

/** 20_ActivityLog ヘッダ */
var ACTIVITY_LOG_HEADERS = [
  "log_id",
  "person_id",
  "日時",
  "種別",
  "内容",
  "結果",
  "次アクション日",
  "次アクション内容",
  "担当",
];

/** ページングデフォルト */
var DEFAULT_PAGE_SIZE = 50;

/** キャッシュキー & TTL */
var CACHE_KEY_INDEX = "CRM_INDEX_CACHE";
var CACHE_KEY_SEARCH_PREFIX = "CRM_SEARCH_";
var CACHE_TTL = 600; // 10分

// ─── Web アプリエントリポイント ──────────────────────────────

/**
 * doGet — SPA の index.html を配信
 * @param {Object} e リクエストパラメータ
 * @return {HtmlOutput}
 */
function doGet(e) {
  var tmpl = HtmlService.createTemplateFromFile("index");
  return tmpl
    .evaluate()
    .setTitle("タレント・インフルエンサー CRM")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/**
 * テンプレートインクルード用ヘルパー
 * <?!= include('style') ?> のように使う
 * @param {string} filename
 * @return {string}
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ─── ユーティリティ ──────────────────────────────────────────

/**
 * スプレッドシートを取得（共通）
 * @return {Spreadsheet}
 */
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * シート名からシートオブジェクトを取得
 * @param {string} sheetName
 * @return {Sheet}
 */
function getSheet(sheetName) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error("シートが見つかりません: " + sheetName);
  }
  return sheet;
}

/**
 * UUID-like な一意IDを生成
 * @param {string} prefix 例: 'P', 'D', 'DC', 'L'
 * @return {string}
 */
function generateId(prefix) {
  var ts = new Date().getTime().toString(36);
  var rand = Math.random().toString(36).substring(2, 8);
  return (prefix || "") + ts + rand;
}

/**
 * Date → 'YYYY-MM-DD' 文字列
 * @param {Date} date
 * @return {string}
 */
function formatDate(date) {
  if (!date) return "";
  if (typeof date === "string") return date;
  var d = new Date(date);
  var yyyy = d.getFullYear();
  var mm = ("0" + (d.getMonth() + 1)).slice(-2);
  var dd = ("0" + d.getDate()).slice(-2);
  return yyyy + "-" + mm + "-" + dd;
}

/**
 * Date → 'YYYY-MM-DD HH:mm' 文字列
 * @param {Date} date
 * @return {string}
 */
function formatDateTime(date) {
  if (!date) return "";
  var d = new Date(date);
  return (
    formatDate(d) +
    " " +
    ("0" + d.getHours()).slice(-2) +
    ":" +
    ("0" + d.getMinutes()).slice(-2)
  );
}

/**
 * シートデータを [{header: value, ...}, ...] に変換
 * @param {Sheet} sheet
 * @param {Array<string>=} headers カスタムヘッダ（省略時は1行目を使用）
 * @return {Array<Object>}
 */
function sheetToObjects(sheet, headers) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var hdrs =
    headers ||
    data[0].map(function (h) {
      return String(h).trim();
    });
  var result = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    obj["_row"] = i + 1; // 1-indexed シート行番号
    for (var j = 0; j < hdrs.length; j++) {
      var val = j < data[i].length ? data[i][j] : "";
      obj[hdrs[j]] = val instanceof Date ? formatDate(val) : val;
    }
    result.push(obj);
  }
  return result;
}

/**
 * サーバー関数のレスポンスを統一フォーマットで返す
 * @param {boolean} success
 * @param {*} data
 * @param {string=} message
 * @return {Object}
 */
function response(success, data, message) {
  return {
    success: success,
    data: data || null,
    message: message || "",
  };
}

/**
 * エラーレスポンスを生成してログ出力
 * @param {Error|string} err
 * @return {Object}
 */
function errorResponse(err) {
  var msg = err instanceof Error ? err.message : String(err);
  console.error("[CRM Error] " + msg);
  return response(false, null, msg);
}

/**
 * シートにヘッダ行がなければ追加する（初期セットアップ用）
 * @param {string} sheetName
 * @param {Array<string>} headers
 */
function ensureHeaders(sheetName, headers) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet
      .getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#4a90d9")
      .setFontColor("#ffffff");
  }
}

/**
 * Indexキャッシュおよび検索キャッシュを全クリア（更新系操作後に呼ぶ）
 * Indexチャンク（0〜9）＋検索クエリ別キャッシュを一括削除
 */
function clearIndexCache() {
  try {
    var cache = CacheService.getScriptCache();
    // Indexチャンクキーをすべて削除
    var keys = [];
    for (var i = 0; i < 10; i++) {
      keys.push(CACHE_KEY_INDEX + "_" + i);
    }
    // 検索キャッシュのキー一覧を取得して削除
    var trackingJson = cache.get(CACHE_KEY_SEARCH_PREFIX + "KEYS");
    if (trackingJson) {
      try {
        var searchKeys = JSON.parse(trackingJson);
        keys = keys.concat(searchKeys);
      } catch (e) {
        /* ignore parse error */
      }
      keys.push(CACHE_KEY_SEARCH_PREFIX + "KEYS");
    }
    cache.removeAll(keys);
  } catch (e) {
    console.error("IndexCache削除エラー: " + e.message);
  }
}

/**
 * シートから最大IDを取得して +1 を返す（MAX+1 採番）
 * @param {Sheet} sheet
 * @param {number} idColIndex 0-indexed
 * @return {number}
 */
function getNextId(sheet, idColIndex) {
  var data = sheet.getDataRange().getValues();
  var maxId = 0;
  for (var i = 1; i < data.length; i++) {
    var val = parseInt(data[i][idColIndex], 10);
    if (!isNaN(val) && val > maxId) {
      maxId = val;
    }
  }
  return maxId + 1;
}

/**
 * 初期セットアップ — 必要シートとヘッダを作成
 * 手動で1回実行する
 */
function setupSheets() {
  ensureHeaders(SHEET.INDEX, INDEX_HEADERS);
  ensureHeaders(SHEET.DEALS, DEAL_HEADERS);
  ensureHeaders(SHEET.DEAL_CASTING, DEAL_CASTING_HEADERS);
  ensureHeaders(SHEET.ACTIVITY_LOG, ACTIVITY_LOG_HEADERS);

  // Configシートのセットアップ
  var ss = getSpreadsheet();
  var cfg = ss.getSheetByName(SHEET.CONFIG);
  if (!cfg) {
    cfg = ss.insertSheet(SHEET.CONFIG);
    cfg.appendRow(["key", "value"]);
    cfg.appendRow(["instagram_access_token", ""]);
    cfg.appendRow(["instagram_business_account_id", ""]);
    cfg.appendRow(["admin_emails", ""]);
    cfg.appendRow(["editor_emails", ""]);
    cfg.appendRow(["viewer_emails", ""]);
    cfg
      .getRange(1, 1, 1, 2)
      .setFontWeight("bold")
      .setBackground("#4a90d9")
      .setFontColor("#ffffff");
  }

  // 人物シートは全64列が既に定義済みのため、CRM追加列ヘッダの自動付与は不要

  Logger.log("✅ セットアップ完了");
}
