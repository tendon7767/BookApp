# Google Drive 連接與同步

書籍只由 App「加入書籍」匯入。Drive 保存 App 管理的書籍與書架備份，不掃描使用者任意資料夾裡的電子書。無 Apps Script 後端，不需要 Client Secret。

## Google Cloud 設定

1. 選擇 Google Cloud 專案，啟用 **Google Drive API**、**Google Picker API**。
2. Google Auth Platform 設定品牌、External / Testing 對象，加入自己與親友的測試帳號。
3. Data Access 使用 `https://www.googleapis.com/auth/drive.file`；只存取 App 建立或使用者指定的檔案。
4. 建立 Web application OAuth Client。已授權 JavaScript 來源依實際網址加入：
   - `http://localhost:4174`
   - `http://127.0.0.1:4174`
   - `https://tendon7767.github.io`
5. 來源不加 `/BookApp/` 路徑。localhost 與 127.0.0.1 是不同來源；少登記會出現 `origin_mismatch`。本版使用 GIS popup token model，沒有後端 callback。
6. API Key 的網站限制加上實際網址，例如 `http://127.0.0.1:4174/*`、`http://localhost:4174/*`、`https://tendon7767.github.io/*`、`https://docs.google.com/*`；API 限制選 Picker API 與 Drive API。
7. 從專案資訊取得數字形式的 Project number。
8. App「設定 → Google Drive → Google 應用程式設定」填入 OAuth Client ID、Picker API Key、專案編號。

公開設定可由 `.env.local` 的 `VITE_GOOGLE_CLIENT_ID`、`VITE_GOOGLE_API_KEY`、`VITE_GOOGLE_APP_ID` 提供，GitHub Pages workflow 讀取同名 repository Actions variables。正式部署設定一次，親友只需登入自己的 Google 帳號。手動輸入的設定存於 IndexedDB，清空網站資料後需重填；正式部署應提供 build-time 設定。

官方文件：[OAuth](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid)、[Picker](https://developers.google.com/workspace/drive/picker/guides/web-picker)、[Drive 權限](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)。

## 使用流程

- 從 App 加入 EPUB / TXT，先保存於本機即可閱讀。
- 設定 → Google Drive → 連接 → 選擇備份位置。Picker 只選資料夾，不提供另一個加書入口。
- 在選定父資料夾裡建立 App 管理的「看書」子資料夾；選回既有子資料夾或它的父資料夾會使用同一份備份。若有多份備份，需直接選擇確切的子資料夾。
- 本機書架與選定位置合併。改用別的帳號或位置不會清空本機書架；但只存在舊雲端的原檔需先下載，才能再備份到新位置。
- 「立即同步」雙向同步。App 前景中約每 5 秒檢查本機變更，純閱讀進度以約 30 秒為間隔上傳，無變更時約每分鐘查雲端；回到前景或恢復網路也會檢查。失敗採 15 秒至 5 分鐘退避重試。
- 保存書名、作者、分類、系列、集數、封面、CFI / TXT 位置、最後閱讀時間、各書排版、預設排版、外觀、書架排序。搜尋字串、暫時篩選、登入憑證、EPUB 分頁快取不屬備份。
- 清除本機或換裝置：重新登入，選回相同位置。先還原完整書架、設定與封面，點「下載並閱讀」才取原檔。只可還原已成功同步的變更。
- 「從書架刪除」會同步刪除書架項目。原檔與歷史版本保留，可在雲端頁「找回已刪除書籍」還原。
- 「僅移除本機下載」保留書目、進度、設定與雲端原檔，不會刪除其他裝置的下載。
- 雲端頁提供最近 20 份歷史備份供還原。還原結果形成新的同步修改，較晚新增的書籍仍保留。

## 同步資料與安全性

- IndexedDB v6 新增 `syncState`，保留 v1–v5 書目、原檔、進度與設定。待送版本、上傳 ID 與已知基準都持久化；App 關閉後能重試。
- 以 SHA-256 作書籍身分。原檔只首次上傳；排版或分類改動只傳 JSON，不重傳整本書。下載須通過大小與 SHA-256 驗證。
- Drive 使用預先配置的 ID 與 1 MiB resumable chunks。回應遺失後以同 ID 查詢完成狀態，避免重複建立檔案；中斷的未完成書檔下次可能從頭重傳，不承諾跨重開續傳位元組進度。
- 每個裝置發布不可變的書架快照；讀取各裝置最新快照，再合併 vector-clock multi-value registers。不同欄位合併，同欄位並行修改保留各版本，由 UI 選擇。時間僅作顯示，不用時間戳或最大閱讀百分比直接蓋掉其他裝置。
- 刪除使用 tombstone；同時刪除／修改先保留書籍並顯示衝突。歷史快照和已刪原檔目前不自動清理，會持續占用 Drive 空間。
- 同一瀏覽器透過 Web Locks 排他同步；不支援時明確停止雲端同步，本機閱讀仍可使用。套用遠端資料時在同一 IDB transaction 重讀本機，避免抹掉網路請求期間的修改。
- 所有書籍原檔上傳完成後才發布書架快照。未知 schema、破損進度或不完整索引拒絕套用；失敗不重建資料庫。
- Access token 只在記憶體，App 重載或授權過期後需要使用者再次連接。Google API 不進 Service Worker cache。iOS 關閉 App 不保證背景同步，大量匯入需保持 App 開啟並等「已同步」。

## 驗收範圍

單元測試涵蓋衝突合併、刪除／修改衝突、回頭閱讀、資料遷移、破損備份回滾、清空本機後還原、上傳回應遺失重試、原檔驗證和僅移除下載。瀏覽器測試 mock Google SDK / API，驗證選資料夾、匯入上傳、另一裝置還原、按需下載、刪除找回與 401 重連。

真實 Google OAuth / Picker、CORS 回應標頭、iPhone Safari 與 standalone PWA 的 popup / 長時間上傳仍需實機驗收。測試不讀寫真實 Google Drive。完整冷啟動離線閱讀另由既有 App / EPUB / TXT 測試驗證。
