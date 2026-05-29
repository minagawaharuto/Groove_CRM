import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from datetime import datetime
from .services.spreadsheet_service import (
    get_data_client, SHEET, PERSON_COL_MAP, INDEX_TO_PERSON_COL,
    PERSON_SHEETS, PERSON_EXTRA_COL, generate_id
)

def get_args(request):
    try:
        data = json.loads(request.body)
        return data.get('args', [])
    except:
        return []

@csrf_exempt
def get_current_user(request):
    return JsonResponse({
        'success': True,
        'data': {
            'displayName': 'Admin User',
            'role': 'Admin'
        }
    })

@csrf_exempt
def search_people(request):
    try:
        args = get_args(request)[0] if get_args(request) else {}
        client = get_data_client()
        records = client.get_all_records(SHEET['INDEX']) if client.spreadsheet else []

        keyword      = args.get('keyword', '').lower()
        category     = args.get('category', '')
        status       = args.get('status', '')
        priority     = args.get('priority', '')
        location     = args.get('location', '').lower()
        owner        = args.get('owner', '').lower()
        platform     = args.get('platform', '').lower()
        agency       = args.get('agency', '')          # '有' or '無' or ''

        # フォロワー数フィルター
        try:
            followers_min = int(args.get('followersMin', '') or 0)
        except (ValueError, TypeError):
            followers_min = 0
        try:
            followers_max_raw = args.get('followersMax', '')
            followers_max = int(followers_max_raw) if followers_max_raw else None
        except (ValueError, TypeError):
            followers_max = None

        # 年齢フィルター
        try:
            age_min = int(args.get('ageMin', '') or 0)
        except (ValueError, TypeError):
            age_min = 0
        try:
            age_max_raw = args.get('ageMax', '')
            age_max = int(age_max_raw) if age_max_raw else None
        except (ValueError, TypeError):
            age_max = None

        results = []
        for r in records:
            # 区分フィルター
            if category and category != 'すべて' and r.get('区分') != category:
                continue
            # ステータスフィルター
            if status and status != 'すべて' and r.get('ステータス') != status:
                continue
            # 優先度フィルター
            if priority and priority != 'すべて' and r.get('優先度') != priority:
                continue

            # フォロワー数フィルター
            if followers_min > 0 or followers_max is not None:
                try:
                    f_val = int(str(r.get('フォロワー数', '') or '0').replace(',', ''))
                except (ValueError, TypeError):
                    f_val = 0
                if followers_min > 0 and f_val < followers_min:
                    continue
                if followers_max is not None and f_val > followers_max:
                    continue

            # 年齢フィルター
            if age_min > 0 or age_max is not None:
                try:
                    a_val = int(str(r.get('年齢', '') or r.get('Age', '') or '0').replace('歳', ''))
                except (ValueError, TypeError):
                    a_val = 0
                if age_min > 0 and a_val < age_min:
                    continue
                if age_max is not None and a_val > age_max:
                    continue

            # 居住地フィルター（部分一致）
            if location:
                loc_val = str(r.get('居住地', '') or r.get('所在地', '')).lower()
                if location not in loc_val:
                    continue

            # 担当窓口フィルター（部分一致）
            if owner:
                owner_val = str(
                    r.get('担当（社内）', '') or r.get('社内担当', '') or ''
                ).lower()
                if owner not in owner_val:
                    continue

            # メインプラットフォームフィルター（URL列やメインSNS列の部分一致）
            if platform:
                # URL 列またはユーザー名列でプラットフォームキーワードを検索
                url_val  = str(r.get('URL', '') or '').lower()
                un_val   = str(r.get('ユーザー名', '') or '').lower()
                main_plat = str(r.get('メインSNS', '') or r.get('メインプラットフォーム', '') or '').lower()
                plat_key  = platform  # already lowercased above
                # platform specific url patterns
                plat_domain_map = {
                    'instagram': 'instagram.com',
                    'youtube': 'youtube.com',
                    'tiktok': 'tiktok.com',
                    'x': ['twitter.com', 'x.com']
                }
                domain_match = False
                domains = plat_domain_map.get(plat_key, plat_key)
                if isinstance(domains, list):
                    domain_match = any(d in url_val for d in domains)
                else:
                    domain_match = (domains in url_val)
                if not (domain_match or plat_key in main_plat or plat_key in un_val):
                    continue

            # 事務所フィルター（有：入力あり / 無：空白）
            if agency:
                agency_val = str(r.get('所属事務所', '') or r.get('事務所', '')).strip()
                if agency == '有' and not agency_val:
                    continue
                if agency == '無' and agency_val:
                    continue

            # フリーワードフィルター
            if keyword:
                match_name     = keyword in str(r.get('名前', '')).lower()
                match_username = keyword in str(r.get('ユーザー名', '')).lower()
                match_tags     = keyword in str(r.get('タグ', '')).lower()
                if not (match_name or match_username or match_tags):
                    continue

            results.append(r)

        page = int(args.get('page', 1))
        page_size = int(args.get('pageSize', 50))
        start = (page - 1) * page_size
        end = start + page_size

        return JsonResponse({
            'success': True,
            'data': {
                'results': results[start:end],
                'total': len(results),
                'page': page,
                'pageSize': page_size
            }
        })
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})

@csrf_exempt
def get_person(request):
    try:
        person_id = get_args(request)[0]
        if not person_id:
            raise ValueError('person_id is missing.')
            
        client = get_data_client()
        found = client.find_person_row(person_id)
        if not found:
            raise ValueError(f'person_id "{person_id}" not found.')
            
        row_data = {}
        headers = found['headers']
        data_row = found['rowData']
        for j in range(len(headers)):
            key = str(headers[j]).strip()
            if not key:
                key = f'col_{j}'
            val = data_row[j] if j < len(data_row) else ''
            row_data[key] = val
            
        return JsonResponse({
            'success': True,
            'data': {
                'sheetName': found['sheetName'],
                'rowIndex': found['rowIndex'],
                'data': row_data
            }
        })
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})

@csrf_exempt
def update_person(request):
    try:
        args = get_args(request)
        person_id = args[0]
        patch = args[1]
        
        client = get_data_client()
        found = client.find_person_row(person_id)
        if not found:
            raise ValueError(f'person_id "{person_id}" not found.')
            
        sheet_name = found['sheetName']
        row_index = found['rowIndex']
        headers = found['headers']
        
        for col_name, new_val in patch.items():
            header_idx = -1
            for h in range(len(headers)):
                if str(headers[h]).strip() == col_name:
                    header_idx = h
                    break
            
            if header_idx != -1:
                client.update_cell(sheet_name, row_index, header_idx + 1, new_val)
                continue
                
            if col_name in PERSON_COL_MAP:
                client.update_cell(sheet_name, row_index, PERSON_COL_MAP[col_name] + 1, new_val)
                
        return JsonResponse({'success': True, 'data': None, 'message': '人物データを更新しました。'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})

@csrf_exempt
def create_person(request):
    try:
        payload = get_args(request)[0]
        category = payload.get('区分')
        name = payload.get('名前')
        if not category or not name:
            raise ValueError('区分 and 名前 are required.')
            
        client = get_data_client()
        values = client.get_all_values(category)
        headers = values[0] if values else []
        
        total_cols = max(64, len(headers))
        new_row = [''] * total_cols
        
        new_person_id = generate_id('P')
        new_row[PERSON_EXTRA_COL['PERSON_ID']] = new_person_id
        
        header_map = {str(h).strip(): i for i, h in enumerate(headers) if str(h).strip()}
        
        for col_name, val in payload.items():
            if col_name in INDEX_TO_PERSON_COL:
                new_row[INDEX_TO_PERSON_COL[col_name]] = val
            elif col_name in PERSON_COL_MAP:
                new_row[PERSON_COL_MAP[col_name]] = val
            elif col_name in header_map:
                new_row[header_map[col_name]] = val
                
        client.append_row(category, new_row)
        return JsonResponse({'success': True, 'data': {'person_id': new_person_id}, 'message': '人物を追加しました。'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})

@csrf_exempt
def get_person_timeline(request):
    try:
        person_id = get_args(request)[0]
        client = get_data_client()
        data = client.get_all_values(SHEET['ACTIVITY_LOG'])
        if len(data) < 2:
            return JsonResponse({'success': True, 'data': []})
            
        headers = data[0]
        logs = []
        for i in range(1, len(data)):
            if str(data[i][1]).strip() == str(person_id).strip():
                obj = {}
                for j in range(len(headers)):
                    key = str(headers[j]).strip()
                    obj[key] = data[i][j] if j < len(data[i]) else ''
                logs.append(obj)
                
        logs.sort(key=lambda x: x.get('日時', ''), reverse=True)
        return JsonResponse({'success': True, 'data': logs})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})

@csrf_exempt
def add_activity_log(request):
    try:
        payload = get_args(request)[0]
        person_id = payload.get('person_id')
        if not person_id:
            raise ValueError('person_id is required.')
            
        client = get_data_client()
        found = client.find_person_row(person_id)
        if not found:
            raise ValueError(f'person_id "{person_id}" not found.')
            
        log_id = client.get_next_id(SHEET['ACTIVITY_LOG'], 0)
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M')
        
        new_row = [
            log_id,
            person_id,
            payload.get('日時') or now_str,
            payload.get('種別') or '',
            payload.get('内容') or '',
            payload.get('結果') or '',
            payload.get('次アクション日') or '',
            payload.get('次アクション内容') or '',
            payload.get('担当') or 'admin'
        ]
        client.append_row(SHEET['ACTIVITY_LOG'], new_row)
        
        person_patch = {'最終接触日': datetime.now().strftime('%Y-%m-%d')}
        if payload.get('次アクション日'):
            person_patch['次アクション日'] = payload.get('次アクション日')
        if payload.get('次アクション内容'):
            person_patch['次アクション内容'] = payload.get('次アクション内容')
        if payload.get('ステータス'):
            person_patch['ステータス'] = payload.get('ステータス')
            
        sheet_name = found['sheetName']
        row_index = found['rowIndex']
        headers = found['headers']
        
        for col_name, new_val in person_patch.items():
            header_idx = -1
            for h in range(len(headers)):
                if str(headers[h]).strip() == col_name:
                    header_idx = h
                    break
            if header_idx != -1:
                client.update_cell(sheet_name, row_index, header_idx + 1, new_val)
                continue
            if col_name in PERSON_COL_MAP:
                client.update_cell(sheet_name, row_index, PERSON_COL_MAP[col_name] + 1, new_val)

        return JsonResponse({'success': True, 'data': {'log_id': log_id}, 'message': f'活動ログを追加しました（ID: {log_id}）。'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})

@csrf_exempt
def list_deals(request):
    try:
        filters = get_args(request)[0] if get_args(request) else {}
        client = get_data_client()
        data = client.get_all_values(SHEET['DEALS'])
        if len(data) < 2:
            return JsonResponse({'success': True, 'data': []})
            
        headers = data[0]
        results = []
        for i in range(1, len(data)):
            if not data[i][0] or str(data[i][0]).strip() == "":
                continue
            obj = {}
            for j in range(len(headers)):
                key = str(headers[j]).strip()
                obj[key] = data[i][j] if j < len(data[i]) else ''
            obj['_row'] = i + 1
            
            if filters.get('status') and filters.get('status') not in str(obj.get('状態', '')):
                continue
            if filters.get('owner') and filters.get('owner') not in str(obj.get('担当', '')):
                continue
            if filters.get('keyword'):
                kw = filters.get('keyword').lower()
                m_name = kw in str(obj.get('案件名', '')).lower()
                m_client = kw in str(obj.get('クライアント', '')).lower()
                if not (m_name or m_client):
                    continue
            results.append(obj)
            
        return JsonResponse({'success': True, 'data': results})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})

@csrf_exempt
def get_deal(request):
    try:
        deal_id = str(get_args(request)[0]).strip()
        client = get_data_client()
        
        deal_data = client.get_all_values(SHEET['DEALS'])
        deal_headers = deal_data[0]
        deal_obj = None
        
        for i in range(1, len(deal_data)):
            if str(deal_data[i][0]).strip() == deal_id:
                deal_obj = {}
                for j in range(len(deal_headers)):
                    deal_obj[str(deal_headers[j]).strip()] = deal_data[i][j] if j < len(deal_data[i]) else ''
                break
                
        if not deal_obj:
            raise ValueError(f'deal_id "{deal_id}" not found.')
            
        casting_data = client.get_all_values(SHEET['DEAL_CASTING'])
        casting_headers = casting_data[0] if casting_data else []
        castings = []
        
        if casting_data and len(casting_data) > 1:
            for i in range(1, len(casting_data)):
                if len(casting_data[i]) > 1 and str(casting_data[i][1]).strip() == deal_id:
                    c_obj = {}
                    for j in range(len(casting_headers)):
                        c_obj[str(casting_headers[j]).strip()] = casting_data[i][j] if j < len(casting_data[i]) else ''
                    c_obj['person_name'] = c_obj.get('person_id', '')
                    castings.append(c_obj)
                    
        deal_obj['castings'] = castings
        return JsonResponse({'success': True, 'data': deal_obj})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})

@csrf_exempt
def create_deal(request):
    try:
        payload = get_args(request)[0]
        if not payload or not payload.get('案件名'):
            raise ValueError('案件名は必須です。')
            
        client = get_data_client()
        deal_id = client.get_next_id(SHEET['DEALS'], 0)
        
        new_row = [
            deal_id,
            payload.get('案件名'),
            payload.get('クライアント', ''),
            payload.get('状態', '企画中'),
            payload.get('担当', 'admin'),
            payload.get('納期', '')
        ]
        
        client.append_row(SHEET['DEALS'], new_row)
        return JsonResponse({'success': True, 'data': {'deal_id': deal_id}, 'message': f'案件を作成しました（ID: {deal_id}）。'})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})

import os

@csrf_exempt
def ai_search_people(request):
    try:
        args = get_args(request)
        query = args[0] if args else ''
        if not query:
            return JsonResponse({'success': False, 'message': '検索クエリが空です。'})

        import os
        from pathlib import Path
        
        api_key = os.environ.get('GEMINI_API_KEY', '')
        env_path = Path(__file__).resolve().parent.parent / '.env'
        if env_path.exists():
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if '=' in line and not line.startswith('#'):
                        k, v = line.split('=', 1)
                        if k.strip() == 'GEMINI_API_KEY':
                            api_key = v.strip()
                            os.environ['GEMINI_API_KEY'] = api_key

        if not api_key or 'ここにAPIキーを' in api_key:
            return JsonResponse({'success': False, 'message': 'GEMINI_API_KEY が設定されていません。'})

        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.5-flash')

        prompt = f"""
あなたはインフルエンサー管理CRMの検索パラメータ変換AIです。
ユーザーの自然言語による検索クエリを、以下のJSON形式の検索パラメータに変換してください。

【ユーザーのクエリ】
{query}

【出力するJSONの形式】
{{
  "keyword": "名前・ユーザー名・タグで検索するフリーワード（なければ空文字）",
  "category": "区分。「モデル」「インフルエンサー」「スポーツ選手・著名人」のいずれか。該当なければ空文字",
  "status": "ステータス。「未着手」「アプローチ中」「交渉中」「契約済」「NG」のいずれか。該当なければ空文字",
  "priority": "優先度。「高」「中」「低」のいずれか。該当なければ空文字",
  "followersMin": "最小フォロワー数（数値のみ。「1万人以上」なら10000）。なければ空文字",
  "followersMax": "最大フォロワー数（数値のみ）。なければ空文字"
}}

注意:
- JSONのみを出力し、説明文やマークダウンブロックは一切含めないでください。
- フォロワー数は「万」「千」「K」「M」などを数値に変換してください。（例：「1万」→10000、「10K」→10000）
- 不明・指定なしの項目は空文字("")にしてください。
"""
        response = model.generate_content(prompt)
        text = response.text.strip()
        for prefix in ['```json', '```']:
            if text.startswith(prefix):
                text = text[len(prefix):]
        if text.endswith('```'):
            text = text[:-3]
        text = text.strip()

        import json as json_lib
        params = json_lib.loads(text)
        return JsonResponse({'success': True, 'data': params, 'message': 'AIによるクエリ解析が完了しました。'})

    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})


@csrf_exempt
def auto_enrich_person(request):
    """高度なスクレイピングとSNS先行抽出による超高精度自動補完"""
    try:
        args = get_args(request)
        if not args: raise ValueError('Invalid payload')
        payload = args[0]
        person_name = payload.get('name')
        if not person_name: raise ValueError('Name is required.')

        api_key = os.environ.get('GEMINI_API_KEY', '')
        env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
        if os.path.exists(env_path):
            with open(env_path, encoding='utf-8') as ef:
                for line in ef:
                    if '=' in line and not line.strip().startswith('#'):
                        k, v = line.strip().split('=', 1)
                        if k.strip() == 'GEMINI_API_KEY':
                            api_key = v.strip()
                            os.environ['GEMINI_API_KEY'] = api_key

        import google.generativeai as genai
        from duckduckgo_search import DDGS
        import requests as req_lib
        import re
        import json as json_mod

        # 1. 信頼性の高いソースを優先検索（完全一致＋大手ニュースサイト）
        ddgs = DDGS()
        main_query = f'"{person_name}" (site:oricon.co.jp OR site:modelpress.jp OR site:natalie.mu OR site:wikipedia.org)'
        sns_query = f'"{person_name}" (Instagram OR Twitter OR TikTok OR YouTube)'
        
        all_snippets = []
        target_urls = []
        
        for q in [main_query, sns_query]:
            try:
                res = list(ddgs.text(q, max_results=5))
                for r in res:
                    all_snippets.append(f"Title: {r['title']}\nSnippet: {r['body']}\nURL: {r['href']}")
                    # Bot対策の強いドメインはスクレイピングをスキップし、他を優先
                    is_sns = any(d in r['href'] for d in ['instagram.com', 'twitter.com', 'x.com', 'tiktok.com', 'youtube.com'])
                    if not is_sns and r['href'] not in target_urls:
                        target_urls.append(r['href'])
            except Exception: pass

        # 2. HTMLクリーニングとJSON-LD取得、SNS URL先行抽出
        fetched_content = []
        confirmed_sns = {"X": "", "Instagram": "", "YouTube": "", "TikTok": ""}
        sns_patterns = {
            "Instagram": r'https?://(?:www\.)?instagram\.com/[a-zA-Z0-9._]+/?',
            "X": r'https?://(?:www\.)?(?:twitter\.com|x\.com)/[a-zA-Z0-9_]+/?',
            "YouTube": r'https?://(?:www\.)?youtube\.com/(?:@|channel/|user/)[a-zA-Z0-9_-]+/?',
            "TikTok": r'https?://(?:www\.)?tiktok\.com/@[a-zA-Z0-9._]+/?'
        }

        for url in target_urls[:5]:
            try:
                resp = req_lib.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
                if resp.status_code == 200:
                    html = resp.text
                    # ノイズタグ（script, style, nav, footer, header）を除去
                    html_clean = re.sub(r'<(script|style|nav|footer|header)[^>]*>.*?</\1>', ' ', html, flags=re.DOTALL | re.IGNORECASE)
                    # JSON-LD構造化データの抽出
                    json_lds = re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, flags=re.DOTALL)
                    # テキスト抽出（5000文字拡張）
                    text = re.sub(r'<[^>]+>', ' ', html_clean)
                    text = re.sub(r'\s+', ' ', text).strip()[:5000]
                    fetched_content.append(f"[URL: {url}]\n{text}")
                    if json_lds: fetched_content.append(f"[JSON-LD from {url}]\n" + "\n".join(json_lds))
                    # SNS URLの正規表現先行抽出（Geminiの推測防止）
                    for platform, pattern in sns_patterns.items():
                        if not confirmed_sns[platform]:
                            m = re.search(pattern, html)
                            if m: confirmed_sns[platform] = m.group(0)
            except Exception: pass

        # 3. Gemini による構造化データ抽出
        all_context = "\n\n---\n\n".join(all_snippets + fetched_content)
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-2.5-flash')
        
        prompt = f"""あなたはプロのリサーチャーです。人物「{person_name}」の情報を抽出してください。
確定済みSNS URL: {json_mod.dumps(confirmed_sns)}

【コンテキスト】
{all_context}

【抽出ルール】
- 確定済みURLがある場合は、それを最優先で採用してください。
- ジャンルは：美容・コスメ、ファッション、グルメ、旅行、ゲーム、フィットネス、料理、育児・ライフスタイル、エンタメ・お笑い、ビジネス・投資、スポーツ、音楽、アート から選択してください。
- 不明な項目は空文字("")にしてください。
- 必ず以下のJSON形式のみで出力してください。説明文やマークダウンブロックは不要です。

{{
    "ジャンル": "",
    "X": "", "YouTube": "", "Instagram": "", "TikTok": "",
    "事務所": "", "居住地": "", "出身": "", "性別": "",
    "画像URL": ""
}}"""

        resp = model.generate_content(prompt)
        raw_text = re.sub(r'```json|```', '', resp.text).strip()
        data = json_mod.loads(raw_text)
        
        # 二重チェック：先行抽出した確定URLでGeminiの結果を上書き
        for k in confirmed_sns:
            if confirmed_sns[k]: data[k] = confirmed_sns[k]
        
        # 画像URLの補完
        try:
            img_res = list(ddgs.images(f'"{person_name}" 宣材写真 顔写真 プロフィール', max_results=1))
            if img_res: data['画像URL'] = img_res[0]['image']
        except Exception: pass

        return JsonResponse({'success': True, 'data': data})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)})
