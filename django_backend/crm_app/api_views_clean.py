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
        
        keyword = args.get('keyword', '').lower()
        category = args.get('category', '')
        status = args.get('status', '')
        priority = args.get('priority', '')
        
        results = []
        for r in records:
            # Filter logic matching front-end and GAS
            if category and category != 'すべて' and r.get('区分') != category:
                continue
            if status and status != 'すべて' and r.get('ステータス') != status:
                continue
            if priority and priority != 'すべて' and r.get('優先度') != priority:
                continue
            
            if keyword:
                match_name = keyword in str(r.get('名前', '')).lower()
                match_username = keyword in str(r.get('ユーザー名', '')).lower()
                match_tags = keyword in str(r.get('タグ', '')).lower()
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
                # 1-indexed for gspread
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
            
        # Instead of calling update_person view, we inline it or call it
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
                    c_obj['person_name'] = c_obj.get('person_id', '') # Fallback
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
    """自然言語のクエリをGeminiで解析し、searchPeopleのパラメータに変換して返す"""
    try:
        args = get_args(request)
        query = args[0] if args else ''
        if not query:
            return JsonResponse({'success': False, 'message': '検索クエリが空です。'})

        import os
        from pathlib import Path
        
        # .envを動的に再読み込み
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