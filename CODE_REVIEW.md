# HabitFlow Pro — 程式碼審查報告

> 審查日期：2026-05-28 | 檢視範圍：全專案 (index.html, app.js, style.css, sw.js)

---

## 專案概觀

HabitFlow Pro 是一個純前端 PWA 習慣追蹤器，包含番茄鐘計時與抽卡獎勵系統。整個應用由三個檔案構成（HTML / CSS / JS），無框架、無建置步驟、無後端，所有資料存於 `localStorage`。

| 項目 | 技術 |
|------|------|
| 整體架構 | 單頁 PWA，4 個主要畫面（追蹤 / 分析 / 專注 / 獎勵） |
| JS 行數 | ~1,140 行（單一檔案） |
| CSS 行數 | ~680 行 |
| 相依性 | 零外部 JS 相依 |
| 資料儲存 | localStorage（JSON 序列化） |
| 離線支援 | Service Worker（stale-while-revalidate） |

---

## 發現的 Bug

### 1. `closeSheets()` 中的無意義操作 (`app.js:847`)

```js
document.getElementById("sheet-overlay").classList.remove("remove"); // 錯誤
```

`"remove"` 不是一個 CSS class，這行沒有任何作用。看起來像是打字錯誤，可能原本要寫某種過渡狀態。

### 2. `playSound()` 每次建立新的 AudioContext (`app.js:169`)

```js
const ctx = new (window.AudioContext || window.webkitAudioContext)();
```

每次播放音效都建立一個新的 `AudioContext`。瀏覽器對同時存在的 AudioContext 數量有限制（通常 6 個左右），超過後續音效將無聲。應在初始化時建立一次並重複使用。

### 3. `startFocusTimer()` 的競態條件 (`app.js:311-312`)

```js
async function startFocusTimer() {
    if (focusInterval) return;  // guard
    // enableScreenProtection 是 async
    if (state.settings.wakeLockEnabled) {
        await enableScreenProtection();
    }
    // ... focusInterval = setInterval(...)
}
```

`enableScreenProtection()` 內部有 `await navigator.wakeLock.request()`。在 await 期間如果使用者快速雙擊開始按鈕，兩次呼叫都能通過 `if (focusInterval) return` 的守衛檢查，導致兩個計時器同時運行。

### 4. 撤銷紀錄不會退還抽獎券 (`app.js:113-126`)

`undoLastLog()` 只刪除時間戳，不重新計算 `lifetimeTickets`。如果該筆紀錄剛好觸發了抽獎券獎勵，使用者撤銷後仍保留多餘的票券。

### 5. 刪除特定紀錄也不會重算票券 (`app.js:855-863`)

`deleteSpecificLog()` 有同樣問題 — 刪除後不重新計算獎勵票券。

### 6. 匯入資料缺乏完整驗證 (`app.js:1089-1101`)

```js
if (imported.habits) {
    state = imported;  // 直接取代整個 state
```

只檢查 `habits` 存在就全盤接受。若匯入的 JSON 缺少 `focusLogs`、`rewards`、`settings` 等欄位，後續操作將因 `undefined` 而拋出錯誤。也沒有對匯入資料呼叫 `migrate()`。

### 7. `drawReward()` 保底邏輯在獎池為空時的順序問題 (`app.js:528-554`)

當擲出 Rare 且保底升級為 Epic，但 Epic 獎池為空時，fallback 會隨機選擇一個有內容的稀有度。然而這時 `missTime` 計數器已經按照 Epic 更新了（`app.js:541-542`），與實際抽到的稀有度不一致。

### 8. `renderFocusSummary()` 週計算邏輯不一致 (`app.js:447`)

```js
const weekStart = new Date(..., now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
```

這裡使用「週一為起始日」的計算（週日 → 減 6 = 週一），但台灣習慣以週日為一週之始。UI 上 `toLocaleDateString('zh-TW', ...)` 的輸出則以週日為首，前後不一致。

### 9. XSS 風險 — 習慣名稱直接寫入 innerHTML (`app.js:742`, `app.js:991`)

```js
card.innerHTML = `<div class="habit-name">${h.name}</div>`
// ...
content.innerHTML = `<input ... value="${h.name}" onchange="...">`
```

習慣名稱是使用者輸入的。如果輸入包含 `<script>` 標籤或 `"` 引號，會破壞 HTML 結構甚至執行任意腳本（self-XSS）。

### 10. `localStorage` 配額滿時無錯誤處理 (`app.js:81`)

```js
function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
```

若 localStorage 配額已滿（5-10MB），`setItem` 會拋出 `QuotaExceededError`，目前完全未被捕獲，使用者資料將靜默地無法儲存。

---

## 架構與設計建議

### 單一巨型 JS 檔案

全部約 1,140 行集中在一個 `app.js`，混合了資料層、UI 渲染、計時器引擎、抽獎邏輯、事件處理。建議至少拆分為：

- `state.js` — 資料存取、migration、存檔
- `habits.js` — 習慣 CRUD
- `timer.js` — 專注計時器
- `gacha.js` — 抽獎系統
- `ui.js` — 渲染與畫面切換

### 過度使用 `innerHTML`

大量 UI 是透過組字串後設定 `innerHTML` 來渲染的。這導致：

- XSS 風險（見 Bug #9）
- 難以除錯（沒有 component 邊界）
- 每次修改都整塊重建，失去 DOM 狀態（例如輸入框焦點）

建議建立簡單的 DOM helper 函式，或在重構時考慮輕量框架（如 Preact）。

### 計時器使用 `setInterval` 每秒觸發

`setInterval` 會因主執行緒忙碌而漂移。目前的補救措施是使用絕對時間比較（`Date.now() - focusEndTime`），這是正確的做法。但 1 秒間隔在手機螢幕關閉時會被瀏覽器節流（throttle）到每分鐘一次或完全暫停，導致恢復時顯示的時間不準確。

建議使用 Web Worker 來計時，或監聽 `visibilitychange` 事件在頁面恢復時強制刷新顯示。

### `alert()` 作為唯一通知方式

整份程式碼大量使用 `alert()`、`confirm()`。在 mobile PWA 上體驗不佳，且 `alert()` 在 fullscreen 模式下可能無法顯示。建議改用自訂 toast 元件。

---

## 效能觀察

- **`renderMiniHeatmap()`** 在每個習慣的分析中建立 28 個 `Date` 物件，若有大量習慣會略微影響渲染速度
- **`save()` 在每次操作後都完整序列化整個 state 並寫入 localStorage**，同步 I/O 會阻塞主執行緒。對於目前規模還好，但可考慮 debounce 或使用 `requestIdleCallback`
- **Service Worker 沒有快取字型檔**（只快取了 Google Fonts CSS），離線時可能出現字型閃爍

---

## 稱讚之處

1. **設計一致性**：CSS custom properties 的使用很乾淨，深色主題配色統一且舒服
2. **遷移系統**：有舊資料格式的自動遷移邏輯 (`migrate()`)，對向後相容性有用心
3. **PWA 實作完整**：Service Worker、manifest、stale-while-revalidate 策略、更新提示都到位
4. **絕對時間計時**：計時器使用 wall-clock 時間而非 countdown tick，比單純的 interval 減法更準確
5. **保底機制**：抽獎有 pity system，且從 Python 原型移植到 JS 的邏輯完整
6. **長亮護眼模式**：OLED 全黑覆蓋層的設計對手機螢幕保護很實用
7. **補登功能**：支援手動回溯補登習慣與專注時間

---

## 優先修復建議（依重要性排序）

| 優先級 | 問題 | 位置 |
|--------|------|------|
| 高 | AudioContext 重複建立 | `app.js:169` |
| 高 | startFocusTimer 競態條件 | `app.js:311-312` |
| 高 | 匯入資料無驗證 | `app.js:1093-1095` |
| 中 | XSS（innerHTML 寫入使用者輸入） | `app.js:739, 991` |
| 中 | localStorage 配額耗盡無處理 | `app.js:81` |
| 中 | 撤銷/刪除不重算票券 | `app.js:113-126, 855-863` |
| 低 | closeSheets 中的無效 classList.remove | `app.js:847` |
| 低 | 週計算起點不一致 | `app.js:447` |
