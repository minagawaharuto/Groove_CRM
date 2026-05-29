/**
 * ============================================================
 *  Auth.gs — 権限管理 & Config 設定
 *  タレント・インフルエンサー管理 CRM
 * ============================================================
 */

// ─── ロール定義 ─────────────────────────────────────────────
var ROLE = {
  ADMIN:  'admin',
  EDITOR: 'editor',
  VIEWER: 'viewer',
  NONE:   'none'
};

/** ロールの階層（数値が大きいほど権限が強い） */
var ROLE_LEVEL = {};
ROLE_LEVEL[ROLE.NONE]   = 0;
ROLE_LEVEL[ROLE.VIEWER] = 1;
ROLE_LEVEL[ROLE.EDITOR] = 2;
ROLE_LEVEL[ROLE.ADMIN]  = 3;

// ─── 基本関数 ────────────────────────────────────────────────

/**
 * 現在のユーザーのメールアドレスを取得
 * @return {string}
 */
function getCurrentUserEmail() {
  return Session.getActiveUser().getEmail();
}

/**
 * 指定ロールの権限があるか判定
 * @param {string} role 'admin' | 'editor' | 'viewer'
 * @return {boolean}
 */
function checkPermission(role) {
  var userRole = getUserRole();
  var userLevel = ROLE_LEVEL[userRole] || 0;
  var requiredLevel = ROLE_LEVEL[role] || 0;
  return userLevel >= requiredLevel;
}

// ─── 権限判定 ────────────────────────────────────────────────

/**
 * 現在のユーザーのロールを取得
 * Configシートの admin_emails / editor_emails / viewer_emails を参照
 * @return {string} ROLE の値
 */
function getUserRole() {
  var email = getCurrentUserEmail();
  if (!email) return ROLE.NONE;
  email = email.toLowerCase();

  var config = _loadConfigMap();

  // Admin チェック
  var adminEmails = _parseEmailList(config['admin_emails'] || '');
  if (adminEmails.indexOf(email) !== -1) return ROLE.ADMIN;

  // Editor チェック
  var editorEmails = _parseEmailList(config['editor_emails'] || '');
  if (editorEmails.indexOf(email) !== -1) return ROLE.EDITOR;

  // Viewer チェック
  var viewerEmails = _parseEmailList(config['viewer_emails'] || '');
  if (viewerEmails.indexOf(email) !== -1) return ROLE.VIEWER;

  // スプレッドシートにアクセスできている時点で最低 Viewer とする
  return ROLE.VIEWER;
}

/**
 * 指定ロール以上の権限があるか検証し、不足時は例外をスロー
 * @param {string} minRole ROLE.VIEWER / ROLE.EDITOR / ROLE.ADMIN
 * @throws {Error}
 */
function requireRole(minRole) {
  if (!checkPermission(minRole)) {
    var email = getCurrentUserEmail() || '不明';
    throw new Error('権限がありません（必要: ' + minRole + ' / ユーザー: ' + email + '）');
  }
}

/**
 * Editor以上の権限を要求。不足時は例外スロー。
 */
function requireEditor() {
  requireRole(ROLE.EDITOR);
}

/**
 * Admin権限を要求。不足時は例外スロー。
 */
function requireAdmin() {
  requireRole(ROLE.ADMIN);
}

/**
 * Viewer以上の権限を要求。不足時は例外スロー。
 */
function requireViewer() {
  requireRole(ROLE.VIEWER);
}

/**
 * フロントエンド向け — 現在のユーザー情報を返す
 * @return {Object}
 */
function getCurrentUser() {
  try {
    var email = getCurrentUserEmail();
    var role = getUserRole();
    return response(true, {
      email: email || '',
      role: role,
      displayName: email ? email.split('@')[0] : 'ゲスト',
      isAdmin: role === ROLE.ADMIN,
      isEditor: role === ROLE.ADMIN || role === ROLE.EDITOR,
      isViewer: true
    });
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── Config 管理 ─────────────────────────────────────────────

/**
 * Configシートの全設定を読み出す （Admin のみ）
 * @return {Object}
 */
function getConfig() {
  try {
    requireAdmin();
    var config = _loadConfigMap();
    return response(true, config);
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * Configシートを更新する （Admin のみ）
 * @param {Object} patch { key: value, ... }
 * @return {Object}
 */
function updateConfig(patch) {
  try {
    requireAdmin();

    if (!patch || typeof patch !== 'object') {
      throw new Error('不正なパラメータです。');
    }

    var sheet = getSheet(SHEET.CONFIG);
    var data = sheet.getDataRange().getValues();

    // 既存キーの更新
    var updatedKeys = {};
    for (var i = 1; i < data.length; i++) {
      var key = String(data[i][0]).trim();
      if (patch.hasOwnProperty(key)) {
        sheet.getRange(i + 1, 2).setValue(patch[key]);
        updatedKeys[key] = true;
      }
    }

    // 新規キーの追加
    var keys = Object.keys(patch);
    for (var k = 0; k < keys.length; k++) {
      if (!updatedKeys[keys[k]]) {
        sheet.appendRow([keys[k], patch[keys[k]]]);
      }
    }

    _clearConfigCache();
    return response(true, null, '設定を更新しました。');
  } catch (e) {
    return errorResponse(e);
  }
}

// ─── 内部ヘルパー ────────────────────────────────────────────

/**
 * Configシートを key-value マップとしてロード（キャッシュ付き）
 * @return {Object}
 * @private
 */
function _loadConfigMap() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('CRM_CONFIG_CACHE');
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* 無視 */ }
  }

  var sheet = getSheet(SHEET.CONFIG);
  var data = sheet.getDataRange().getValues();
  var map = {};

  for (var i = 1; i < data.length; i++) {
    var key = String(data[i][0]).trim();
    if (key) {
      map[key] = data[i][1] !== undefined ? String(data[i][1]).trim() : '';
    }
  }

  try {
    cache.put('CRM_CONFIG_CACHE', JSON.stringify(map), 300);
  } catch (e) {
    console.error('Config キャッシュ保存エラー: ' + e.message);
  }
  return map;
}

/** @private */
function _clearConfigCache() {
  try { CacheService.getScriptCache().remove('CRM_CONFIG_CACHE'); } catch (e) { /* 無視 */ }
}

/**
 * カンマ/セミコロン/スペース区切りのメールリストをパース
 * @param {string} str
 * @return {Array<string>}
 * @private
 */
function _parseEmailList(str) {
  if (!str) return [];
  return str.split(/[,;;\s]+/).map(function(email) {
    return email.trim().toLowerCase();
  }).filter(function(email) {
    return email.length > 0;
  });
}
