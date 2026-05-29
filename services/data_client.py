import gspread
from google.oauth2.service_account import Credentials
import streamlit as st
import os

# 定数定義 (Main.gsからの移植)
SPREADSHEET_ID = "14HAgG2wwQh54CiV0wONCjxI6VXA2Mt-tpmBv3YL_RUM"

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
        
        # 認証スコープ
        scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
        ]
        
        try:
            # カレントディレクトリの service_account.json を探す
            cred_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'service_account.json')
            if os.path.exists(cred_path):
                credentials = Credentials.from_service_account_file(cred_path, scopes=scopes)
                self.client = gspread.authorize(credentials)
                self.spreadsheet = self.client.open_by_key(SPREADSHEET_ID)
            else:
                st.error("⚠️ `service_account.json` が見つかりません。GCPからダウンロードしてプロジェクト直下に配置してください。")
        except Exception as e:
            st.error(f"⚠️ スプレッドシートへの接続に失敗しました: {e}")

    def get_sheet(self, sheet_name):
        if not self.spreadsheet:
            return None
        try:
            return self.spreadsheet.worksheet(sheet_name)
        except gspread.exceptions.WorksheetNotFound:
            st.error(f"⚠️ シート '{sheet_name}' が見つかりません。")
            return None

    def get_all_records(self, sheet_name):
        sheet = self.get_sheet(sheet_name)
        if sheet:
            # 1行目をヘッダとしてdictのリストを返す
            return sheet.get_all_records()
        return []

    def update_cell(self, sheet_name, row, col, value):
        sheet = self.get_sheet(sheet_name)
        if sheet:
            sheet.update_cell(row, col, value)
            
    def append_row(self, sheet_name, values):
        sheet = self.get_sheet(sheet_name)
        if sheet:
            sheet.append_row(values)

# シングルトンインスタンスを取得するヘルパー関数
def get_data_client():
    return DataClient()
