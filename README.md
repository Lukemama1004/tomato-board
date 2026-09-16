# 小番茄溫室作業板

溫室土耕小番茄的線上工作清單。員工打開網址就能用,不需要任何帳號;管理者用密碼登入。

- **員工**:選自己的名字,只看到分派給自己的工作;可勾「已完成」,或勾「尚未完成」並填寫原因;全期進度唯讀。
- **管理者**:看到全部工作與每個人的進度、分派人員、改狀態、寫備註、改排程與人員名單。
- **工作自動記錄**:員工回報(完成/未完成原因)與管理者的分派、狀態、備註,都會自動寫入「工作紀錄」,管理者可依月份、人員、紀錄表篩選,並匯出成 Excel(分頁對應計畫排程表的 6 張紀錄表)。
- **計畫排程表連結**:管理者畫面右上角有「計畫排程表 Excel」按鈕,可下載完整的種植工作計畫排程表。

網頁放在 **GitHub Pages**(免費),資料存在 **Firebase Firestore**(免費方案),管理者密碼由 **Firebase Authentication** 驗證。

## 檔案說明

| 檔案 | 用途 | 需要修改嗎 |
|---|---|---|
| `index.html` | 網頁本體 | 不用 |
| `app.js` | 工作排程與畫面邏輯 | 不用 |
| `firebase-config.js` | Firebase 連線設定、管理者 Email | **要填** |
| `firestore.rules` | 資料權限規則(貼到 Firebase 主控台) | **要改 Email** |
| `docs/tomato-plan.xlsx` | 溫室土耕小番茄_種植工作計畫排程表 | 要更新時,用同檔名重新上傳 |

> 沒填 `firebase-config.js` 時,網頁會以「示範模式」開啟,可以先看畫面,但資料不會儲存。

---

## 設定步驟(約 20 分鐘)

### 1. 建立 Firebase 專案

1. 用 Google 帳號登入 <https://console.firebase.google.com>,按「建立專案」,取個名字(例如 `tomato-farm`)。Google Analytics 可關閉。
2. 專案首頁按 **`</>`(網頁)** 圖示新增網頁應用程式,暱稱隨意,**不用**勾 Firebase Hosting。
3. 畫面會出現一段 `firebaseConfig = { apiKey: ..., ... }`,把裡面 6 個值複製到 `firebase-config.js` 的 `FIREBASE_CONFIG`。

### 2. 建立資料庫並貼上權限規則

1. 左側選單「建構 → Firestore Database」→「建立資料庫」。
2. 位置建議選 **asia-east1(台灣)**,模式選「正式版模式」。
3. 建好後切到「規則」分頁,把 `firestore.rules` 全部內容貼上。
4. 把規則裡的 `manager@example.com` 改成你的管理者 Email,按「發布」。

### 3. 建立管理者帳號(這就是管理者密碼)

1. 左側選單「建構 → Authentication」→「開始使用」。
2. 「登入方式」分頁 → 啟用 **電子郵件/密碼**。
3. 「使用者」分頁 → 「新增使用者」:填管理者 Email 與密碼(至少 6 碼)。
   - Email 請用收得到信的信箱,忘記密碼時會寄重設信到這裡。
   - 所有管理者共用這組密碼。
4. 回到 `firebase-config.js`,把 `MANAGER_EMAIL` 改成同一個 Email。

### 4. 放上 GitHub Pages

1. 登入 <https://github.com>,右上角「+」→「New repository」,名稱例如 `tomato-board`,選 **Public**,按「Create repository」。
2. 在新 repository 頁面按「uploading an existing file」,把解壓縮後的**全部檔案與 `docs` 資料夾**(`index.html`、`app.js`、`firebase-config.js`、`firestore.rules`、`README.md`、`docs/tomato-plan.xlsx`)一起拖進去,按「Commit changes」。
3. 到 repository 的「Settings → Pages」:Source 選「Deploy from a branch」,Branch 選 `main`、資料夾 `/ (root)`,按「Save」。
4. 等 1–2 分鐘,頁面上方會出現網址,例如 `https://你的帳號.github.io/tomato-board/`。

### 5. 允許 GitHub 網址登入

回到 Firebase「Authentication → 設定 → 已授權網域」→「新增網域」,填入 `你的帳號.github.io`。(沒做這步,管理者會無法登入。)

### 6. 開始使用

1. 打開網址 → 右上角「管理者登入」→ 輸入密碼。
2. 到「排程設定」確認定植日等參數,按 **「儲存排程設定」**(第一次一定要按,員工端才會讀到設定)。
3. 在「人員名單」新增員工姓名。
4. 回到「今日工作」分派工作。
5. 把網址傳給員工(可加入手機主畫面)。員工第一次打開時點選自己的名字即可。

---

## 常見問題

**員工需要帳號嗎?** 不需要,打開網址就能用。

**別人拿到網址會怎樣?** 可以看到工作進度並送出「完成/未完成」回報;但無法分派、改狀態、改排程或人員名單,這些由 Firebase 權限規則在伺服器端擋住,不是只靠畫面。員工選名字不需驗證,因此網址請只給農場內部人員。

**程式放在 Public repository 安全嗎?** 程式碼與 `firebase-config.js` 的值本來就會被瀏覽器下載,屬於公開資訊;密碼不在程式裡,資料權限由 `firestore.rules` 控管。

**工作紀錄誰看得到?** 只有登入的管理者。員工只能「新增」自己的回報紀錄,無法讀取、修改或刪除紀錄(由 `firestore.rules` 控管)。

**工作紀錄會記哪些內容?** 時間、工作編號與名稱、所屬紀錄表、預定日期/週、人員、動作(回報完成、回報未完成、狀態變更、分派、備註)與說明。用量、糖度、溫度等數值仍請填在計畫排程表的紀錄表中。

**要改管理者密碼?** 登入後到「排程設定 → 變更管理者密碼」;忘記密碼可在登入框按「寄送重設密碼信」,或到 Firebase「Authentication → 使用者」重設。

**免費額度夠嗎?** Firebase 免費方案每天 5 萬次讀取、2 萬次寫入。本工具把狀態合併在少數幾份資料中,一般農場(十幾位人員、每天數十次開啟)遠低於額度。

**另一座溫室/另一期作?** 建議再建一個 Firebase 專案與一個 repository,資料才不會混在一起。

**修改工作項目內容?** 工作項目、做法與數值標準寫在 `app.js` 的 `milestones()`(里程碑工作)與 `routines()`(例行工作)。修改後重新上傳 `app.js` 即可。

## 內容依據

工作項目與數值標準整理自臺南區農業改良場、臺中區農業改良場(TGAP 番茄)、農業部、農業試驗所,以及 Alabama Extension、UMass、Koppert、UC Davis 等資料,各項目在網頁中點開後可看到出處連結。用藥請一律查詢防檢署「農藥資訊服務網」的現行登記。
