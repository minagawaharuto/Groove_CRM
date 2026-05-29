
# This script fixes crm_app/api_views.py by rebuilding it with proper encoding

src = 'crm_app/api_views.py'

# Read raw bytes and split by CRLF
with open(src, 'rb') as f:
    raw = f.read()

lines = raw.split(b'\r\n')

# Keep lines 0..401 (1-indexed: 1-402, which is everything up to end of ai_search_people)
clean = lines[:402]

# Build suffix as pure ASCII/bytes (avoid any encoding issues)
# We'll use unicode_escape representation
suffix_lines = [
    b'',
    b'',
    b'@csrf_exempt',
    b'def auto_enrich_person(request):',
    b'    try:',
    b'        args = get_args(request)',
    b'        if not args:',
    b"            raise ValueError('Invalid payload')",
    b'',
    b'        payload = args[0]',
    b"        person_name = payload.get('name')",
    b'        if not person_name:',
    b"            raise ValueError('Name is required for auto enrichment.')",
    b'',
    b"        api_key = os.environ.get('GEMINI_API_KEY', '')",
    b'',
    b"        env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')",
    b'        if os.path.exists(env_path):',
    b"            with open(env_path, encoding='utf-8') as ef:",
    b'                for line in ef:',
    b"                    if '=' in line and not line.strip().startswith('#'):",
    b"                        k, v = line.strip().split('=', 1)",
    b"                        if k.strip() == 'GEMINI_API_KEY':",
    b'                            api_key = v.strip()',
    b"                            os.environ['GEMINI_API_KEY'] = api_key",
    b'',
    b"        if not api_key or len(api_key) < 10:",
    b"            raise ValueError('GEMINI_API_KEY is not set properly.')",
    b'',
    b'        import google.generativeai as genai',
    b'        from duckduckgo_search import DDGS',
    b'        import requests as req_lib',
    b'        import re',
    b'',
    b'        ddgs = DDGS()',
    b'',
    b'        # Multiple targeted searches for better quality',
    b'        queries = [',
    b'            f"{person_name} \xe3\x83\x97\xe3\x83\xad\xe3\x83\x95\xe3\x82\xa3\xe3\x83\xbc\xe3\x83\xab \xe3\x82\xa4\xe3\x83\xb3\xe3\x83\x95\xe3\x83\xab\xe3\x82\xa8\xe3\x83\xb3\xe3\x82\xb5\xe3\x83\xbc \xe8\x8a\xb8\xe8\x83\xbd\xe4\xba\xba",',
    b'            f"{person_name} Instagram Twitter X YouTube TikTok SNS",',
    b'            f"{person_name} \xe4\xba\x8b\xe5\x8b\x99\xe6\x89\x80 \xe5\x87\xba\xe8\xba\xab\xe5\x9c\xb0 \xe5\xb9\xb4\xe9\xbd\xa2 \xe6\x80\xa7\xe5\x88\xa5",',
    b'        ]',
    b'        all_snippets = []',
    b'        top_urls = []',
    b'        for q in queries:',
    b'            try:',
    b'                results = list(ddgs.text(q, max_results=4))',
    b'                for r in results:',
    b'                    all_snippets.append(',
    b"                        f\"[Query: {q}]\\nTitle: {r['title']}\\nSnippet: {r['body']}\\nURL: {r['href']}\"",
    b'                    )',
    b"                    if r['href'] and r['href'] not in top_urls:",
    b"                        top_urls.append(r['href'])",
    b'            except Exception:',
    b'                pass',
    b'',
    b'        # Fetch actual page content for top 3 URLs',
    b'        fetched_pages = []',
    b"        fetch_headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}",
    b'        for url in top_urls[:3]:',
    b'            try:',
    b'                resp = req_lib.get(url, headers=fetch_headers, timeout=5, allow_redirects=True)',
    b'                if resp.status_code == 200:',
    b"                    text_content = re.sub(r'<[^>]+>', ' ', resp.text)",
    b"                    text_content = re.sub(r'\\s+', ' ', text_content).strip()[:3000]",
    b'                    fetched_pages.append(f"[Page: {url}]\\n{text_content}")',
    b'            except Exception:',
    b'                pass',
    b'',
    b'        context_text = "\\n\\n---\\n\\n".join(all_snippets)',
    b'        page_text = "\\n\\n---\\n\\n".join(fetched_pages) if fetched_pages else ""',
    b'',
    b'        # Image search',
    b'        try:',
    b'            image_results = list(ddgs.images(',
    b"                f\"{person_name} \xe3\x82\xa4\xe3\x83\xb3\xe3\x83\x95\xe3\x83\xab\xe3\x82\xa8\xe3\x83\xb3\xe3\x82\xb5\xe3\x83\xbc \xe9\xa1\x94 \xe3\x83\x97\xe3\x83\xad\xe3\x83\x95\xe3\x82\xa3\xe3\x83\xbc\xe3\x83\xab\xe5\x86\x99\xe7\x9c\x9f\", max_results=1))",
    b"            image_url = image_results[0]['image'] if image_results else ''",
    b'        except Exception:',
    b"            image_url = ''",
    b'',
    b'        # Gemini extraction with improved prompt',
    b'        genai.configure(api_key=api_key)',
    b"        model = genai.GenerativeModel('gemini-2.5-flash')",
    b'',
    b'        prompt = f"""' + 'You are a professional researcher specializing in Japanese influencers and talent profiles.'.encode('utf-8') + b"""
Based on the following search results and page content, extract accurate profile information for "{person_name}".

## Search Result Snippets
{context_text}

## Fetched Page Content
{page_text}

## Extraction Rules (strictly follow)
- SNS URLs: Copy the exact URL from the search results or page content.
  - Examples: "https://x.com/username", "https://twitter.com/username", "https://www.instagram.com/username/"
  - If URL is not found, use empty string ("")
- Genre: Choose the SINGLE best fitting genre from:
  \xe7\xbe\x8e\xe5\xae\xb9\xe3\x83\xbb\xe3\x82\xb3\xe3\x82\xb9\xe3\x83\xa1, \xe3\x83\x95\xe3\x82\xa1\xe3\x83\x83\xe3\x82\xb7\xe3\x83\xa7\xe3\x83\xb3, \xe3\x82\xb0\xe3\x83\xab\xe3\x83\xa1, \xe6\x97\x85\xe8\xa1\x8c, \xe3\x82\xb2\xe3\x83\xbc\xe3\x83\xa0, \xe3\x83\x95\xe3\x82\xa3\xe3\x83\x83\xe3\x83\x88\xe3\x83\x8d\xe3\x82\xb9, \xe6\x96\x99\xe7\x90\x86, \xe8\x82\xb2\xe5\x85\x90\xe3\x83\xbb\xe3\x83\xa9\xe3\x82\xa4\xe3\x83\x95\xe3\x82\xb9\xe3\x82\xbf\xe3\x82\xa4\xe3\x83\xab,
  \xe3\x82\xa8\xe3\x83\xb3\xe3\x82\xbf\xe3\x83\xa1\xe3\x83\xbb\xe3\x81\x8a\xe7\xac\x91\xe3\x81\x84, \xe3\x83\x93\xe3\x82\xb8\xe3\x83\x8d\xe3\x82\xb9\xe3\x83\xbb\xe6\x8a\x95\xe8\xb3\x87, \xe3\x82\xb9\xe3\x83\x9d\xe3\x83\xbc\xe3\x83\x84, \xe9\x9f\xb3\xe6\xa5\xbd, \xe3\x82\xa2\xe3\x83\xbc\xe3\x83\x88, \xe6\x95\x99\xe8\x82\xb2, \xe3\x83\x86\xe3\x82\xaf\xe3\x83\x8e\xe3\x83\xad\xe3\x82\xb8\xe3\x83\xbc
- Office/Agency: Use exact name. If freelance write "\xe7\x84\xa1". If unknown use ""
- Do NOT guess or invent any information. If unsure, use empty string ""

Reply ONLY with this JSON (no explanation, no markdown ``\x60):
{{
    "\xe3\x82\xb8\xe3\x83\xa3\xe3\x83\xb3\xe3\x83\xab": "",
    "X": "",
    "YouTube": "",
    "Instagram": "",
    "TikTok": "",
    "\xe4\xba\x8b\xe5\x8b\x99\xe6\x89\x80": "",
    "\xe5\xb1\x85\xe4\xbd\x8f\xe5\x9c\xb0": "",
    "\xe5\x87\xba\xe8\xba\xab": "",
    "\xe6\x80\xa7\xe5\x88\xa5": "",
    "\xe7\x94\xbb\xe5\x83\x8fURL": "{image_url}"
}}"""',
    b'',
    b'        response = model.generate_content(prompt)',
    b'        raw = response.text.strip()',
    b"        for prefix in ['```json', '```']:",
    b'            if raw.startswith(prefix):',
    b'                raw = raw[len(prefix):]',
    b"        if raw.endswith('```'):",
    b'            raw = raw[:-3]',
    b'',
    b'        data = json.loads(raw.strip())',
    b"        return JsonResponse({'success': True, 'data': data})",
    b'    except Exception as e:',
    b"        return JsonResponse({'success': False, 'message': str(e)})",
    b'',
]

# Write output
all_lines = clean + suffix_lines
with open(src, 'wb') as f:
    f.write(b'\r\n'.join(all_lines))

print(f"Done. Written {len(all_lines)} lines.")
