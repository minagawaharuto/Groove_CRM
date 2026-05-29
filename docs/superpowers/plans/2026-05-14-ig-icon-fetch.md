# IGアイコン自動取得スクリプト 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instaloaderでシートの人物名/ユーザー名からInstagramプロフィール画像を取得し、Google DriveにアップロードしてシートのIGアイコン列にIMAGE()数式を書き込む

**Architecture:** `fetch_ig_icons.py` に `SpreadsheetClient`, `InstagramFetcher`, `DriveUploader`, `main()` を実装。既存の `service_account.json` で認証し、3シート（モデル/インフルエンサー/スポーツ選手・著名人）をループ処理する。

**Tech Stack:** Python, instaloader, gspread, google-api-python-client, pytest

---

## ファイル構成

| ファイル | 役割 |
|----------|------|
| `fetch_ig_icons.py` | メインスクリプト（全クラス・main()） |
| `tests/test_fetch_ig_icons.py` | ユニットテスト |
| `requirements.txt` | 依存パッケージ追加 |

---

## Task 1: 依存パッケージのインストール

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: requirements.txt に追加**

```
streamlit==1.32.0
pandas==2.2.1
gspread==6.0.0
google-auth==2.28.1
Django>=5.0.0
beautifulsoup4>=4.12.0
lxml>=5.0.0
instaloader>=4.10
google-api-python-client>=2.100.0
python-dotenv>=1.0.0
pytest>=8.0.0
```

- [ ] **Step 2: インストール**

```bash
pip install instaloader google-api-python-client python-dotenv pytest
```

期待出力: `Successfully installed ...`

- [ ] **Step 3: インストール確認**

```bash
python -c "import instaloader; import googleapiclient; print('OK')"
```

期待出力: `OK`

- [ ] **Step 4: コミット**

```bash
git add requirements.txt
git commit -m "依存パッケージにinstaloader, google-api-python-client, dotenvを追加"
```

---

## Task 2: SpreadsheetClient の実装

**Files:**
- Create: `fetch_ig_icons.py`
- Create: `tests/test_fetch_ig_icons.py`

### 目的
gspread経由でシートを読み書きし、「IGアイコン」列を自動検出（なければ追加）する。

- [ ] **Step 1: テストファイルを作成し、失敗するテストを書く**

`tests/test_fetch_ig_icons.py`:
```python
from unittest.mock import MagicMock, patch
import pytest


def make_mock_spreadsheet(headers, rows):
    """gspreadのSpreadsheetモックを生成するヘルパー"""
    mock_sheet = MagicMock()
    mock_sheet.row_values.return_value = headers
    mock_sheet.get_all_values.return_value = [headers] + rows
    mock_spreadsheet = MagicMock()
    mock_spreadsheet.worksheet.return_value = mock_sheet
    return mock_spreadsheet, mock_sheet


class TestSpreadsheetClient:

    @patch("fetch_ig_icons.gspread.authorize")
    @patch("fetch_ig_icons.Credentials.from_service_account_file")
    def test_get_icon_col_existing(self, mock_creds, mock_authorize):
        """IGアイコン列がすでにある場合、その1-based列番号を返す"""
        from fetch_ig_icons import SpreadsheetClient
        mock_spreadsheet, mock_sheet = make_mock_spreadsheet(
            ["フォロワー数", "ユーザー名", "名前", "IGアイコン"], []
        )
        mock_authorize.return_value.open_by_key.return_value = mock_spreadsheet

        client = SpreadsheetClient("dummy.json", "SHEET_ID")
        col = client.get_or_create_icon_column("モデル")

        assert col == 4  # 0-indexed=3 → 1-based=4
        mock_sheet.update_cell.assert_not_called()

    @patch("fetch_ig_icons.gspread.authorize")
    @patch("fetch_ig_icons.Credentials.from_service_account_file")
    def test_get_icon_col_creates_if_missing(self, mock_creds, mock_authorize):
        """IGアイコン列がない場合、末尾に追加して1-based列番号を返す"""
        from fetch_ig_icons import SpreadsheetClient
        mock_spreadsheet, mock_sheet = make_mock_spreadsheet(
            ["フォロワー数", "ユーザー名", "名前"], []
        )
        mock_authorize.return_value.open_by_key.return_value = mock_spreadsheet

        client = SpreadsheetClient("dummy.json", "SHEET_ID")
        col = client.get_or_create_icon_column("モデル")

        assert col == 4
        mock_sheet.update_cell.assert_called_once_with(1, 4, "IGアイコン")

    @patch("fetch_ig_icons.gspread.authorize")
    @patch("fetch_ig_icons.Credentials.from_service_account_file")
    def test_get_all_values_returns_rows(self, mock_creds, mock_authorize):
        """get_all_values がヘッダ含む全行を返す"""
        from fetch_ig_icons import SpreadsheetClient
        mock_spreadsheet, mock_sheet = make_mock_spreadsheet(
            ["フォロワー数", "ユーザー名", "名前"],
            [["1000", "tanaka_ig", "田中花子"]]
        )
        mock_authorize.return_value.open_by_key.return_value = mock_spreadsheet

        client = SpreadsheetClient("dummy.json", "SHEET_ID")
        values = client.get_all_values("モデル")

        assert values[0] == ["フォロワー数", "ユーザー名", "名前"]
        assert values[1] == ["1000", "tanaka_ig", "田中花子"]
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pytest tests/test_fetch_ig_icons.py -v 2>&1 | head -20
```

期待出力: `ModuleNotFoundError: No module named 'fetch_ig_icons'`

- [ ] **Step 3: SpreadsheetClient を実装**

`fetch_ig_icons.py`:
```python
import os
import glob
import time
import logging
import shutil
from dotenv import load_dotenv

import gspread
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
import instaloader

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

SPREADSHEET_ID = "14HAgG2wwQh54CiV0wONCjxI6VXA2Mt-tpmBv3YL_RUM"
PERSON_SHEETS = ["モデル", "インフルエンサー", "スポーツ選手・著名人"]
USERNAME_COL = 1   # 0-based
NAME_COL = 2       # 0-based
SLEEP_SEC = 2


class SpreadsheetClient:
    def __init__(self, cred_path: str, spreadsheet_id: str):
        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ]
        credentials = Credentials.from_service_account_file(cred_path, scopes=scopes)
        client = gspread.authorize(credentials)
        self.spreadsheet = client.open_by_key(spreadsheet_id)

    def get_or_create_icon_column(self, sheet_name: str) -> int:
        """「IGアイコン」列の1-based列番号を返す。なければ末尾に追加する。"""
        sheet = self.spreadsheet.worksheet(sheet_name)
        headers = sheet.row_values(1)
        if "IGアイコン" in headers:
            return headers.index("IGアイコン") + 1
        col = len(headers) + 1
        sheet.update_cell(1, col, "IGアイコン")
        return col

    def get_all_values(self, sheet_name: str) -> list[list[str]]:
        """ヘッダ行を含む全行をリストのリストで返す。"""
        sheet = self.spreadsheet.worksheet(sheet_name)
        return sheet.get_all_values()

    def update_icon_cell(self, sheet_name: str, row: int, col: int, formula: str):
        """指定セルにIMAGE()数式を書き込む。row/colは1-based。"""
        sheet = self.spreadsheet.worksheet(sheet_name)
        sheet.update_cell(row, col, formula)
```

- [ ] **Step 4: SpreadsheetClientのテストが通ることを確認**

```bash
pytest tests/test_fetch_ig_icons.py::TestSpreadsheetClient -v
```

期待出力:
```
tests/test_fetch_ig_icons.py::TestSpreadsheetClient::test_get_icon_col_existing PASSED
tests/test_fetch_ig_icons.py::TestSpreadsheetClient::test_get_icon_col_creates_if_missing PASSED
tests/test_fetch_ig_icons.py::TestSpreadsheetClient::test_get_all_values_returns_rows PASSED
```

- [ ] **Step 5: コミット**

```bash
git add fetch_ig_icons.py tests/test_fetch_ig_icons.py requirements.txt
git commit -m "SpreadsheetClientを実装・テスト追加"
```

---

## Task 3: InstagramFetcher の実装

**Files:**
- Modify: `fetch_ig_icons.py`
- Modify: `tests/test_fetch_ig_icons.py`

### 目的
Instaloaderを使ってユーザー名または人物名からプロフィール画像をダウンロードする。

- [ ] **Step 1: テストを追加（失敗する）**

まず `tests/test_fetch_ig_icons.py` の先頭インポートに `import instaloader` を追加:
```python
from unittest.mock import MagicMock, patch
import pytest
import instaloader
```

次に末尾に追加:
```python
class TestInstagramFetcher:

    @patch("fetch_ig_icons.instaloader.Profile.from_username")
    def test_get_profile_pic_by_username_success(self, mock_from_username, tmp_path):
        """ユーザー名から画像を取得し、ファイルパスを返す"""
        from fetch_ig_icons import InstagramFetcher

        # ダミープロフィール
        mock_profile = MagicMock()
        mock_profile.profile_pic_url = "https://example.com/pic.jpg"
        mock_from_username.return_value = mock_profile

        fetcher = InstagramFetcher(temp_dir=str(tmp_path))

        # ダウンロード処理をモック（実際のHTTP通信をスキップ）
        dummy_file = tmp_path / "testuser_20260514.jpg"
        dummy_file.write_bytes(b"fake_image_data")

        with patch.object(fetcher.L, "download_profilepic"):
            with patch("fetch_ig_icons.glob.glob", return_value=[str(dummy_file)]):
                path = fetcher.get_profile_pic_path("testuser")

        assert path == str(dummy_file)

    @patch("fetch_ig_icons.instaloader.Profile.from_username")
    def test_get_profile_pic_by_username_not_found(self, mock_from_username, tmp_path):
        """プロフィールが見つからない場合はNoneを返す"""
        from fetch_ig_icons import InstagramFetcher
        mock_from_username.side_effect = instaloader.exceptions.ProfileNotExistsException

        fetcher = InstagramFetcher(temp_dir=str(tmp_path))
        path = fetcher.get_profile_pic_path("nonexistent_user")

        assert path is None

    @patch("fetch_ig_icons.instaloader.TopSearchResults")
    def test_search_returns_first_hit(self, mock_search, tmp_path):
        """名前検索で最初のヒットのユーザー名とパスを返す"""
        from fetch_ig_icons import InstagramFetcher

        mock_result = MagicMock()
        mock_result.username = "tanaka_hanako"
        mock_search.return_value.__iter__ = MagicMock(return_value=iter([mock_result]))

        fetcher = InstagramFetcher(temp_dir=str(tmp_path))
        dummy_file = tmp_path / "tanaka_hanako_20260514.jpg"
        dummy_file.write_bytes(b"fake")

        with patch.object(fetcher, "get_profile_pic_path", return_value=str(dummy_file)):
            path, username = fetcher.search_and_get_profile_pic("田中花子")

        assert username == "tanaka_hanako"
        assert path == str(dummy_file)

    @patch("fetch_ig_icons.instaloader.TopSearchResults")
    def test_search_no_results(self, mock_search, tmp_path):
        """検索結果がない場合は (None, None) を返す"""
        from fetch_ig_icons import InstagramFetcher
        mock_search.return_value.__iter__ = MagicMock(return_value=iter([]))

        fetcher = InstagramFetcher(temp_dir=str(tmp_path))
        path, username = fetcher.search_and_get_profile_pic("存在しない人物")

        assert path is None
        assert username is None
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pytest tests/test_fetch_ig_icons.py::TestInstagramFetcher -v 2>&1 | head -20
```

期待出力: `AttributeError: module 'fetch_ig_icons' has no attribute 'InstagramFetcher'`

- [ ] **Step 3: InstagramFetcher を fetch_ig_icons.py に追加**

`SpreadsheetClient` クラスの後ろに追加:
```python
class InstagramFetcher:
    def __init__(
        self,
        temp_dir: str = "temp_icons",
        ig_username: str = None,
        ig_password: str = None,
    ):
        self.temp_dir = temp_dir
        os.makedirs(temp_dir, exist_ok=True)
        self.L = instaloader.Instaloader(
            dirname_pattern=temp_dir,
            filename_pattern="{profile}_{date_utc}",
            download_pictures=True,
            download_videos=False,
            download_comments=False,
            save_metadata=False,
        )
        if ig_username and ig_password:
            self.L.login(ig_username, ig_password)

    def get_profile_pic_path(self, username: str) -> str | None:
        """ユーザー名でプロフィール画像をダウンロードし、ローカルパスを返す。失敗時はNone。"""
        try:
            profile = instaloader.Profile.from_username(self.L.context, username)
            self.L.download_profilepic(profile)
            files = glob.glob(os.path.join(self.temp_dir, f"{username}*.jpg"))
            if not files:
                logging.warning(f"[IG] {username}: 画像ファイルが見つかりません")
                return None
            return sorted(files)[-1]  # 最新ファイルを返す
        except Exception as e:
            logging.warning(f"[IG] {username}: {e}")
            return None

    def search_and_get_profile_pic(self, name: str) -> tuple[str | None, str | None]:
        """人物名でInstagramを検索し、最初のヒットの画像パスとユーザー名を返す。"""
        try:
            results = list(instaloader.TopSearchResults(self.L.context, name))
            if not results:
                logging.warning(f"[IG] '{name}': 検索結果なし")
                return None, None
            username = results[0].username
            path = self.get_profile_pic_path(username)
            return path, username
        except Exception as e:
            logging.warning(f"[IG] '{name}' 検索エラー: {e}")
            return None, None
```

- [ ] **Step 4: テストが通ることを確認**

```bash
pytest tests/test_fetch_ig_icons.py::TestInstagramFetcher -v
```

期待出力:
```
tests/test_fetch_ig_icons.py::TestInstagramFetcher::test_get_profile_pic_by_username_success PASSED
tests/test_fetch_ig_icons.py::TestInstagramFetcher::test_get_profile_pic_by_username_not_found PASSED
tests/test_fetch_ig_icons.py::TestInstagramFetcher::test_search_returns_first_hit PASSED
tests/test_fetch_ig_icons.py::TestInstagramFetcher::test_search_no_results PASSED
```

- [ ] **Step 5: コミット**

```bash
git add fetch_ig_icons.py tests/test_fetch_ig_icons.py
git commit -m "InstagramFetcherを実装・テスト追加"
```

---

## Task 4: DriveUploader の実装

**Files:**
- Modify: `fetch_ig_icons.py`
- Modify: `tests/test_fetch_ig_icons.py`

### 目的
Google Driveに画像をアップロードし、一般公開URLを生成する。

- [ ] **Step 1: テストを追加（失敗する）**

`tests/test_fetch_ig_icons.py` の末尾に追加:
```python
class TestDriveUploader:

    @patch("fetch_ig_icons.Credentials.from_service_account_file")
    @patch("fetch_ig_icons.build")
    def test_upload_and_get_url_success(self, mock_build, mock_creds, tmp_path):
        """アップロード成功時に公開URLを返す"""
        from fetch_ig_icons import DriveUploader

        mock_service = MagicMock()
        mock_build.return_value = mock_service
        mock_service.files().create().execute.return_value = {"id": "abc123"}
        mock_service.permissions().create().execute.return_value = {}

        dummy_file = tmp_path / "test.jpg"
        dummy_file.write_bytes(b"fake_image")

        uploader = DriveUploader("dummy.json")
        url = uploader.upload_and_get_url(str(dummy_file), "test.jpg")

        assert url == "https://drive.google.com/uc?id=abc123"
        mock_service.permissions().create.assert_called_once_with(
            fileId="abc123",
            body={"type": "anyone", "role": "reader"},
        )

    @patch("fetch_ig_icons.Credentials.from_service_account_file")
    @patch("fetch_ig_icons.build")
    def test_upload_failure_returns_none(self, mock_build, mock_creds, tmp_path):
        """アップロード失敗時はNoneを返す"""
        from fetch_ig_icons import DriveUploader

        mock_service = MagicMock()
        mock_build.return_value = mock_service
        mock_service.files().create().execute.side_effect = Exception("API error")

        dummy_file = tmp_path / "test.jpg"
        dummy_file.write_bytes(b"fake_image")

        uploader = DriveUploader("dummy.json")
        url = uploader.upload_and_get_url(str(dummy_file), "test.jpg")

        assert url is None
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pytest tests/test_fetch_ig_icons.py::TestDriveUploader -v 2>&1 | head -10
```

期待出力: `AttributeError: module 'fetch_ig_icons' has no attribute 'DriveUploader'`

- [ ] **Step 3: DriveUploader を fetch_ig_icons.py に追加**

`InstagramFetcher` クラスの後ろに追加:
```python
class DriveUploader:
    def __init__(self, cred_path: str):
        scopes = ["https://www.googleapis.com/auth/drive"]
        credentials = Credentials.from_service_account_file(cred_path, scopes=scopes)
        self.service = build("drive", "v3", credentials=credentials)

    def upload_and_get_url(self, file_path: str, file_name: str) -> str | None:
        """ファイルをアップロードして一般公開し、表示用URLを返す。失敗時はNone。"""
        try:
            file_metadata = {"name": file_name}
            media = MediaFileUpload(file_path, mimetype="image/jpeg")
            file = (
                self.service.files()
                .create(body=file_metadata, media_body=media, fields="id")
                .execute()
            )
            file_id = file.get("id")
            self.service.permissions().create(
                fileId=file_id,
                body={"type": "anyone", "role": "reader"},
            ).execute()
            return f"https://drive.google.com/uc?id={file_id}"
        except Exception as e:
            logging.warning(f"[Drive] アップロード失敗: {e}")
            return None
```

- [ ] **Step 4: テストが通ることを確認**

```bash
pytest tests/test_fetch_ig_icons.py::TestDriveUploader -v
```

期待出力:
```
tests/test_fetch_ig_icons.py::TestDriveUploader::test_upload_and_get_url_success PASSED
tests/test_fetch_ig_icons.py::TestDriveUploader::test_upload_failure_returns_none PASSED
```

- [ ] **Step 5: コミット**

```bash
git add fetch_ig_icons.py tests/test_fetch_ig_icons.py
git commit -m "DriveUploaderを実装・テスト追加"
```

---

## Task 5: main() の実装

**Files:**
- Modify: `fetch_ig_icons.py`
- Modify: `tests/test_fetch_ig_icons.py`

### 目的
3シートをループし、各行の処理を調整する。

- [ ] **Step 1: テストを追加（失敗する）**

`tests/test_fetch_ig_icons.py` の末尾に追加:
```python
class TestMain:

    def test_skips_row_with_existing_icon(self):
        """IGアイコン列にすでに値がある行はスキップする"""
        from fetch_ig_icons import process_row

        mock_sheet_client = MagicMock()
        mock_ig = MagicMock()
        mock_drive = MagicMock()

        # IGアイコン列（index=3）にすでに値がある
        row = ["1000", "tanaka_ig", "田中花子", '=IMAGE("https://...")', ""]
        process_row(
            sheet_name="モデル",
            row=row,
            row_index=2,
            icon_col=4,  # 1-based
            sheet_client=mock_sheet_client,
            ig_fetcher=mock_ig,
            drive_uploader=mock_drive,
        )

        mock_ig.get_profile_pic_path.assert_not_called()
        mock_drive.upload_and_get_url.assert_not_called()
        mock_sheet_client.update_icon_cell.assert_not_called()

    def test_uses_username_col_when_available(self):
        """ユーザー名列に値があればget_profile_pic_pathを使う"""
        from fetch_ig_icons import process_row

        mock_sheet_client = MagicMock()
        mock_ig = MagicMock()
        mock_ig.get_profile_pic_path.return_value = "/tmp/tanaka.jpg"
        mock_drive = MagicMock()
        mock_drive.upload_and_get_url.return_value = "https://drive.google.com/uc?id=xyz"

        row = ["1000", "tanaka_ig", "田中花子", "", ""]
        process_row(
            sheet_name="モデル",
            row=row,
            row_index=2,
            icon_col=4,
            sheet_client=mock_sheet_client,
            ig_fetcher=mock_ig,
            drive_uploader=mock_drive,
        )

        mock_ig.get_profile_pic_path.assert_called_once_with("tanaka_ig")
        mock_ig.search_and_get_profile_pic.assert_not_called()
        mock_sheet_client.update_icon_cell.assert_called_once_with(
            "モデル", 2, 4, '=IMAGE("https://drive.google.com/uc?id=xyz")'
        )

    def test_falls_back_to_name_search_when_no_username(self):
        """ユーザー名列が空のとき名前で検索する"""
        from fetch_ig_icons import process_row

        mock_sheet_client = MagicMock()
        mock_ig = MagicMock()
        mock_ig.search_and_get_profile_pic.return_value = ("/tmp/sato.jpg", "sato_ig")
        mock_drive = MagicMock()
        mock_drive.upload_and_get_url.return_value = "https://drive.google.com/uc?id=abc"

        row = ["500", "", "佐藤次郎", "", ""]
        process_row(
            sheet_name="インフルエンサー",
            row=row,
            row_index=3,
            icon_col=4,
            sheet_client=mock_sheet_client,
            ig_fetcher=mock_ig,
            drive_uploader=mock_drive,
        )

        mock_ig.search_and_get_profile_pic.assert_called_once_with("佐藤次郎")
        mock_sheet_client.update_icon_cell.assert_called_once_with(
            "インフルエンサー", 3, 4, '=IMAGE("https://drive.google.com/uc?id=abc")'
        )

    def test_skips_when_both_name_and_username_empty(self):
        """名前・ユーザー名がともに空の行はスキップする"""
        from fetch_ig_icons import process_row

        mock_sheet_client = MagicMock()
        mock_ig = MagicMock()
        mock_drive = MagicMock()

        row = ["", "", "", "", ""]
        process_row(
            sheet_name="モデル",
            row=row,
            row_index=5,
            icon_col=4,
            sheet_client=mock_sheet_client,
            ig_fetcher=mock_ig,
            drive_uploader=mock_drive,
        )

        mock_ig.get_profile_pic_path.assert_not_called()
        mock_ig.search_and_get_profile_pic.assert_not_called()
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
pytest tests/test_fetch_ig_icons.py::TestMain -v 2>&1 | head -10
```

期待出力: `ImportError: cannot import name 'process_row' from 'fetch_ig_icons'`

- [ ] **Step 3: process_row() と main() を fetch_ig_icons.py に追加**

ファイル末尾に追加:
```python
def process_row(
    sheet_name: str,
    row: list[str],
    row_index: int,
    icon_col: int,
    sheet_client: SpreadsheetClient,
    ig_fetcher: InstagramFetcher,
    drive_uploader: DriveUploader,
):
    """1行分のIGアイコン取得・書き込み処理。icon_colは1-based。"""
    icon_col_0 = icon_col - 1  # 0-based

    # スキップ条件: IGアイコン列に値あり
    if icon_col_0 < len(row) and str(row[icon_col_0]).strip():
        logging.info(f"[SKIP] row={row_index}: IGアイコン列に値あり")
        return

    username = str(row[USERNAME_COL]).strip() if USERNAME_COL < len(row) else ""
    name = str(row[NAME_COL]).strip() if NAME_COL < len(row) else ""

    # スキップ条件: 名前もユーザー名も空
    if not username and not name:
        logging.info(f"[SKIP] row={row_index}: 名前・ユーザー名が空")
        return

    # プロフィール画像を取得
    if username:
        pic_path = ig_fetcher.get_profile_pic_path(username)
    else:
        pic_path, username = ig_fetcher.search_and_get_profile_pic(name)

    if not pic_path:
        logging.warning(f"[SKIP] row={row_index} ({name or username}): 画像取得失敗")
        return

    # Google Driveにアップロード
    file_name = f"ig_icon_{username or name}_{row_index}.jpg"
    url = drive_uploader.upload_and_get_url(pic_path, file_name)

    if not url:
        logging.warning(f"[SKIP] row={row_index} ({name or username}): Driveアップロード失敗")
        return

    # シートに書き込み
    formula = f'=IMAGE("{url}")'
    try:
        sheet_client.update_icon_cell(sheet_name, row_index, icon_col, formula)
        logging.info(f"[OK] row={row_index} ({name or username}): {url}")
    except Exception as e:
        logging.error(f"[ERR] row={row_index}: シート書き込み失敗: {e}")


def main():
    cred_path = os.path.join(os.path.dirname(__file__), "service_account.json")
    ig_username = os.getenv("IG_USERNAME")
    ig_password = os.getenv("IG_PASSWORD")

    sheet_client = SpreadsheetClient(cred_path, SPREADSHEET_ID)
    ig_fetcher = InstagramFetcher(
        temp_dir="temp_icons",
        ig_username=ig_username,
        ig_password=ig_password,
    )
    drive_uploader = DriveUploader(cred_path)

    for sheet_name in PERSON_SHEETS:
        logging.info(f"=== シート処理開始: {sheet_name} ===")
        icon_col = sheet_client.get_or_create_icon_column(sheet_name)
        rows = sheet_client.get_all_values(sheet_name)

        for i, row in enumerate(rows):
            if i == 0:
                continue  # ヘッダ行スキップ
            row_index = i + 1  # 1-based
            process_row(
                sheet_name=sheet_name,
                row=row,
                row_index=row_index,
                icon_col=icon_col,
                sheet_client=sheet_client,
                ig_fetcher=ig_fetcher,
                drive_uploader=drive_uploader,
            )
            time.sleep(SLEEP_SEC)

    # temp_icons を削除
    if os.path.exists("temp_icons"):
        shutil.rmtree("temp_icons")
        logging.info("[完了] temp_icons を削除しました")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: 全テストが通ることを確認**

```bash
pytest tests/test_fetch_ig_icons.py -v
```

期待出力: 全テスト PASSED

- [ ] **Step 5: コミット**

```bash
git add fetch_ig_icons.py tests/test_fetch_ig_icons.py
git commit -m "process_row/main()を実装・テスト追加"
```

---

## Task 6: 動作確認とドキュメント

**Files:**
- Modify: `fetch_ig_icons.py`（必要なら修正）

- [ ] **Step 1: 全テストを一括実行**

```bash
pytest tests/test_fetch_ig_icons.py -v
```

期待出力: 全テスト PASSED、FAILEDなし

- [ ] **Step 2: （任意）Instagramアカウントを使う場合は .env を作成**

`.env`:
```
IG_USERNAME=your_instagram_username
IG_PASSWORD=your_instagram_password
```

> `.env` は `.gitignore` に追加済みか確認（`service_account.json` と同様）

```bash
grep -n ".env" .gitignore || echo ".env" >> .gitignore
```

- [ ] **Step 3: スクリプトを実行**

```bash
python fetch_ig_icons.py
```

期待出力（例）:
```
2026-05-14 10:00:00 INFO === シート処理開始: モデル ===
2026-05-14 10:00:02 INFO [OK] row=2 (田中花子): https://drive.google.com/uc?id=...
2026-05-14 10:00:05 WARNING [SKIP] row=3 (山田太郎): 画像取得失敗
...
2026-05-14 10:05:00 INFO [完了] temp_icons を削除しました
```

- [ ] **Step 4: シートを開いてIGアイコン列に画像が表示されていることを確認**

対象スプレッドシート: `https://docs.google.com/spreadsheets/d/14HAgG2wwQh54CiV0wONCjxI6VXA2Mt-tpmBv3YL_RUM`

- [ ] **Step 5: 最終コミット**

```bash
git add .gitignore
git commit -m "IGアイコン自動取得スクリプト実装完了"
```
