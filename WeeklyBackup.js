/**
 * ============================================================
 *  WeeklyBackup.gs — 週次バックアップ
 *  タレント・インフルエンサー管理 CRM
 * ============================================================
 */

/**
 * createWeeklyBackup()
 * メインスプレッドシートを複製して Google Drive に保存する。
 * ファイル名: 'CRM_Backup_yyyyMMdd'
 *
 * 手動実行の場合:
 *   GAS エディタで createWeeklyBackup() を直接実行。
 *
 * 自動実行（毎週月曜 6:00）:
 *   GAS エディタで setupWeeklyBackupTrigger() を1回実行すると
 *   時間トリガーが自動登録されます。
 *
 * @return {Object} response
 */
function createWeeklyBackup() {
  try {
    requireAdmin();

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    var now = new Date();
    var dateStr = Utilities.formatDate(now, 'JST', 'yyyyMMdd');
    var backupName = 'CRM_Backup_' + dateStr;

    // スプレッドシートを複製
    var copy = ss.copy(backupName);
    var fileId = copy.getId();
    var fileUrl = copy.getUrl();

    Logger.log('✅ バックアップ作成完了: ' + backupName + ' (ID: ' + fileId + ')');

    return response(true, {
      backupName: backupName,
      fileId: fileId,
      fileUrl: fileUrl
    }, 'バックアップを作成しました: ' + backupName);

  } catch (e) {
    return errorResponse(e);
  }
}

// ─── トリガー設定 ─────────────────────────────────────────────

/**
 * setupWeeklyBackupTrigger()
 * ProjectTriggers で毎週月曜 6:00 (JST) に createWeeklyBackup を実行するトリガーを登録。
 * 既存の同名トリガーがあれば重複を防ぐために削除してから再登録する。
 *
 * ■ 使い方:
 *   GAS エディタで setupWeeklyBackupTrigger() を1回だけ手動実行する。
 *   以後は毎週自動実行される。
 *
 * ■ トリガー削除:
 *   GAS エディタの「トリガー」画面から手動削除、
 *   または removeWeeklyBackupTrigger() を実行。
 */
function setupWeeklyBackupTrigger() {
  // 既存の同名トリガーを削除（重複防止）
  removeWeeklyBackupTrigger();

  ScriptApp.newTrigger('createWeeklyBackup')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(6)
    .create();

  Logger.log('✅ 週次バックアップトリガーを登録しました（毎週月曜 6:00）');
}

/**
 * removeWeeklyBackupTrigger()
 * createWeeklyBackup に紐づくトリガーをすべて削除する。
 */
function removeWeeklyBackupTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'createWeeklyBackup') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
}
