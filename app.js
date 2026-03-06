/**
 * HabitFlow Pro - Core Engine
 * Evolution: Time-stamped logs for precise tracking, Undo support, and Advanced Analytics.
 */

const STORAGE_KEY = "habitFlowProData";

// 1. Data Architecture
let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
    habits: [],
    settings: { theme: 'dark' }
};

// Migration: If user has old data format, convert it
function migrate() {
    const oldKey = "habitFlowData";
    const oldDataString = localStorage.getItem(oldKey);
    
    if (oldDataString) {
        try {
            const oldData = JSON.parse(oldDataString);
            if (oldData && oldData.habits && state.habits.length === 0) {
                state.habits = oldData.habits.map(h => {
                    const timestamps = [];
                    // Convert old daily count logs { "YYYY-MM-DD": count } to timestamps
                    if (h.logs && !Array.isArray(h.logs)) {
                        for (const [date, count] of Object.entries(h.logs)) {
                            for (let i = 0; i < count; i++) {
                                timestamps.push(new Date(date).getTime());
                            }
                        }
                    } else if (Array.isArray(h.logs)) {
                        return h; // Already migrated
                    }
                    
                    return {
                        id: h.id || Date.now() + Math.random(),
                        name: h.name,
                        logs: timestamps, // Now an array of timestamps!
                        createdAt: h.createdAt || new Date().toISOString()
                    };
                });
                // After migration, clear old and save new
                localStorage.removeItem(oldKey);
                save();
            }
        } catch (e) {
            console.error("Migration failed", e);
        }
    }
}

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// 2. Action Logic
let lastAction = null;

function logHabit(id) {
    const habit = state.habits.find(h => h.id === id);
    if (!habit) return;
    
    const now = Date.now();
    habit.logs.push(now);
    lastAction = { type: 'log', habitId: id, timestamp: now };
    
    save();
    renderHabits();
    showUndoBanner();
}

function undoLastLog() {
    if (!lastAction) return;
    const habit = state.habits.find(h => h.id === lastAction.habitId);
    if (habit) {
        const index = habit.logs.indexOf(lastAction.timestamp);
        if (index > -1) {
            habit.logs.splice(index, 1);
            save();
            renderHabits();
            hideUndoBanner();
            lastAction = null;
        }
    }
}

function createNewHabit() {
    const name = document.getElementById("input-habit-name").value.trim();
    if (!name) return;
    
    state.habits.push({
        id: Date.now(),
        name: name,
        logs: [],
        createdAt: new Date().toISOString()
    });
    
    document.getElementById("input-habit-name").value = "";
    save();
    closeSheets();
    renderHabits();
}

function deleteHabit(id) {
    if (confirm("確定要永久刪除此項目與所有紀錄嗎？")) {
        state.habits = state.habits.filter(h => h.id !== id);
        save();
        closeSheets();
        renderHabits();
    }
}

// 3. View Management
function navigate(view, el) {
    document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
    document.getElementById(`view-${view}`).style.display = 'block';
    
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    el.classList.add('active');
    
    if (view === 'habits') renderHabits();
    if (view === 'analytics') renderAnalytics();
}

// 4. Rendering
function renderHabits() {
    const grid = document.getElementById("habit-grid");
    if (!grid) return;
    grid.innerHTML = "";
    
    if (state.habits.length === 0) {
        grid.innerHTML = '<div style="text-align:center; padding:60px; color:var(--text-dim);">點擊下方按鈕開始你的第一個成長計畫。</div>';
        return;
    }

    const todayStart = new Date().setHours(0,0,0,0);
    const todayEnd = new Date().setHours(23,59,59,999);

    state.habits.forEach(h => {
        const todayCount = h.logs.filter(ts => ts >= todayStart && ts <= todayEnd).length;
        const totalCount = h.logs.length;
        
        const card = document.createElement("div");
        card.className = "habit-card";
        card.innerHTML = `
            <div class="habit-info" onclick="openHabitDetails(${h.id})">
                <div>
                    <div class="habit-name">${h.name}</div>
                    <div class="habit-stats-mini">今日累積 ${todayCount} | 總計 ${totalCount}</div>
                </div>
                <div style="font-size: 1.2rem;">➔</div>
            </div>
            <div class="action-area">
                <button class="btn-log" onclick="event.stopPropagation(); logHabit(${h.id})">
                    <span>紀錄成就</span>
                    <span style="opacity:0.6; font-size: 0.8rem;">+1</span>
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function renderAnalytics() {
    const container = document.getElementById("analytics-content");
    container.innerHTML = "";
    
    if (state.habits.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:60px; color:var(--text-dim);">尚未有足夠數據進行分析。</div>';
        return;
    }

    // A. Weekly Frequency Chart (Last 7 Days)
    const weeklyCard = document.createElement("div");
    weeklyCard.className = "chart-card";
    weeklyCard.innerHTML = `<h3>週成長趨勢</h3><p style="color:var(--text-dim); font-size:0.8rem;">過去七天的成就累積</p>`;
    
    const barGrid = document.createElement("div");
    barGrid.className = "bar-grid";
    
    const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const counts = Array(7).fill(0);
    const ONE_DAY = 1000 * 60 * 60 * 24;
    
    state.habits.forEach(h => {
        h.logs.forEach(ts => {
            const logDate = new Date(ts);
            const logDayStart = new Date(logDate.getFullYear(), logDate.getMonth(), logDate.getDate()).getTime();
            const dayDiff = Math.floor((todayStart - logDayStart) / ONE_DAY);
            
            if (dayDiff >= 0 && dayDiff < 7) {
                counts[6 - dayDiff]++;
            }
        });
    });

    const max = Math.max(...counts, 1);
    for (let i = 0; i < 7; i++) {
        // Calculate the actual label for the day
        const labelDate = new Date(todayStart - (6 - i) * ONE_DAY);
        const label = dayLabels[labelDate.getDay()];
        
        const height = Math.max((counts[i] / max) * 100, 2); // Ensure at least 2% height for visibility
        const barWrap = document.createElement("div");
        barWrap.className = "bar-wrap";
        barWrap.innerHTML = `
            <div style="font-size:0.7rem; color:var(--primary); margin-bottom:4px; opacity:${counts[i]>0?1:0}">${counts[i]}</div>
            <div class="bar" style="height: ${height}%"></div>
            <div class="bar-label">${label}</div>
        `;
        barGrid.appendChild(barWrap);
    }
    weeklyCard.appendChild(barGrid);
    container.appendChild(weeklyCard);

    // B. Specific Habit Breakdown
    state.habits.forEach(h => {
        const hCard = document.createElement("div");
        hCard.className = "chart-card";
        const total = h.logs.length;
        const activeDays = new Set(h.logs.map(ts => new Date(ts).toISOString().split('T')[0])).size;
        
        hCard.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:700;">${h.name}</span>
                <span style="color:var(--primary); font-weight:800;">${total} 次</span>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 8px;">
                平均紀錄頻率: ${(total / Math.max(1, activeDays)).toFixed(1)} 次/天
            </div>
            <div style="display:flex; gap:4px; margin-top:12px;">
                ${renderMiniHeatmap(h.logs)}
            </div>
        `;
        container.appendChild(hCard);
    });
}

function renderMiniHeatmap(logs) {
    const logSet = new Set(logs.map(ts => new Date(ts).toISOString().split('T')[0]));
    let html = "";
    const now = new Date();
    for (let i = 28; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const s = d.toISOString().split('T')[0];
        const isActive = logSet.has(s);
        html += `<div style="width:10px; height:10px; border-radius:2px; background: ${isActive ? 'var(--primary)' : 'var(--card-light)'};"></div>`;
    }
    return html;
}

// 5. UI Helpers
function openSheet(id) {
    document.getElementById("sheet-overlay").classList.add("open");
    document.getElementById(id).classList.add("open");
}

function closeSheets() {
    document.getElementById("sheet-overlay").classList.remove("remove"); // Close fix
    document.getElementById("sheet-overlay").classList.remove("open");
    document.querySelectorAll(".sheet").forEach(s => s.classList.remove("open"));
}

/**
 * Log Management: History & Manual Edits
 */
function deleteSpecificLog(habitId, timestamp) {
    if (!confirm("確定要刪除這筆紀錄嗎？此動作無法復原。")) return;
    const habit = state.habits.find(h => h.id === habitId);
    if (habit) {
        habit.logs = habit.logs.filter(ts => ts !== timestamp);
        save();
        openHabitDetails(habitId); // Refresh details view
        renderHabits();
    }
}

function addBackLog(habitId) {
    const dateInput = document.getElementById("backlog-date");
    const timeInput = document.getElementById("backlog-time");
    
    if (!dateInput.value) {
        alert("請選擇日期");
        return;
    }

    const timeStr = timeInput.value || "12:00";
    const timestamp = new Date(`${dateInput.value}T${timeStr}`).getTime();
    
    if (isNaN(timestamp)) {
        alert("無效的時間格式");
        return;
    }

    const habit = state.habits.find(h => h.id === habitId);
    if (habit) {
        habit.logs.push(timestamp);
        habit.logs.sort((a, b) => b - a); // Keep it sorted descending
        save();
        openHabitDetails(habitId);
        renderHabits();
        alert("補登成功！");
    }
}

function openHabitDetails(id) {
    const h = state.habits.find(x => x.id === id);
    if (!h) return;
    
    const content = document.getElementById("details-content");
    
    // Sort logs by time (newest first)
    const sortedLogs = [...h.logs].sort((a, b) => b - a);
    
    let historyHtml = sortedLogs.slice(0, 50).map(ts => {
        const d = new Date(ts);
        const dateStr = d.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
        const timeStr = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
        return `
            <div class="history-item">
                <div>
                    <strong>${dateStr}</strong> <span>${timeStr}</span>
                </div>
                <button class="btn-mini-del" onclick="deleteSpecificLog(${h.id}, ${ts})">刪除</button>
            </div>
        `;
    }).join("");

    if (h.logs.length === 0) historyHtml = '<div style="text-align:center; padding:20px; color:var(--text-dim);">尚未有紀錄</div>';

    content.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <h2 style="margin:0;">管理項目</h2>
            <button onclick="closeSheets()" style="background:none; border:none; color:var(--text-dim); font-size:1.5rem;">×</button>
        </div>
        
        <div class="input-group">
            <label>項目名稱</label>
            <input type="text" value="${h.name}" onchange="updateHabitName(${h.id}, this.value)">
        </div>

        <label style="font-size: 0.8rem; color: var(--text-dim); display:block; margin-bottom: 8px;">最近 50 筆紀錄</label>
        <div class="log-history">
            ${historyHtml}
        </div>

        <div class="backfill-section">
            <label style="font-size: 0.8rem; font-weight:700; color:var(--primary);">🕒 補登成就紀錄</label>
            <div class="backfill-controls">
                <input type="date" id="backlog-date" value="${new Date().toISOString().split('T')[0]}">
                <input type="time" id="backlog-time" value="12:00">
            </div>
            <button class="btn-full primary-btn" style="margin-top:12px; padding:12px; font-size:0.9rem;" onclick="addBackLog(${h.id})">確認補登</button>
        </div>

        <div style="margin-top: 32px; border-top: 1px solid var(--border); padding-top: 24px;">
            <button class="btn-full" style="background:#ef444422; color:#ef4444; padding:12px;" onclick="deleteHabit(${h.id})">⚠️ 永久刪除此習慣</button>
        </div>
    `;
    openSheet("sheet-details");
}

function updateHabitName(id, newName) {
    const h = state.habits.find(x => x.id === id);
    if (h && newName.trim()) {
        h.name = newName.trim();
        save();
        renderHabits();
    }
}

function showUndoBanner() {
    const banner = document.getElementById("undo-banner");
    banner.classList.add("show");
    setTimeout(hideUndoBanner, 5000);
}

function hideUndoBanner() {
    document.getElementById("undo-banner").classList.remove("show");
}

// Tools for data safety
function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habitflow-pro-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function copyToClipboardData() {
    const text = JSON.stringify(state);
    navigator.clipboard.writeText(text).then(() => alert('JSON 代碼已複製！'));
}

function importFromText() {
    const text = prompt('請貼上備份 JSON 代碼：');
    if (!text) return;
    try {
        const imported = JSON.parse(text);
        if (imported.habits) {
            state = imported;
            save();
            renderHabits();
            closeSheets();
            alert('還原成功！');
        }
    } catch (err) { alert('無效的代碼'); }
}

function forceUpdate() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            for (let registration of registrations) registration.unregister();
            caches.keys().then(names => {
                for (let name of names) caches.delete(name);
                window.location.reload(true);
            });
        });
    } else {
        window.location.reload(true);
    }
}

// Initialize
const dateEl = document.getElementById("display-date");
if (dateEl) {
    const options = { month: 'long', day: 'numeric', weekday: 'long' };
    dateEl.innerText = new Date().toLocaleDateString('zh-TW', options);
}

migrate();
renderHabits();

// PWA: Automatic Update Reload
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    window.location.reload();
                }
            });
        });
    });
}
