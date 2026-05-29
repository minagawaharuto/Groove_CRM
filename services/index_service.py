import pandas as pd
from services.data_client import get_data_client
import streamlit as st

class IndexService:
    def __init__(self):
        self.client = get_data_client()
        self.index_sheet_name = "90_Index"

    @st.cache_data(ttl=600)  # 10分間キャッシュ
    def get_index_data(_self):
        """90_Indexシートの全データを取得してPandas DataFrameにする"""
        records = _self.client.get_all_records(_self.index_sheet_name)
        if not records:
            return pd.DataFrame()
        return pd.DataFrame(records)

    def search(self, keyword="", category="", status="", followers_min=None, followers_max=None):
        """インデックスデータを検索して結果のDataFrameを返す"""
        df = self.get_index_data()
        if df.empty:
            return df
            
        # フリーワード検索 (スペース区切りAND)
        if keyword:
            keywords = keyword.split()
            for kw in keywords:
                # _search_text列が存在する場合はそこを見るが、なければ全列結合して検索
                if '_search_text' in df.columns:
                    df = df[df['_search_text'].str.contains(kw, case=False, na=False)]
                else:
                    # 全文字列カラムを結合して検索する簡易実装
                    mask = df.apply(lambda row: row.astype(str).str.contains(kw, case=False).any(), axis=1)
                    df = df[mask]
                    
        # 区分フィルタ
        if category and category != "すべて":
            df = df[df['区分'] == category]
            
        # ステータスフィルタ
        if status and status != "すべて":
            df = df[df['ステータス'] == status]
            
        # フォロワー数フィルタ
        if 'フォロワー数' in df.columns:
            # 数値変換 (カンマ除去など)
            df['フォロワー数_num'] = pd.to_numeric(df['フォロワー数'].astype(str).str.replace(',', ''), errors='coerce').fillna(0)
            if followers_min is not None:
                df = df[df['フォロワー数_num'] >= followers_min]
            if followers_max is not None:
                df = df[df['フォロワー数_num'] <= followers_max]
                
        # 表示用カラムのみ返す (_search_text などのシステム列を除外)
        display_cols = [c for c in df.columns if not c.startswith('_') and c != 'フォロワー数_num']
        return df[display_cols]
