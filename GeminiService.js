/**
 * ============================================================
 *  GeminiService.js — 自然言語解析ロジック
 * ============================================================
 */

/**
 * ユーザーの自然言語クエリを解析して、検索パラメータを返す
 * @param {string} userInput 
 * @return {Object} result { success: boolean, data: Object, message: string }
 */
function parseSearchQueryWithAI(userInput) {
  try {
    var apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (!apiKey) {
      return { success: false, message: 'Gemini API Key が設定されていません。' };
    }

    var endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + apiKey;

    var prompt = `
あなたはプロフェッショナルなCRM検索アシスタントです。
ユーザーの入力（自然言語）を解析し、以下のJSONフォーマットで検索パラメータを抽出してください。

【パラメータ仕様】
- keyword: (string) 名前、ユーザー名、タグ、メモなどに含まれそうな単語（複数ある場合はスペース区切り）
- category: (string) "モデル", "インフルエンサー", "スポーツ選手・著名人" のいずれか
- followersMin: (number) フォロワー数の下限値（実数）
- followersMax: (number) フォロワー数の上限値（実数）
- tag: (string) 特定のタグ（例: "TikToker", "YouTuber", "グルメ"など）
- location: (string) 所在地
- platform: (string) "Instagram", "TikTok", "YouTube", "X(Twitter)" のいずれか
- ageMin: (number) 年齢の下限
- ageMax: (number) 年齢の上限
- agency: (string) "有" または "無"
- owner: (string) 担当者名

【出力形式】
JSONのみを返してください。それ以外の説明や挨拶は不要です。該当しない項目は null にしてください。

【ユーザー入力】
"${userInput}"
`;

    var payload = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseMimeType: "application/json"
      }
    };

    var options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(endpoint, options);
    var resCode = response.getResponseCode();
    var resText = response.getContentText();

    if (resCode !== 200) {
      console.error('Gemini API Error:', resText);
      return { success: false, message: 'AI解析に失敗しました（HTTP ' + resCode + '）' };
    }

    var json = JSON.parse(resText);
    var aiResultText = json.candidates[0].content.parts[0].text;
    var parsedParams = JSON.parse(aiResultText);

    return { success: true, data: parsedParams };

  } catch (e) {
    console.error('parseSearchQueryWithAI Error:', e);
    return { success: false, message: 'エラーが発生しました: ' + e.message };
  }
}
