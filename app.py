import streamlit as st
from views.search_view import render_search_view
from views.deals_view import render_deals_view
from views.admin_view import render_admin_view

# ページ基本設定
st.set_page_config(
    page_title="タレント・インフルエンサー CRM",
    page_icon="💼",
    layout="wide",
    initial_sidebar_state="expanded"
)

# カスタムCSSの読み込み (簡易的)
st.markdown("""
    <style>
    .stApp {
        background-color: #f8f9fa;
    }
    .css-1d391kg {
        background-color: #ffffff;
    }
    /* 追加のスタイリングがあればここに記述 */
    </style>
""", unsafe_allow_html=True)

def main():
    st.sidebar.title("💼 Groove CRM")
    st.sidebar.markdown("---")
    
    # ナビゲーション
    pages = {
        "🔍 人物検索": render_search_view,
        "💼 案件管理": render_deals_view,
        "⚙️ 管理画面": render_admin_view
    }
    
    selection = st.sidebar.radio("メニュー", list(pages.keys()))
    
    st.sidebar.markdown("---")
    st.sidebar.info("データの読み書きにはGoogle スプレッドシートを使用しています。")
    
    # 選択されたページをレンダリング
    page_function = pages[selection]
    page_function()

if __name__ == "__main__":
    main()
