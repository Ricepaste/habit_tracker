/**
 * HabitFlow Pro - Core Engine
 * Evolution: Time-stamped logs for precise tracking, Undo support, and Advanced Analytics.
 */

const STORAGE_KEY = "habitFlowProData";

// 1. Data Architecture
let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
    habits: [],
    focusLogs: [], // Array of { timestamp, duration }
    rewards: {
        tickets: 0,
        prizePool: { Rare: ["75 NT"], Epic: ["175 NT", "衣服"], Legendary: ["375 NT", "遊戲"] },
        missTime: { Rare: 0, Epic: 0 },
        inventory: [] // Array of { prize, rarity, timestamp }
    },
    settings: { theme: 'dark', wakeLockEnabled: false }
};

// Migration: Upgrade existing specific data without overriding old
function migrate() {
    // Port missing Top level structures specifically
    if (!state.focusLogs) state.focusLogs = [];
    if (!state.rewards) state.rewards = { tickets: 0, prizePool: { Rare: ["75 NT"], Epic: ["175 NT", "衣服"], Legendary: ["375 NT", "遊戲"] }, missTime: { Rare: 0, Epic: 0 }, inventory: [] };
    if (!state.settings) state.settings = { theme: 'dark', wakeLockEnabled: false };
    if (state.settings.wakeLockEnabled === undefined) state.settings.wakeLockEnabled = false;
    
    // Port old HabitFlowData to V3/V4 if exists
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
                        timestamps.push(...h.logs);
                    }
                    
                    return {
                        id: h.id || Date.now() + Math.random(),
                        name: h.name,
                        logs: timestamps, // Now an array of timestamps!
                        createdAt: h.createdAt || new Date().toISOString(),
                        rewardSettings: h.rewardSettings || { enabled: false, threshold: 10 }
                    };
                });
                // After migration, clear old and save new
                localStorage.removeItem(oldKey);
                save();
                return;
            }
        } catch (e) {
            console.error("Migration failed", e);
        }
    }
    
    // Ensure all existing habits have rewardSettings
    let modified = false;
    state.habits.forEach(h => {
        if (!h.rewardSettings) {
            h.rewardSettings = { enabled: false, threshold: 10 };
            modified = true;
        }
    });

    if (modified) save();
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
    
    // Reward Ticket Calculation for this habit
    if (habit.rewardSettings && habit.rewardSettings.enabled) {
        if (!habit.rewardSettings.lifetimeTickets) habit.rewardSettings.lifetimeTickets = 0;
        
        const expectedTickets = Math.floor(habit.logs.length / habit.rewardSettings.threshold);
        if (expectedTickets > habit.rewardSettings.lifetimeTickets) {
            const newTickets = expectedTickets - habit.rewardSettings.lifetimeTickets;
            state.rewards.tickets += newTickets;
            habit.rewardSettings.lifetimeTickets = expectedTickets;
            alert(`🎉 恭喜！達成目標，獲得了 ${newTickets} 張抽獎券！`);
        }
    }
    
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
        createdAt: new Date().toISOString(),
        rewardSettings: { enabled: false, threshold: 10 }
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

// ==========================================
// Focus Timer (Pomodoro & Stopwatch Engine)
// ==========================================
let focusInterval = null;
let focusTimerMode = 'pomodoro'; // 'pomodoro' | 'stopwatch'
let focusTimeLeft = 25 * 60; // Countdown if Pomo, Countup if Stopwatch
const TOTAL_FOCUS_TIME = 25 * 60;
let focusMode = 'work'; // 'work' | 'rest' (only for Pomo)
let focusStartTime = null; // timestamp when timer started
let focusEndTime = null;   // timestamp when pomodoro should end
let wakeLock = null;      // Screen Wake Lock object

// --- Sound Effects (Synthetic) ---
function playSound(type) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    const now = ctx.currentTime;
    
    if (type === 'start') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(1320, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
    } else if (type === 'stop') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(220, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
    } else if (type === 'complete') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.setValueAtTime(880, now + 0.1);
        osc.frequency.setValueAtTime(1100, now + 0.2);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
    }
}

function toggleWakeLockPreference(enabled) {
    state.settings.wakeLockEnabled = enabled;
    save();
}

function disableScreenProtection() {
    document.getElementById("screen-protection-overlay").classList.remove("active");
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
}

function setFocusTimerMode(mode) {
    if (focusInterval) {
        if (!confirm("切換模式將停止當前計時，確定嗎？")) return;
        stopFocusTimer();
    }
    focusTimerMode = mode;
    
    // UI Update
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(mode === 'pomodoro' ? 'mode-pomo' : 'mode-stopwatch').classList.add('active');
    
    if (mode === 'pomodoro') {
        focusTimeLeft = TOTAL_FOCUS_TIME;
        focusMode = 'work';
        document.getElementById("focus-mode-label").innerText = "工作模式";
        document.querySelector(".timer-progress").style.stroke = "var(--primary)";
    } else {
        focusTimeLeft = 0;
        document.getElementById("focus-mode-label").innerText = "正向計時中";
        document.querySelector(".timer-progress").style.stroke = "var(--secondary)"; // Maybe #818cf8
    }
    updateFocusDisplay();
}

function updateFocusDisplay() {
    const totalSeconds = Math.abs(focusTimeLeft);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    document.getElementById("focus-time-display").innerText = timeStr;
    const protectedClock = document.getElementById("protected-clock");
    if (protectedClock) protectedClock.innerText = timeStr;
    
    const progress = document.querySelector(".timer-progress");
    if (!progress) return;

    if (focusTimerMode === 'pomodoro') {
        const dashoffset = 283 - (283 * (focusTimeLeft / (focusMode === 'work' ? TOTAL_FOCUS_TIME : 5 * 60)));
        progress.style.strokeDashoffset = dashoffset;
    } else {
        // For stopwatch, maybe just show it filling up as minutes pass (e.g. 60 min loop) or just static full?
        // Let's make it a 60-second loop ring for visual.
        const dashoffset = 283 - (283 * ((focusTimeLeft % 60) / 60));
        progress.style.strokeDashoffset = dashoffset;
    }
}

async function startFocusTimer() {
    if (focusInterval) return;
    
    // Request screen wake lock if enabled
    if (state.settings.wakeLockEnabled && navigator.wakeLock && !wakeLock) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {
                console.log('Screen Wake Lock released');
                wakeLock = null;
            });
            // Show protection overlay
            document.getElementById("screen-protection-overlay").classList.add("active");
            // Request Fullscreen to hide system status bar and home buttons
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {});
            }
        } catch (err) {
            console.error('Wake Lock error:', err.name, err.message);
        }
    }
    
    playSound('start');
    
    focusStartTime = Date.now();
    if (focusTimerMode === 'pomodoro') {
        // Set the target end time based on remaining seconds
        focusEndTime = focusStartTime + focusTimeLeft * 1000;
    } else {
        // Stopwatch mode: we count up from zero
        focusEndTime = null;
    }
    document.getElementById("btn-focus-start").style.display = "none";
    document.getElementById("btn-focus-stop").style.display = "block";
    
    focusInterval = setInterval(() => {
        const now = Date.now();
        if (focusTimerMode === 'pomodoro') {
            const remaining = Math.max(0, Math.round((focusEndTime - now) / 1000));
            focusTimeLeft = remaining;
            if (remaining <= 0) {
                completeFocusSession();
                return; // avoid double call after completion
            }
        } else {
            // Stopwatch counts up
            focusTimeLeft = Math.round((now - focusStartTime) / 1000);
        }
        updateFocusDisplay();
    }, 1000);
}

function stopFocusTimer() {
    // Release wake lock manually if it exists
    if (wakeLock) {
        wakeLock.release().then(() => { wakeLock = null; }).catch(() => { wakeLock = null; });
    }

    if (!focusInterval && focusTimerMode === 'stopwatch' && focusTimeLeft > 0) {
        // Already stopped, but we need to reset
        focusTimeLeft = 0;
        updateFocusDisplay();
        disableScreenProtection();
        return;
    }
    
    playSound('stop');
    disableScreenProtection();
    
    if (focusTimerMode === 'stopwatch' && focusInterval) {
        // Record the time before stopping
        const durationMins = Math.floor(focusTimeLeft / 60);
        if (durationMins > 0) {
            state.focusLogs.push({ timestamp: Date.now(), duration: durationMins });
            checkFocusRewards();
            save();
            renderFocusSummary();
            alert(`正向計時結束！已紀錄 ${durationMins} 分鐘專注時間。`);
        }
    }

    clearInterval(focusInterval);
    focusInterval = null;
    
    if (focusTimerMode === 'pomodoro') {
        focusTimeLeft = focusMode === 'work' ? TOTAL_FOCUS_TIME : 5 * 60;
    } else {
        focusTimeLeft = 0;
    }
    
    updateFocusDisplay();
    
    document.getElementById("btn-focus-start").style.display = "block";
    document.getElementById("btn-focus-stop").style.display = "none";
}

function completeFocusSession() {
    playSound('complete');
    clearInterval(focusInterval);
    focusInterval = null;
    
    if (focusMode === 'work') {
        const durationMins = TOTAL_FOCUS_TIME / 60;
        state.focusLogs.push({ timestamp: Date.now(), duration: durationMins });
        checkFocusRewards();
        save();
        
        // Switch to rest
        focusMode = 'rest';
        focusTimeLeft = 5 * 60;
        document.getElementById("focus-mode-label").innerText = "休息模式 (5分鐘)";
        document.getElementById("focus-mode-label").style.color = "#10b981";
        document.querySelector(".timer-progress").style.stroke = "#10b981";
        startFocusTimer();
    } else {
        // Switch back to work
        stopFocusTimer();
        focusMode = 'work';
        focusTimeLeft = TOTAL_FOCUS_TIME;
        document.getElementById("focus-mode-label").innerText = "工作模式";
        document.getElementById("focus-mode-label").style.color = "var(--text-dim)";
        document.querySelector(".timer-progress").style.stroke = "var(--primary)";
    }
    
    renderFocusSummary();
}

function checkFocusRewards() {
    // 1 ticket per 7 hours (420 mins)
    const totalMinutes = state.focusLogs.reduce((acc, curr) => acc + curr.duration, 0);
    const expectedTickets = Math.floor(totalMinutes / 420);
    
    // We need to track how many focus tickets we've ever earned to avoid re-awarding.
    // Given the current schema, an easy way is to recalculate total earned vs what we have.
    // Better: just add a specific property or assume standard rate?
    // For now, since state.rewards.tickets is a moving balance, let's track lifetime earn.
    if (!state.rewards.lifetimeFocusTickets) state.rewards.lifetimeFocusTickets = 0;
    
    if (expectedTickets > state.rewards.lifetimeFocusTickets) {
        const newTickets = expectedTickets - state.rewards.lifetimeFocusTickets;
        state.rewards.tickets += newTickets;
        state.rewards.lifetimeFocusTickets = expectedTickets;
        // Optionally notify user
    }
}

function renderFocusSummary() {
    const todayStart = new Date().setHours(0,0,0,0);
    const now = new Date();
    const dayOfWeek = now.getDay(); 
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)).setHours(0,0,0,0);

    const todayLogs = state.focusLogs.filter(l => l.timestamp >= todayStart);
    const weekLogs = state.focusLogs.filter(l => l.timestamp >= weekStart);
    
    const todayMins = todayLogs.reduce((acc, curr) => acc + curr.duration, 0);
    const weekMins = weekLogs.reduce((acc, curr) => acc + curr.duration, 0);
    const totalMins = state.focusLogs.reduce((acc, curr) => acc + curr.duration, 0);
    
    // Dashboard Stats
    const dashboard = document.getElementById("focus-dashboard");
    if (dashboard) {
        dashboard.innerHTML = `
            <div class="stat-card">
                <div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:4px;">本週累計</div>
                <div style="font-size:1.2rem; font-weight:800; color:var(--primary);">${Math.floor(weekMins/60)}h ${weekMins%60}m</div>
            </div>
            <div class="stat-card">
                <div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:4px;">歷史總計</div>
                <div style="font-size:1.2rem; font-weight:800; color:white;">${Math.floor(totalMins/60)}h ${totalMins%60}m</div>
            </div>
        `;
    }

    const summaryEl = document.getElementById("focus-today-total");
    if (summaryEl) summaryEl.innerText = `${Math.floor(todayMins/60)}h ${todayMins%60}m`;

    // Reward Progress Bar
    const progressText = document.getElementById("reward-progress-text");
    const progressBar = document.getElementById("reward-progress-bar");
    if (progressText && progressBar) {
        const threshold = 420; // 7 hours
        const currentProgress = totalMins % threshold;
        const remaining = threshold - currentProgress;
        
        progressText.innerText = `${currentProgress} / ${threshold} min`;
        progressBar.style.width = `${(currentProgress / threshold) * 100}%`;
        
        if (remaining <= 60) {
            progressText.innerHTML = `<span style="color:#f59e0b; font-weight:bold;">再專注 ${remaining} 分鐘即可獲得獎券！</span>`;
        }
    }
}

// ==========================================
// Gacha Reward System
// ==========================================
function drawReward() {
    if (state.rewards.tickets <= 0) {
        alert("抽獎券不足！");
        return;
    }

    const { prizePool, missTime } = state.rewards;
    
    if (prizePool.Rare.length === 0 && prizePool.Epic.length === 0 && prizePool.Legendary.length === 0) {
        alert("獎池為空！請先到「管理獎池」設定獎勵。");
        return;
    }

    state.rewards.tickets -= 1;
    document.getElementById("ticket-count").innerText = state.rewards.tickets;
    
    // Animation
    const box = document.getElementById("gacha-box");
    box.classList.add("animating");
    document.getElementById("btn-draw").disabled = true;

    setTimeout(() => {
        box.classList.remove("animating");
        document.getElementById("btn-draw").disabled = false;
        
        // --- Draw Logic (Ported from Prize.py) ---
        let rarity = null;
        let rng = Math.random() * 100;
        if (rng < 70) rarity = "Rare";
        else if (rng < 95) rarity = "Epic";
        else rarity = "Legendary";

        // Pity System
        if (missTime.Rare >= 9 && rarity === "Rare") {
            rarity = "Epic";
        }
        if (rarity === "Epic" && missTime.Epic >= 9 && rarity !== "Legendary") {
            rarity = "Legendary";
        }

        // Finalize Rarity Logic
        switch(rarity) {
            case "Rare":
                missTime.Rare = (missTime.Rare + 1) % 10;
                break;
            case "Epic":
                missTime.Epic = (missTime.Epic + 1) % 10;
                missTime.Rare = 0;
                break;
            case "Legendary":
                missTime.Epic = 0;
                missTime.Rare = 0;
                break;
        }

        // If pool is empty for that rarity, fallback to any available
        if (!prizePool[rarity] || prizePool[rarity].length === 0) {
            const available = ["Rare", "Epic", "Legendary"].filter(r => prizePool[r].length > 0);
            rarity = available[Math.floor(Math.random() * available.length)];
        }

        const prizeList = prizePool[rarity];
        const prize = prizeList[Math.floor(Math.random() * prizeList.length)];
        
        // Update Inventory
        if (!state.rewards.inventory) state.rewards.inventory = [];
        state.rewards.inventory.push({
            prize: prize,
            rarity: rarity,
            timestamp: Date.now()
        });
        
        save();
        renderRewards();
        
        // Show notification
        const emoji = rarity === "Legendary" ? "👑" : rarity === "Epic" ? "✨" : "🍀";
        alert(`${emoji} 恭喜抽中 ${rarity} 等級獎勵：${prize}！`);
        
    }, 600);
}

function savePrizePool() {
    const rareStr = document.getElementById("pool-rare").value;
    const epicStr = document.getElementById("pool-epic").value;
    const legStr = document.getElementById("pool-legendary").value;
    
    state.rewards.prizePool = {
        Rare: rareStr.split(",").map(s => s.trim()).filter(Boolean),
        Epic: epicStr.split(",").map(s => s.trim()).filter(Boolean),
        Legendary: legStr.split(",").map(s => s.trim()).filter(Boolean)
    };
    
    save();
    closeSheets();
    alert("獎池設定已儲存！");
}

function renderRewards() {
    document.getElementById("ticket-count").innerText = state.rewards.tickets || 0;
    
    const list = document.getElementById("inventory-list");
    list.innerHTML = "";
    
    if (!state.rewards.inventory || state.rewards.inventory.length === 0) {
        list.innerHTML = `<div style="text-align:center; width:100%; padding:20px; color:var(--text-dim);">背包目前空空如也。</div>`;
        return;
    }
    
    const sortedInv = [...state.rewards.inventory].sort((a,b) => b.timestamp - a.timestamp);
    sortedInv.forEach((item) => {
        const div = document.createElement("div");
        div.className = `inv-item ${item.rarity}`;
        div.onclick = () => openInventoryEdit(item.timestamp);
        div.innerHTML = `
            <span>${item.prize}</span>
            <span style="opacity:0.6; font-size:0.7rem;">(點擊編輯)</span>
        `;
        list.appendChild(div);
    });
}

function openInventoryAdd() {
    document.getElementById("inv-edit-title").innerText = "新增背包內容物";
    document.getElementById("inv-item-name").value = "";
    document.getElementById("inv-item-rarity").value = "Rare";
    document.getElementById("inv-item-ts").value = "";
    document.getElementById("btn-inv-delete").style.display = "none";
    openSheet('sheet-inventory-edit');
}

function openInventoryEdit(ts) {
    const item = state.rewards.inventory.find(i => i.timestamp === ts);
    if (!item) return;

    document.getElementById("inv-edit-title").innerText = "編輯背包內容物";
    document.getElementById("inv-item-name").value = item.prize;
    document.getElementById("inv-item-rarity").value = item.rarity;
    document.getElementById("inv-item-ts").value = item.timestamp;
    document.getElementById("btn-inv-delete").style.display = "block";
    openSheet('sheet-inventory-edit');
}

function saveInventoryItem() {
    const name = document.getElementById("inv-item-name").value.trim();
    const rarity = document.getElementById("inv-item-rarity").value;
    const ts = document.getElementById("inv-item-ts").value;

    if (!name) return alert("請輸入獎項名稱");

    if (ts) {
        // Edit
        const item = state.rewards.inventory.find(i => i.timestamp == ts);
        if (item) {
            item.prize = name;
            item.rarity = rarity;
        }
    } else {
        // Add
        if (!state.rewards.inventory) state.rewards.inventory = [];
        state.rewards.inventory.push({
            prize: name,
            rarity: rarity,
            timestamp: Date.now()
        });
    }

    save();
    renderRewards();
    closeSheets();
}

function deleteInventoryItem() {
    const ts = document.getElementById("inv-item-ts").value;
    if (ts && confirm("確定要移除這項內容嗎？")) {
        state.rewards.inventory = state.rewards.inventory.filter(i => i.timestamp != ts);
        save();
        renderRewards();
        closeSheets();
    }
}

function consumeItem(index) {
    if (confirm("要使用或移除這項獎勵嗎？")) {
        const sortedInv = [...state.rewards.inventory].sort((a,b) => b.timestamp - a.timestamp);
        const itemToRemove = sortedInv[index];
        const realIndex = state.rewards.inventory.findIndex(i => i.timestamp === itemToRemove.timestamp && i.prize === itemToRemove.prize);
        
        if (realIndex > -1) {
            state.rewards.inventory.splice(realIndex, 1);
            save();
            renderRewards();
        }
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
    if (view === 'focus') {
        updateFocusDisplay();
        renderFocusSummary();
        // Sync toggle UI
        const toggle = document.getElementById("toggle-wake-lock");
        if (toggle) toggle.checked = state.settings.wakeLockEnabled || false;
    }
    if (view === 'rewards') renderRewards();
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
        
        // Enhancement: Calculate remaining for ticket
        let rewardProgressHtml = '';
        if (h.rewardSettings && h.rewardSettings.enabled) {
            const threshold = h.rewardSettings.threshold || 10;
            const remaining = threshold - (totalCount % threshold);
            rewardProgressHtml = `<div style="font-size: 0.75rem; color: #f59e0b; margin-top: 4px; font-weight: 600;">🎟️ 再累積 ${remaining} 次抽獎券</div>`;
        }
        
        const card = document.createElement("div");
        card.className = "habit-card";
        card.innerHTML = `
            <div class="habit-info" onclick="openHabitDetails(${h.id})">
                <div>
                    <div class="habit-name">${h.name}</div>
                    <div class="habit-stats-mini">今日累積 ${todayCount} | 總計 ${totalCount}</div>
                    ${rewardProgressHtml}
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

    // A. Specific Habit Breakdown
    state.habits.forEach(h => {
        const hCard = document.createElement("div");
        hCard.className = "chart-card";
        const total = h.logs.length;
        
        // Calculate milestones (e.g., every 50 logs is a level)
        const progress = Math.min((total % 50) / 50 * 100, 100);
        const level = Math.floor(total / 50) + 1;

        hCard.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <span style="font-weight:700;">${h.name}</span>
                <span style="color:var(--primary); font-weight:800; font-size:1.1rem;">${total} <small style="font-size:0.7rem; opacity:0.6;">次成就</small></span>
            </div>
            
            <div style="margin-bottom:16px;">
                <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:var(--text-dim); margin-bottom:4px;">
                    <span>階段 ${level} 進度</span>
                    <span>${total % 50} / 50</span>
                </div>
                <div style="height:6px; background:var(--card-light); border-radius:3px; overflow:hidden;">
                    <div style="height:100%; width:${progress}%; background:linear-gradient(to right, var(--primary), var(--secondary)); transition: width 1s ease;"></div>
                </div>
            </div>

            <div style="display:flex; flex-wrap:wrap; gap:4px;">
                ${renderMiniHeatmap(h.logs)}
            </div>
            <p style="font-size:0.65rem; color:var(--text-dim); margin-top:8px; text-align:right;">過去 28 天熱力分布</p>
        `;
        container.appendChild(hCard);
    });
}

function renderMiniHeatmap(logs) {
    // Use local date strings to group logs
    const logCountsByDate = {};
    logs.forEach(ts => {
        const d = new Date(ts);
        const s = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
        logCountsByDate[s] = (logCountsByDate[s] || 0) + 1;
    });

    let html = "";
    const now = new Date();
    for (let i = 27; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const s = `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getDate().toString().padStart(2,'0')}`;
        const count = logCountsByDate[s] || 0;
        
        let levelClass = "";
        if (count > 0) {
            if (count >= 4) levelClass = "lvl-4";
            else if (count >= 3) levelClass = "lvl-3";
            else if (count >= 2) levelClass = "lvl-2";
            else levelClass = "lvl-1";
        }
        
        html += `<div class="cell ${levelClass}" style="width:11px; height:11px; border-radius:2px;"></div>`;
    }
    return html;
}

// 5. UI Helpers
function openSheet(id) {
    if (id === 'sheet-prize-pool') {
        const pool = state.rewards.prizePool;
        document.getElementById("pool-rare").value = pool.Rare ? pool.Rare.join(", ") : "";
        document.getElementById("pool-epic").value = pool.Epic ? pool.Epic.join(", ") : "";
        document.getElementById("pool-legendary").value = pool.Legendary ? pool.Legendary.join(", ") : "";
    }
    
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
        
        // Force ticket check retroactively
        if (habit.rewardSettings && habit.rewardSettings.enabled) {
            if (!habit.rewardSettings.lifetimeTickets) habit.rewardSettings.lifetimeTickets = 0;
            const expectedTickets = Math.floor(habit.logs.length / habit.rewardSettings.threshold);
            if (expectedTickets > habit.rewardSettings.lifetimeTickets) {
                const newTickets = expectedTickets - habit.rewardSettings.lifetimeTickets;
                state.rewards.tickets += newTickets;
                habit.rewardSettings.lifetimeTickets = expectedTickets;
                alert(`補登成功！並額外獲得了 ${newTickets} 張抽獎券！`);
            } else {
                alert("補登成功！");
            }
        } else {
            alert("補登成功！");
        }
    }
}

function addFocusBackLog() {
    const dateInput = document.getElementById("focus-backlog-date").value;
    const durationInput = parseInt(document.getElementById("focus-backlog-duration").value) || 25;
    
    if (!dateInput) {
        alert("請選擇補登日期");
        return;
    }
    
    const timestamp = new Date(`${dateInput}T12:00`).getTime();
    state.focusLogs.push({ timestamp, duration: durationInput });
    checkFocusRewards();
    save();
    
    renderFocusSummary();
    closeSheets();
    alert("專注時間補登成功！");
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

    // Generate Weekly Chart for THIS habit only
    const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const counts = Array(7).fill(0);
    const ONE_DAY = 1000 * 60 * 60 * 24;
    
    h.logs.forEach(ts => {
        const logDate = new Date(ts);
        const logDayStart = new Date(logDate.getFullYear(), logDate.getMonth(), logDate.getDate()).getTime();
        const dayDiff = Math.floor((todayStart - logDayStart) / ONE_DAY);
        if (dayDiff >= 0 && dayDiff < 7) counts[6 - dayDiff]++;
    });

    const max = Math.max(...counts, 1);
    let chartHtml = `<div class="bar-grid" style="margin-top:10px; height: 100px;">`;
    for (let i = 0; i < 7; i++) {
        const labelDate = new Date(todayStart - (6 - i) * ONE_DAY);
        const label = dayLabels[labelDate.getDay()];
        const height = Math.max((counts[i] / max) * 100, 2);
        chartHtml += `
            <div class="bar-wrap">
                <div style="font-size:0.7rem; color:var(--primary); margin-bottom:4px; opacity:${counts[i]>0?1:0}">${counts[i]}</div>
                <div class="bar" style="height: ${height}%"></div>
                <div class="bar-label">${label}</div>
            </div>
        `;
    }
    chartHtml += `</div>`;

    content.innerHTML = `
        <div style="position: sticky; top: -32px; background: var(--card); z-index: 10; padding: 16px 0; margin: -16px 0 16px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border);">
            <h2 style="margin:0;">管理項目</h2>
            <button onclick="closeSheets()" style="background:var(--card-light); border:1px solid var(--border); color:var(--text); width:36px; height:36px; border-radius:50%; font-size:1.2rem; display:flex; align-items:center; justify-content:center; cursor:pointer;">×</button>
        </div>
        
        <div class="input-group">
            <label>項目名稱</label>
            <input type="text" value="${h.name}" onchange="updateHabitName(${h.id}, this.value)">
        </div>

        <div class="backfill-section" style="margin-top:0;">
            <label style="font-size: 0.8rem; font-weight:700; color:var(--text-dim);">📊 專屬週成長趨勢</label>
            ${chartHtml}
        </div>

        <div class="backfill-section">
            <label style="font-size: 0.8rem; font-weight:700; color:var(--primary);">🎁 抽獎券任務設定</label>
            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:12px;">
                <span style="font-size:0.9rem;">啟用賺取抽獎券</span>
                <input type="checkbox" ${h.rewardSettings.enabled ? 'checked' : ''} onchange="toggleHabitReward(${h.id}, this.checked)" style="width:20px; height:20px; accent-color:var(--primary);">
            </div>
            ${h.rewardSettings.enabled ? `
            <div style="margin-top:12px; display:flex; align-items:center; gap:8px;">
                <span style="font-size:0.9rem;">每累積</span>
                <input type="number" value="${h.rewardSettings.threshold}" min="1" max="100" onchange="updateHabitRewardThreshold(${h.id}, this.value)" style="width:60px; padding:8px; border-radius:8px; background:var(--bg); color:white; border:1px solid var(--border); text-align:center;">
                <span style="font-size:0.9rem;">次，獲得 1 張抽獎券</span>
            </div>` : ''}
        </div>

        <label style="font-size: 0.8rem; color: var(--text-dim); display:block; margin-top: 24px; margin-bottom: 8px;">最近 50 筆紀錄</label>
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
            <button class="btn-full primary-btn" style="padding:14px; margin-bottom:12px;" onclick="closeSheets()">確認並關閉</button>
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

function toggleHabitReward(id, enabled) {
    const h = state.habits.find(x => x.id === id);
    if (h) {
        h.rewardSettings.enabled = enabled;
        save();
        openHabitDetails(id); // Re-render to show/hide threshold input
    }
}

function updateHabitRewardThreshold(id, value) {
    const h = state.habits.find(x => x.id === id);
    if (h) {
        let val = parseInt(value);
        if (isNaN(val) || val < 1) val = 1;
        h.rewardSettings.threshold = val;
        save();
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
