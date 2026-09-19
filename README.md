# 看書

無廣告、iPhone 優先的個人電子書 PWA。React + TypeScript + Vite。

## 目前進度：Milestone 7（雲端同步與還原）

- 可安裝的 PWA manifest、本機 PNG 圖示、iPhone 安裝說明。
- Service Worker 預快取 App shell；正式建置才啟用。
- EPUB / TXT 多檔匯入、書架與書籍資訊、同步刪除確認。
- EPUB 2 / 3 書名、作者、點陣封面擷取；無封面時產生文字封面。
- SHA-256 內容去重，改檔名不會產生重複書籍。
- 原始檔案、封面、書目在同一筆交易儲存；失敗時回復整筆交易。
- 書架、設定頁、暖紙／明亮／深夜外觀；搜尋、篩選、排序與輸入欄位共用同一組圓角欄位與對焦外框，批次選取改用封面外框加圓形勾選標記。
- IndexedDB v7，原地升級並保留舊書庫、進度與外觀；書目與檔案分離、封面延遲讀取。
- epub.js 閱讀 EPUB 2 / 3：分頁、點按／滑動翻頁、目錄、進度條、CFI 位置保存與還原。
- EPUB 進度索引逐章建立並快取；先顯示閱讀內容，不等整本索引。閱讀器程式與書內本機資源可離線使用。
- Aa 面板：裝置宋體／黑體／等寬、14–36px 字級、行距、段落間距、左右邊距、三種主題與自訂文字／背景色，離線即時套用，每本書各自保存。
- 重排保存穩定 CFI，字體載入和分欄更新後再次定位；連續調整不以每次新頁的起點取代原本閱讀位置。
- TXT 獨立閱讀器：自動辨識 UTF-8／UTF-16／Big5／GB18030，手動切換編碼、自動章節目錄、分頁、進度跳轉、文字位置保存；共用 EPUB 的控制介面與 Aa 面板。
- EPUB／TXT 書內搜尋、內容位置書籤與最近 20 筆跳轉足跡；從目錄、搜尋或進度跳轉後可返回原位置。書籤與足跡納入 Drive 同步。
- 翻頁方向可選左右或上下，點按區域與滑動方向一併跟著改，並跟隨單本排版設定保存。第一次開書與切換點按方向時，畫面會浮出上一頁／選單／下一頁的區域提示並自動淡出，也可點閱讀選單底部的提示文字再看一次；Aa 面板另有常駐的區域示意圖。滑動時頁面跟著手指移動，放開超過該方向長度兩成（至少 56px）才翻頁，未達門檻或已在首尾則彈回原位；換頁與拖曳收尾同時進行，並保留部分舊頁在畫面上，縮短中間的空白。點按翻頁不套用動畫，直接換頁。滑動效果可在 Aa 面板「翻頁效果」關閉，系統設為減少動態時自動停用。
- TXT 在 Web Worker 解碼與辨識章節，每次只排版當頁附近至多 8,192 個 UTF-16 code units，避免整本長篇進入 DOM；worker 也預快取供離線首次開書。
- 書庫搜尋書名／原書名／作者／分類／檔名，分類篩選、未分類、最近閱讀／最近加入／書名排序；顯示閱讀百分比與已讀完。
- 書籍資訊可修改書名、作者、分類，顯示上次閱讀時間；變更先更新本機 metadata 並排程雲端同步，保留原檔、封面、進度與排版設定。
- 標題列右側是雲端狀態膠囊（雲端未設定／待連接／同步中／已同步…），點它直接進入 Google Drive 設定。
- 搜尋／分類／排序固定上方，系列頁的排序靠右與上方對齊；書籍總數與「加入書籍／批次編輯」放入固定底部的平整工具列；書卡作者移至資訊頁，疊有百分比的進度條顯示在封面下緣，書名最多三行。
- 多選書籍可批次分類或從書架刪除；全選僅作用於目前搜尋／篩選結果。套用前列出所選書名，批次資料變更使用單一 IndexedDB 交易，失敗時不留下部分更新。
- 新版本先提示，使用者選擇後才重新載入。
- safe-area、動態 viewport、手機／平板／桌面版面。
- Library、Reader、Storage 分離；EPUB CFI、TXT character offset、PDF page 使用不同型別。

系列整理：在「批次編輯」選取書籍後，點「系列」填入系列名稱及各本集數；也可從單本書籍資訊編輯。書架將同系列收成一張卡片（封面右側疊出書背示意，與書卡同樣把書名排在封面下方），點入依集數排列（未填集數排最後），也可在系列頁切換排序。搜尋包含系列名稱，篩選後只顯示及選取符合的集數。系列留白會移出系列，保留原有分類、檔案及閱讀進度。

Drive 上的「看書」資料夾只放書籍原檔，備份索引與封面改放在其中的「備份資料」子資料夾；舊版留在外層的備份檔會在下次同步自動搬入（其他裝置需更新到這版才找得到）。每台裝置的書架備份自動保留最近 10 份，較舊的移到 Drive 垃圾桶。把 EPUB／TXT 直接放進「看書」資料夾後，雲端頁的「查詢雲端新書」可列出尚未加入書架的檔案並一鍵加入；加入後沿用該檔案作為原檔，不會再上傳一份，重複內容不會重複加入。已加入 Google OAuth、Picker 指定備份位置、原檔自動上傳、書架／進度／設定雙向同步、衝突選擇、刪除找回與按需下載還原；需填入 Google 公開前端設定後進行真實帳號與 iPhone 驗收。PDF 尚未實作。TXT 匯入保留原始位元組。EPUB 先支援可重排文字，固定版面與 DRM 不在本階段範圍。

「設定 → 這台裝置 → 儲存空間與下載」顯示本機書檔總量與瀏覽器估算用量，可批次下載僅在雲端的書，或移除已有雲端原檔的本機下載；書架、閱讀進度、排版和書籤會保留。尚未備份的唯一原檔不提供此移除操作。

書庫預設按最近閱讀排序，未讀書籍按加入時間接在後面；改名不會更動閱讀時間。搜尋可輸入多個關鍵字，以空白分隔；全半形與英文大小寫會正規化。搜尋／分類／排序在返回書架時保留，重新啟動回到全部書籍／最近閱讀。單本分類可自由輸入，已有分類提供建議，留白即未分類。已讀進度以四捨五入顯示，未真正到末頁最多顯示 99%。

書架上點書籍封面開啟書籍資訊，點封面下方的書名直接進入閱讀；批次編輯時兩處都是選取。書籍資訊頁的封面依螢幕高度放大（最多 36dvh），點封面即開始閱讀（雲端書籍為下載並閱讀），下方有一行提示；左上角是刪除與編輯兩個圖示，進度以進度條加百分比與上次閱讀時間呈現，分類、格式、本機與備份狀態收成一列標籤，原始檔名與檔案大小放進可展開的「原始檔案」，「返回書架」固定在視窗底部。書籍資訊可編輯或點左上角垃圾桶刪除，刪除視窗三選一：只移除本機下載、從書架移除（其他裝置同步移除，雲端仍可找回）、連雲端原檔一起刪（移到 Google Drive 垃圾桶，可在 Drive 內復原）；批次移除共用同一個視窗。系列頁可切換集數順序／集數倒序／最近閱讀／最近加入／書名排序，選擇會保存並同步。閱讀時點中央開關選單，左右點按或滑動翻頁，底部百分比也可開啟選單。點 Aa 開啟排版面板，畫面上方仍可預覽實際內容。「設定 → 閱讀 → 預設排版」可預覽並儲存 EPUB／TXT 共用的預設值；已保存的單本設定優先。未自訂的書籍在下次開啟時使用最新預設，單純閱讀不會建立單本設定。尚未儲存預設排版時，初始閱讀主題沿用 App 外觀（工程師深灰對應深夜、霧藍對應明亮、鼠尾草綠對應暖紙）；不改變書架外觀。點主題色可清除自訂顏色，「重設排版」回復 20px 宋體／暖紙等預設值。字體是否可用依裝置而定，沒有下載外部字型。

TXT 自動編碼不是保證：Big5 與 GBK 的合法位元組可能重疊，沒有 BOM 的 UTF-16 也可能不明確。亂碼時可在閱讀選單的「TXT 編碼」切換，每本書各自記住選擇。切換編碼會按約略百分比定位；同一編碼下重開／重排則保存確切文字偏移。文字偏移 v1 定義為移除 BOM、CRLF／CR 正規化成 LF 後的 UTF-16 code units；原始檔案不改寫。解碼使用標準 [TextDecoder](https://encoding.spec.whatwg.org/#interface-textdecoder)，無外部解碼服務或新增套件。空白行保留在文字索引，畫面上使用 Aa 段距統一呈現，不額外疊加空白頁高。

Windows WebKit 實測會阻擋 sandbox 禁用腳本之 iframe 內的事件處理，因此由外層手勢區處理觸控，保持 `allowScriptedContent: false`。此階段不提供書內連結、文字選取或劃線註記。書內腳本、嵌入頁面及遠端資源不載入；本機圖片、CSS、字體由 Blob URL 使用。原生縮放仍保留。參考 [epub.js 官方文件](https://github.com/futurepress/epub.js#scripted-content)。

`epubjs@0.3.93` 使用的 XML fallback 套件存在舊版漏洞，透過 npm overrides 固定 `@xmldom/xmldom@0.9.12`；不採用 npm audit 建議的舊 0.4 系列。已驗證 browser build、EPUB 2/3 與兩本授權的本機測試書。

目前每本檔案上限 50 MB，逐本處理以控制手機記憶體；EPUB 的 container / package / 封面解壓輸出也有限制。SVG、外部或不完整封面改用預設封面，不抓取外部網址。匯入並非 EPUB 全規格驗證，也不代表 DRM 或固定版式書籍已可閱讀。

### 二進位儲存選擇

Windows WebKit 26.6 測試中，直接儲存 Blob/File 出現 `Error preparing Blob/File data to be stored in object store`。因此書檔與封面改存 `{ bytes: ArrayBuffer, mimeType }`，讀取時還原 Blob；相同的標準方式用於所有瀏覽器，不轉成 base64，不更動原始內容。也保留讀取早期開發版 Blob 記錄的相容性。這不代表已確認 iOS 26.6.1 有相同問題，仍需真機驗收。

## 本機開發與驗證

使用 Node.js 24 LTS 與 npm。

```sh
npm ci
npm run dev
```

開啟終端機顯示的 `/BookApp/` 網址。開發模式不註冊 Service Worker。

```sh
npm run check
npx playwright install chromium webkit
npm run test:e2e
```

`check` 執行 lint、資料處理測試與 TypeScript／正式 build。瀏覽器測試會啟動 preview，驗證正式版的離線重開、IndexedDB 設定、manifest / 圖示、320px／iPhone／橫向版面、EPUB 2 / 3／TXT 匯入、去重、刪除、8 MB TXT 雜湊完整性，以及來源關閉後首次匯入 EPUB。Linux 首次安裝測試瀏覽器請用 `npx playwright install --with-deps chromium webkit`。

閱讀器測試另涵蓋 EPUB 2/3 翻頁、目錄與進度跳轉、CFI 重開還原、首頁／末頁、點按／滑動和 viewport 重排。可用 `node scripts/test-local-epubs.mjs artifacts/private-books/example.epub` 在 4174 preview 測試私人 EPUB；檔案和截圖只留在 Git 忽略的 `artifacts/`，不放進 CI。

TXT 測試包含連續前後頁的文字覆蓋、章節／進度跳轉、字體重排與橫向切換後的確切位置、8 MB 檔案的有限 DOM、編碼選擇持久化，以及停止來源後首次載入 TXT 閱讀器與 worker。`node scripts/test-local-text.mjs artifacts/private-books/example.txt` 可驗證實際書檔，不修改使用者現有瀏覽器書庫。

測試限制：Windows Playwright WebKit 在 `setOffline(true)` 後重新載入會回報內部錯誤，因此完整斷網模擬只跑 Chromium。另以停止本機來源伺服器的方式，在兩個引擎檢查快取啟動。這不是 iPhone 飛航模式的替代品；正式驗收仍依真機清單完成。

手動驗證正式版：

```sh
npm run build
npm run preview -- --host localhost
```

開啟 `http://localhost:4173/BookApp/`，等候「可離線開啟」，再斷網重開。手機連到電腦的區網 HTTP 網址不符合 Service Worker 的安全來源要求；iPhone 請使用 HTTPS 部署。

圖示由 `scripts/generate-icons.mjs` 產生，執行 `npm run icons` 可重新生成，不需外部圖片或 CDN 字體。

## GitHub Pages

目標 repository：`tendon7767/BookApp`，base / manifest / Service Worker scope 已配置 `/BookApp/`。更換部署路徑時需一起修改 `vite.config.ts`。

1. 在 GitHub **Settings → Pages → Source** 選 **GitHub Actions**（只需設定一次）。
2. 將程式推送或合併至 `main`，發布會自動執行；也可在 **Actions → Publish to GitHub Pages → Run workflow** 手動重跑。
3. 成功後以 workflow 回傳的 HTTPS 網址在 iPhone 測試；App 重開時才會提示更新。

CI 分工以縮短等待：pull request 只跑一輪 Check（Chromium），合併到 `main` 後 Check 補跑 Chromium 與 WebKit，發布流程同時進行，只跑 lint、unit tests 與帶入 Google 設定的 build。瀏覽器依 `@playwright/test` 版本快取。因此瀏覽器測試的完整把關發生在合併前的 Chromium 與合併後的兩個引擎，發布本身不再重跑一次。原創測試 EPUB 由 `tests/fixtures/epub.ts` 動態生成；不提交使用者的書籍或 Google 憑證。

## 重要行為

- 第一次必須連網下載 App shell，快取完成不代表書籍已下載。
- App 更新不主動重建 IndexedDB；未來版本在 `src/storage/database.ts` 遞增版本並寫 migration。
- 內建系統字體與全部圖示可離線使用。
- 本機網站資料可能被清除，不能當永久備份。
- Safari 分頁與主畫面 App 不假設共享狀態；安裝後需從主畫面開啟完成快取。
- 本階段不承諾後台同步；Drive 授權過期時會提示重新連接。

更多：[產品決策](docs/decisions.md)、[iPhone 真機驗收](docs/iphone-test.md)。

外觀另提供工程師深灰、霧藍、鼠尾草綠，共六種 App 主題；切換後保存於 IndexedDB，不覆蓋單本閱讀配色。

Google 設定與驗收請見 [Google Drive 連接設定](docs/google-drive-setup.md)。從「設定 → Google Drive」選擇備份位置、同步或還原；加入書籍只保留 App 的本機選檔入口，網站尚未配置時可直接在畫面填入 Client ID、API Key 與專案編號；不需要 Client Secret。
