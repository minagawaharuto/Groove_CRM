import streamlit as st
from services.index_service import IndexService

def render_search_view():
    st.title("🔍 人物検索")
    st.write("検索条件を指定してインデックスから人物を検索します。")
    
    # 検索フォーム
    with st.form("search_form"):
        col1, col2, col3 = st.columns([2, 1, 1])
        with col1:
            keyword = st.text_input("フリーワード（名前 / ユーザー名 / タグ）")
        with col2:
            category = st.selectbox("区分", ["すべて", "モデル", "インフルエンサー", "スポーツ選手・著名人"])
        with col3:
            status = st.selectbox("ステータス", ["すべて", "未着手", "アプローチ中", "交渉中", "契約済", "NG"])
            
        submitted = st.form_submit_button("検索")
        
    # 初回表示または検索ボタン押下時に検索を実行
    index_service = IndexService()
    
    with st.spinner("検索中..."):
        # 初期状態では全件表示（空文字で検索）するか、ボタンが押された条件で検索
        df = index_service.search(
            keyword=keyword if submitted else "",
            category=category if submitted else "すべて",
            status=status if submitted else "すべて"
        )
        
    if df.empty:
        st.info("検索結果がありません。または、スプレッドシートへの接続が設定されていません。")
    else:
        st.success(f"{len(df)} 件見つかりました。")
        st.dataframe(df, use_container_width=True)
