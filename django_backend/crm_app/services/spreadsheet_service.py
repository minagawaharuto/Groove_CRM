import gspread
from google.oauth2.service_account import Credentials
import os
import logging
from datetime import datetime
import string
import random

logger = logging.getLogger(__name__)

SPREADSHEET_ID = "14HAgG2wwQh54CiV0wONCjxI6VXA2Mt-tpmBv3YL_RUM"

SHEET = {
    'MODEL': "モデル",
    'INFLUENCER': "インフルエンサー",
    'SPORTS': "スポーツ選手・著名人",
    'INDEX': "90_Index",
    'DEALS': "10_Deals",
    'DEAL_CASTING': "11_DealCasting",
    'ACTIVITY_LOG': "20_ActivityLog",
    'CONFIG': "99_Config",
}

PERSON_SHEETS = [SHEET['MODEL'], SHEET['INFLUENCER'], SHEET['SPORTS']]

PERSON_EXTRA_COL = {
    'PERSON_ID': 16, # 17列目 (0-indexed)
    'STATUS': 49,
    'LAST_CONTACT': 51,
    'NEXT_ACTION_DATE': 52,
    'NEXT_ACTION': 53,
    'PRIORITY': 54,
    'OWNER': 28,
    'MEMO': 59,
}

PERSON_COL_MAP = {
    'person_id': 16,
    'ステータス': 49,
    '最終接触日': 51,
    '次アクション日': 52,
    '次アクション内容': 53,
    '優先度': 54,
    '社内担当': 28,
    'メモ': 59,
}

INDEX_TO_PERSON_COL = {
    'person_id': 16,
    '名前': 2,
    'ユーザー名': 1,
    'URL': 8,
    'フォロワー数': 0,
    'ギャラ目安': 36,
    '所在地': 6,
    'サブカテゴリ': 26,
    'タグ': 27,
    'ステータス': 49,
    '最終接触日': 51,
    '次アクション日': 52,
    '優先度': 54,
    '担当（社内）': 28,
}

def generate_id(prefix=""):
    # Generate timestamp base36 like and random part
    ts = '' # Simplified for now
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=6))
    return f"{prefix}{int(datetime.now().timestamp())}{rand}"

class DataClient:
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DataClient, cls).__new__(cls)
            cls._instance._initialize()
        return cls._instance

    def _initialize(self):
        self.client = None
        self.spreadsheet = None
        
        scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
        ]
        
        try:
            cred_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), 'service_account.json')
            if os.path.exists(cred_path):
                credentials = Credentials.from_service_account_file(cred_path, scopes=scopes)
                self.client = gspread.authorize(credentials)
                self.spreadsheet = self.client.open_by_key(SPREADSHEET_ID)
            else:
                logger.error(f"service_account.json not found at {cred_path}")
        except Exception as e:
            logger.error(f"Failed to connect to spreadsheet: {e}")

    def get_sheet(self, sheet_name):
        if not self.spreadsheet:
            return None
        try:
            return self.spreadsheet.worksheet(sheet_name)
        except gspread.exceptions.WorksheetNotFound:
            logger.error(f"Sheet '{sheet_name}' not found.")
            return None

    def get_all_records(self, sheet_name):
        sheet = self.get_sheet(sheet_name)
        if not sheet:
            return []
        values = sheet.get_all_values()
        if len(values) < 2:
            return []
        headers = values[0]
        records = []
        for i in range(1, len(values)):
            row = values[i]
            obj = {}
            for j in range(len(headers)):
                key = str(headers[j]).strip()
                # Ignore duplicate headers that cause issues or rename them
                if key and key not in obj:
                    obj[key] = row[j] if j < len(row) else ''
            records.append(obj)
        return records

    def get_all_values(self, sheet_name):
        sheet = self.get_sheet(sheet_name)
        if sheet:
            return sheet.get_all_values()
        return []

    def append_row(self, sheet_name, row_values):
        sheet = self.get_sheet(sheet_name)
        if sheet:
            sheet.append_row(row_values)

    def update_cell(self, sheet_name, row, col, value):
        sheet = self.get_sheet(sheet_name)
        if sheet:
            sheet.update_cell(row, col, value)

    def get_next_id(self, sheet_name, col_index):
        values = self.get_all_values(sheet_name)
        if not values or len(values) < 2:
            return 1
        max_id = 0
        for i in range(1, len(values)):
            try:
                val = int(values[i][col_index])
                if val > max_id:
                    max_id = val
            except ValueError:
                pass
        return max_id + 1

    def find_person_row(self, person_id):
        for sheet_name in PERSON_SHEETS:
            values = self.get_all_values(sheet_name)
            if not values or len(values) < 2:
                continue
            headers = values[0]
            
            # person_id col logic
            person_id_col_idx = PERSON_EXTRA_COL['PERSON_ID']
            for hp, header in enumerate(headers):
                if str(header).strip() == 'person_id':
                    person_id_col_idx = hp
                    break
            
            for i in range(1, len(values)):
                row = values[i]
                if person_id_col_idx < len(row):
                    cell_id = str(row[person_id_col_idx]).strip()
                    if cell_id == str(person_id).strip():
                        return {
                            'sheetName': sheet_name,
                            'rowIndex': i + 1, # 1-indexed for gspread
                            'rowData': row,
                            'headers': headers
                        }
        return None

def get_data_client():
    return DataClient()
