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
    settings: { theme: 'dark', wakeLockEnabled: false, focusRewardHours: 7, focusRewardMinutes: 0, autoRecoverTimer: true, autoRecoverCap: 120 }
};

// Migration: Upgrade existing specific data without overriding old
function migrate() {
    // Port missing Top level structures specifically
    if (!state.focusLogs) state.focusLogs = [];
    if (!state.rewards) state.rewards = { tickets: 0, prizePool: { Rare: ["75 NT"], Epic: ["175 NT", "衣服"], Legendary: ["375 NT", "遊戲"] }, missTime: { Rare: 0, Epic: 0 }, inventory: [] };
    if (!state.settings) state.settings = { theme: 'dark', wakeLockEnabled: false };
    if (!state.settings.wakeLockEnabled) state.settings.wakeLockEnabled = false;
    if (state.settings.focusRewardHours === undefined) state.settings.focusRewardHours = 7;
    if (state.settings.focusRewardMinutes === undefined) state.settings.focusRewardMinutes = 0;
    if (state.settings.autoRecoverTimer === undefined) state.settings.autoRecoverTimer = true;
    if (state.settings.autoRecoverCap === undefined) state.settings.autoRecoverCap = 120;

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

    // Ensure all existing habits have rewardSettings + card system fields
    let modified = false;
    state.habits.forEach(h => {
        if (!h.rewardSettings) {
            h.rewardSettings = { enabled: false, threshold: 10 };
            modified = true;
        }
        // Migrate old lifetimeTickets to card-based system
        const rs = h.rewardSettings;
        if (rs.lifetimeTickets !== undefined && rs.cardsCompleted === undefined) {
            rs.cardsCompleted = rs.lifetimeTickets || 0;
            rs.currentProgress = h.logs.length % (rs.threshold || 10);
            modified = true;
        }
        if (rs.cardsCompleted === undefined) {
            rs.cardsCompleted = 0;
            rs.currentProgress = 0;
            modified = true;
        }
    });

    if (modified) save();
}

function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Ensure habit has card-based reward fields (migrate from old lifetimeTickets on the fly)
function normalizeRewardSettings(h) {
    if (!h.rewardSettings) {
        h.rewardSettings = { enabled: false, threshold: 10, cardsCompleted: 0, currentProgress: 0 };
    }
    const rs = h.rewardSettings;
    if (rs.cardsCompleted === undefined) {
        rs.cardsCompleted = rs.lifetimeTickets || 0;
        rs.currentProgress = h.logs.length % (rs.threshold || 10);
    }
    if (rs.currentProgress === undefined) {
        rs.currentProgress = 0;
    }
    return rs;
}

// 2. Action Logic
let lastAction = null;

function logHabit(id) {
    const habit = state.habits.find(h => h.id === id);
    if (!habit) return;

    const now = Date.now();
    habit.logs.push(now);
    lastAction = { type: 'log', habitId: id, timestamp: now, ticketsAwarded: 0 };

    // Card-based reward system (集點卡原理)
    if (habit.rewardSettings && habit.rewardSettings.enabled) {
        const rs = normalizeRewardSettings(habit);
        const threshold = rs.threshold || 10;

        rs.currentProgress++;

        if (rs.currentProgress >= threshold) {
            const newCards = Math.floor(rs.currentProgress / threshold);
            rs.cardsCompleted += newCards;
            rs.currentProgress = rs.currentProgress % threshold;
            state.rewards.tickets += newCards;
            lastAction.ticketsAwarded = newCards;
            alert(`🎉 恭喜！達成目標，獲得了 ${newCards} 張抽獎券！`);
        }
    }

    save();
    renderHabits();
    showToast('已紀錄成功！', { style: 'success', action: { label: '復原', onClick: undoLastLog } });
}

function undoLastLog() {
    if (!lastAction) return;
    const habit = state.habits.find(h => h.id === lastAction.habitId);
    if (habit) {
        const index = habit.logs.indexOf(lastAction.timestamp);
        if (index > -1) {
            habit.logs.splice(index, 1);
            // 撤回集點進度（已兌換的票券不回收）
            if (habit.rewardSettings && habit.rewardSettings.enabled) {
                const rs = normalizeRewardSettings(habit);
                if (rs.currentProgress > 0) {
                    rs.currentProgress--;
                }
            }
            save();
            renderHabits();
            hideToast();
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

    // If timer is running and user turns OFF wake lock, hide the re-enter button
    const reenterBtn = document.getElementById("btn-focus-reenter");
    if (reenterBtn) {
        if (!enabled || !focusInterval) {
            reenterBtn.style.display = "none";
        } else if (enabled && focusInterval && !document.getElementById("screen-protection-overlay").classList.contains("active")) {
            reenterBtn.style.display = "block";
        }
    }
}

async function enableScreenProtection() {
    if (!state.settings.wakeLockEnabled) return;

    // Request screen wake lock
    if (navigator.wakeLock && !wakeLock) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {
                console.log('Screen Wake Lock released');
                wakeLock = null;
                // Update UI button if we're in focus view
                const reenterBtn = document.getElementById("btn-focus-reenter");
                if (reenterBtn && focusInterval) reenterBtn.style.display = "block";
            });
        } catch (err) {
            console.error('Wake Lock error:', err.name, err.message);
        }
    }

    // Show protection overlay
    document.getElementById("screen-protection-overlay").classList.add("active");
    // Request Fullscreen to hide system status bar and home buttons
    if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => { });
    }

    // Hide re-enter button because we are now protected
    const reenterBtn = document.getElementById("btn-focus-reenter");
    if (reenterBtn) reenterBtn.style.display = "none";
}

function disableScreenProtection() {
    document.getElementById("screen-protection-overlay").classList.remove("active");
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => { });
    }
    // If timer is still running, show re-enter button
    const reenterBtn = document.getElementById("btn-focus-reenter");
    if (reenterBtn && focusInterval && state.settings.wakeLockEnabled) {
        reenterBtn.style.display = "block";
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

    // Request screen wake lock if enabled (skip during rest)
    if (state.settings.wakeLockEnabled && focusMode !== 'rest') {
        await enableScreenProtection();
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

    // 持久化計時狀態，防止頁面被手勢返回卸載後遺失
    if (focusTimerMode === 'stopwatch' || focusMode === 'work') {
        state._activeTimer = {
            mode: focusTimerMode,
            startTime: focusStartTime,
            focusMode: focusMode,
            focusTimeLeft: focusTimeLeft
        };
        save();
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
    state._activeTimer = null;  // 正常結束，清除持久化狀態

    if (focusTimerMode === 'pomodoro') {
        if (focusMode === 'rest') {
            focusMode = 'work';
            const label = document.getElementById("focus-mode-label");
            label.innerText = "工作模式";
            label.style.color = "var(--text-dim)";
            document.querySelector(".timer-progress").style.stroke = "var(--primary)";
        }
        focusTimeLeft = TOTAL_FOCUS_TIME;
    } else {
        focusTimeLeft = 0;
    }

    updateFocusDisplay();

    document.getElementById("btn-focus-start").style.display = "block";
    document.getElementById("btn-focus-stop").style.display = "none";
    document.getElementById("btn-focus-reenter").style.display = "none";
}

function completeFocusSession() {
    playSound('complete');
    clearInterval(focusInterval);
    focusInterval = null;
    state._activeTimer = null;  // 正常結束，清除持久化狀態

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
        updateFocusDisplay();
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

function getFocusRewardThreshold() {
    const h = state.settings.focusRewardHours || 7;
    const m = state.settings.focusRewardMinutes || 0;
    return h * 60 + m;
}

function formatFocusThreshold() {
    const h = state.settings.focusRewardHours || 7;
    const m = state.settings.focusRewardMinutes || 0;
    if (m > 0) return `${h} 小時 ${m} 分鐘`;
    return `${h} 小時`;
}

function checkFocusRewards() {
    const totalMinutes = state.focusLogs.reduce((acc, curr) => acc + curr.duration, 0);
    const threshold = getFocusRewardThreshold();
    if (threshold <= 0) return;

    const expectedTickets = Math.floor(totalMinutes / threshold);

    if (!state.rewards.lifetimeFocusTickets) state.rewards.lifetimeFocusTickets = 0;

    if (expectedTickets > state.rewards.lifetimeFocusTickets) {
        const newTickets = expectedTickets - state.rewards.lifetimeFocusTickets;
        state.rewards.tickets += newTickets;
        state.rewards.lifetimeFocusTickets = expectedTickets;
    }
}

function renderFocusSummary() {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const now = new Date();
    const dayOfWeek = now.getDay();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1)).setHours(0, 0, 0, 0);

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
                <div style="font-size:1.2rem; font-weight:800; color:var(--primary);">${Math.floor(weekMins / 60)}h ${weekMins % 60}m</div>
            </div>
            <div class="stat-card">
                <div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:4px;">歷史總計</div>
                <div style="font-size:1.2rem; font-weight:800; color:white;">${Math.floor(totalMins / 60)}h ${totalMins % 60}m</div>
            </div>
        `;
    }

    const summaryEl = document.getElementById("focus-today-total");
    if (summaryEl) summaryEl.innerText = `${Math.floor(todayMins / 60)}h ${todayMins % 60}m`;

    // Reward Progress Bar
    const progressText = document.getElementById("reward-progress-text");
    const progressBar = document.getElementById("reward-progress-bar");
    const rewardLabel = document.getElementById("reward-threshold-label");
    if (progressText && progressBar) {
        const threshold = getFocusRewardThreshold();
        const currentProgress = totalMins % threshold;
        const remaining = threshold - currentProgress;

        progressText.innerText = `${currentProgress} / ${threshold} min`;
        progressBar.style.width = `${(currentProgress / threshold) * 100}%`;

        if (rewardLabel) {
            rewardLabel.innerText = `每專注滿 ${formatFocusThreshold()} 可獲得 1 張抽獎券`;
        }

        if (remaining <= 60) {
            progressText.innerHTML = `<span style="color:#f59e0b; font-weight:bold;">再專注 ${remaining} 分鐘即可獲得獎券！</span>`;
        }
    }

    // Populate focus reward config inputs
    const hoursInput = document.getElementById("focus-reward-hours");
    const minutesInput = document.getElementById("focus-reward-minutes");
    if (hoursInput) hoursInput.value = state.settings.focusRewardHours || 7;
    if (minutesInput) minutesInput.value = state.settings.focusRewardMinutes || 0;
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
        switch (rarity) {
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

function togglePityProgress() {
    const pityProgress = document.getElementById("pity-progress");
    const pityTrigger = document.getElementById("pity-trigger");
    const isExpanded = pityProgress.classList.contains("pity-expanded");

    if (isExpanded) {
        // 收合
        pityProgress.classList.remove("pity-expanded");
        pityProgress.classList.add("pity-collapsed");
        pityTrigger.classList.remove("active");
    } else {
        // 展開：🎯 按鈕變深色，保底進度滑出
        pityTrigger.classList.add("active");
        pityProgress.classList.remove("pity-collapsed");
        pityProgress.classList.add("pity-expanded");
    }
}

function renderRewards() {
    document.getElementById("ticket-count").innerText = state.rewards.tickets || 0;

    // 更新保底進度
    const rarePity = state.rewards.missTime.Rare || 0;
    const epicPity = state.rewards.missTime.Epic || 0;
    const rareRemain = 9 - rarePity;
    const epicRemain = 9 - epicPity;
    const pityRareBar = document.getElementById("pity-rare-bar");
    const pityEpicBar = document.getElementById("pity-epic-bar");
    const pityHeaderRare = document.getElementById("pity-header-rare");
    const pityHeaderEpic = document.getElementById("pity-header-epic");
    if (pityRareBar) {
        pityRareBar.style.width = Math.min((rarePity / 9) * 100, 100) + "%";
    }
    if (pityEpicBar) {
        pityEpicBar.style.width = Math.min((epicPity / 9) * 100, 100) + "%";
    }
    if (pityHeaderRare) pityHeaderRare.innerText = rareRemain;
    if (pityHeaderEpic) pityHeaderEpic.innerText = epicRemain;

    const list = document.getElementById("inventory-list");
    list.innerHTML = "";

    if (!state.rewards.inventory || state.rewards.inventory.length === 0) {
        list.innerHTML = `<div style="text-align:center; width:100%; padding:20px; color:var(--text-dim);">背包目前空空如也。</div>`;
        return;
    }

    const sortedInv = [...state.rewards.inventory].sort((a, b) => b.timestamp - a.timestamp);
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
        const sortedInv = [...state.rewards.inventory].sort((a, b) => b.timestamp - a.timestamp);
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
        // 補登通知
        if (window.__recoveryInfo) {
            const info = window.__recoveryInfo;
            const d = new Date(info.startTime);
            const timeStr = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
            const dateStr = d.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
            const msg = info.elapsedMins > 0
                ? `偵測到中斷的計時：自 ${dateStr} ${timeStr} 起已自動補登 ${info.elapsedMins} 分鐘`
                : `偵測到中斷的計時：自 ${dateStr} ${timeStr} 起未滿 1 分鐘，未補登`;
            showToast(msg);
            window.__recoveryInfo = null;
        }
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

    const todayStart = new Date().setHours(0, 0, 0, 0);
    const todayEnd = new Date().setHours(23, 59, 59, 999);

    state.habits.forEach(h => {
        const todayCount = h.logs.filter(ts => ts >= todayStart && ts <= todayEnd).length;
        const totalCount = h.logs.length;

        // Card-based reward progress display
        let rewardProgressHtml = '';
        if (h.rewardSettings && h.rewardSettings.enabled) {
            const rs = normalizeRewardSettings(h);
            const threshold = rs.threshold || 10;
            const remaining = threshold - rs.currentProgress;
            rewardProgressHtml = `<div style="font-size: 0.75rem; color: #f59e0b; margin-top: 4px; font-weight: 600;">🎟️ 再 ${remaining} 次換抽獎券</div>`;
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
        const s = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
        logCountsByDate[s] = (logCountsByDate[s] || 0) + 1;
    });

    let html = "";
    const now = new Date();
    for (let i = 27; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const s = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
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
    if (id === 'sheet-focus-backfill') {
        renderFocusBackfillForm('focus-backfill-content', 'focus-backlog', false);
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
        // 刪除時簡單 -1 進度（已兌換票券不回收）
        if (habit.rewardSettings && habit.rewardSettings.enabled) {
            const rs = normalizeRewardSettings(habit);
            rs.currentProgress = rs.currentProgress - 1;
        }
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

        // Card-based reward check for backfill (must be before save/render)
        let msg = "補登成功！";
        if (habit.rewardSettings && habit.rewardSettings.enabled) {
            const rs = normalizeRewardSettings(habit);
            const threshold = rs.threshold || 10;
            rs.currentProgress++;

            if (rs.currentProgress >= threshold) {
                const newCards = Math.floor(rs.currentProgress / threshold);
                rs.cardsCompleted += newCards;
                rs.currentProgress = rs.currentProgress % threshold;
                state.rewards.tickets += newCards;
                msg = `補登成功！並額外獲得了 ${newCards} 張抽獎券！`;
            }
        }

        save();
        openHabitDetails(habitId);
        renderHabits();
        alert(msg);
    }
}

function saveFocusRewardSettings() {
    const hoursInput = document.getElementById("focus-reward-hours");
    const minutesInput = document.getElementById("focus-reward-minutes");
    if (!hoursInput || !minutesInput) return;
    const h = parseInt(hoursInput.value);
    const m = parseInt(minutesInput.value);
    state.settings.focusRewardHours = Math.max(0, isNaN(h) ? 7 : h);
    state.settings.focusRewardMinutes = Math.max(0, Math.min(59, isNaN(m) ? 0 : m));
    if (getFocusRewardThreshold() <= 0) {
        state.settings.focusRewardHours = 7;
        state.settings.focusRewardMinutes = 0;
    }
    save();
    checkFocusRewards();
    renderFocusSummary();
    // 若 details sheet 開啟中則刷新
    if (document.getElementById("sheet-focus-details").classList.contains("open")) {
        openFocusDetails();
    }
}

function openFocusDetails() {
    const content = document.getElementById("focus-details-content");
    if (!content) return;

    const ONE_DAY = 86400000;
    const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    // --- Weekly focus trend (last 7 days) ---
    const dailyMins = Array(7).fill(0);
    state.focusLogs.forEach(log => {
        const logDayStart = new Date(new Date(log.timestamp).getFullYear(), new Date(log.timestamp).getMonth(), new Date(log.timestamp).getDate()).getTime();
        const dayDiff = Math.floor((todayStart - logDayStart) / ONE_DAY);
        if (dayDiff >= 0 && dayDiff < 7) dailyMins[6 - dayDiff] += log.duration;
    });

    // 以 120 分鐘（2 小時）為滿格基準；若該週有超過者則動態拉高
    const scale = Math.max(...dailyMins, 120);
    let chartHtml = `<div class="bar-grid">`;
    for (let i = 0; i < 7; i++) {
        const labelDate = new Date(todayStart - (6 - i) * ONE_DAY);
        const label = dayLabels[labelDate.getDay()];
        const pct = dailyMins[i] > 0 ? Math.max((dailyMins[i] / scale) * 100, 3) : 0;
        chartHtml += `
            <div class="bar-wrap">
                <div style="font-size:0.7rem; color:var(--primary); margin-bottom:4px; opacity:${dailyMins[i] > 0 ? 1 : 0}">${dailyMins[i]}m</div>
                <div class="bar" style="height:${pct}%"></div>
                <div class="bar-label">${label}</div>
            </div>`;
    }
    chartHtml += `</div>`;

    // --- Recent focus records ---
    const sortedLogs = [...state.focusLogs].sort((a, b) => b.timestamp - a.timestamp);
    let historyHtml = '';
    if (sortedLogs.length > 0) {
        historyHtml = sortedLogs.slice(0, 50).map(log => {
            const d = new Date(log.timestamp);
            const dateStr = d.toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });
            const timeStr = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
            return `
                <div class="history-item">
                    <div><strong>${dateStr}</strong> <span>${timeStr}</span></div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span style="color:var(--primary); font-weight:600;">${log.duration} 分鐘</span>
                        <button class="btn-mini-del" onclick="deleteFocusLog(${log.timestamp})">刪除</button>
                    </div>
                </div>`;
        }).join("");
    }

    // --- Build full sheet ---
    const h = state.settings.focusRewardHours || 7;
    const m = state.settings.focusRewardMinutes || 0;

    content.innerHTML = `
        <div style="position:sticky; top:-32px; background:var(--card); z-index:10; padding:16px 0; margin:-16px 0 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border);">
            <h2 style="margin:0;">專注管理</h2>
            <button onclick="closeSheets()" style="background:var(--card-light); border:1px solid var(--border); color:var(--text); width:36px; height:36px; border-radius:50%; font-size:1.2rem; display:flex; align-items:center; justify-content:center; cursor:pointer;">×</button>
        </div>

        <div class="backfill-section" style="margin-top:0;">
            <label style="font-size:0.8rem; font-weight:700; color:var(--text-dim);">📊 本週專注趨勢</label>
            ${chartHtml}
        </div>

        <div class="backfill-section">
            <label style="font-size:0.8rem; font-weight:700; color:var(--primary);">🎯 獎勵門檻設定</label>
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-top:12px;">
                <input type="number" id="focus-reward-hours" min="0" max="999" value="${h}"
                    style="width:56px; padding:8px; border-radius:8px; background:var(--bg); color:white; border:1px solid var(--border); text-align:center;">
                <span style="font-size:0.9rem;">小時</span>
                <input type="number" id="focus-reward-minutes" min="0" max="59" value="${m}"
                    style="width:56px; padding:8px; border-radius:8px; background:var(--bg); color:white; border:1px solid var(--border); text-align:center;">
                <span style="font-size:0.9rem;">分鐘</span>
                <button onclick="saveFocusRewardSettings()"
                    style="background:var(--primary); color:white; border:none; padding:8px 14px; border-radius:8px; font-size:0.8rem; font-weight:600; cursor:pointer;">儲存</button>
            </div>
            <p style="font-size:0.65rem; color:var(--text-dim); margin-top:8px;">每專注滿 ${formatFocusThreshold()} 可獲得 1 張抽獎券</p>
        </div>

        ${sortedLogs.length > 0 ? `
        <label style="font-size:0.8rem; color:var(--text-dim); display:block; margin-top:24px; margin-bottom:8px;">最近 50 筆專注紀錄</label>
        <div class="log-history">${historyHtml}</div>` : ''}

        <div class="backfill-section" id="focus-details-backfill-container"></div>

        <div class="wake-lock-config" style="margin-top:24px; flex-direction:column; align-items:stretch; gap:0;">
            <div style="margin-bottom:8px; display:flex; align-items:center; justify-content:space-between;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:0.9rem; font-weight:600; color:var(--text);">自動補登中斷計時</span>
                    <span onclick="event.stopPropagation(); alert('App 關閉或手勢返回時若計時器仍在運行，重新開啟時自動將中斷期間的專注時間補登至紀錄。僅工作模式／正向計時會補登，休息模式不會。')"
                        style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; border-radius:50%; background:var(--card-light); color:var(--text-dim); font-size:0.9rem; font-weight:700; cursor:pointer; flex-shrink:0;">🛈</span>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" id="toggle-auto-recover" onchange="toggleAutoRecoverTimer(this.checked)"
                        ${state.settings.autoRecoverTimer ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>

            <div id="auto-recover-cap-row" class="auto-recover-cap-row ${state.settings.autoRecoverTimer ? 'cap-expanded' : 'cap-collapsed'}">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                    <span style="font-size:0.8rem; color:var(--text-dim);">補登時間上限</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <input type="number" id="auto-recover-cap" min="1" max="1440" value="${state.settings.autoRecoverCap || 120}"
                            onchange="saveAutoRecoverCap()"
                            style="width:60px; padding:6px 8px; border-radius:8px; background:var(--bg); color:white; border:1px solid var(--border); text-align:center; font-size:0.85rem;">
                        <span style="font-size:0.75rem; color:var(--text-dim);">分鐘</span>
                    </div>
                </div>
            </div>
        </div>

        <div style="border-top:1px solid var(--border); padding-top:24px;">
            <button class="btn-full primary-btn" style="padding:14px;" onclick="closeSheets()">確認並關閉</button>
        </div>
    `;
    openSheet("sheet-focus-details");
    // 以共用模組渲染補登表單
    renderFocusBackfillForm('focus-details-backfill-container', 'focus-details-backlog', true);
}

function toggleAutoRecoverTimer(enabled) {
    state.settings.autoRecoverTimer = enabled;
    save();
    const row = document.getElementById("auto-recover-cap-row");
    if (row) {
        if (enabled) {
            row.classList.remove("cap-collapsed");
            row.classList.add("cap-expanded");
        } else {
            row.classList.remove("cap-expanded");
            row.classList.add("cap-collapsed");
        }
    }
}

function saveAutoRecoverCap() {
    const input = document.getElementById("auto-recover-cap");
    if (!input) return;
    const val = parseInt(input.value, 10);
    if (isNaN(val) || val < 1) { input.value = state.settings.autoRecoverCap || 120; return; }
    state.settings.autoRecoverCap = Math.min(val, 1440);
    input.value = state.settings.autoRecoverCap;
    save();
}

function deleteFocusLog(timestamp) {
    if (!confirm("確定要刪除此筆專注紀錄嗎？")) return;
    const idx = state.focusLogs.findIndex(l => l.timestamp === timestamp);
    if (idx !== -1) state.focusLogs.splice(idx, 1);
    save();
    openFocusDetails(); // re-render
    renderFocusSummary();
}

// 共用的補登表單渲染（獨立 sheet 與 drawer 共用）
function renderFocusBackfillForm(containerId, idPrefix, fromDetails) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const today = new Date().toISOString().split('T')[0];
    container.innerHTML = `
        <h2>手動補登專注時間</h2>
        <p style="color: var(--text-dim); margin-bottom: 4px;">補回遺漏的工作時段。</p>
        <div style="display:flex; flex-direction:row; gap:12px">
        <div class="input-group">
            <label>日期</label>
            <input type="date" id="${idPrefix}-date" value="${today}"
                style="background:var(--bg); border:1px solid var(--border); color:white; padding:12px; border-radius:8px; font-size:0.9rem; width:100%;">
        </div>
        <div class="input-group">
            <label>時段總長 (分鐘)</label>
            <input type="number" id="${idPrefix}-duration" value="25" min="1"
                style="background:var(--bg); border:1px solid var(--border); color:white; padding:12px; border-radius:8px; font-size:0.9rem; width:100%; text-align:center;">
        </div>
        </div>
        <button class="btn-full primary-btn" style="margin-top:16px;"
            onclick="submitFocusBackfill('${idPrefix}', ${fromDetails})">確認補登</button>
        ${!fromDetails ? `
        <button class="btn-full" style="background:var(--card-light); margin-top:12px; color:var(--text-dim);"
            onclick="closeSheets()">取消</button>` : ''}
    `;
}

function submitFocusBackfill(idPrefix, fromDetails) {
    const dateInput = document.getElementById(`${idPrefix}-date`);
    const durationEl = document.getElementById(`${idPrefix}-duration`);
    const durationInput = parseInt(durationEl?.value) || 25;

    if (!dateInput || !dateInput.value) {
        alert("請選擇補登日期");
        return;
    }

    const timestamp = new Date(`${dateInput.value}T12:00`).getTime();
    state.focusLogs.push({ timestamp, duration: durationInput });
    checkFocusRewards();
    save();

    renderFocusSummary();
    if (fromDetails) {
        openFocusDetails();
    } else {
        closeSheets();
    }
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
    let chartHtml = `<div class="bar-grid">`;
    for (let i = 0; i < 7; i++) {
        const labelDate = new Date(todayStart - (6 - i) * ONE_DAY);
        const label = dayLabels[labelDate.getDay()];
        const height = Math.max((counts[i] / max) * 100, 2);
        chartHtml += `
            <div class="bar-wrap">
                <div style="font-size:0.7rem; color:var(--primary); margin-bottom:4px; opacity:${counts[i] > 0 ? 1 : 0}">${counts[i]}</div>
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
            ${h.rewardSettings.enabled ? (() => {
            const rs = normalizeRewardSettings(h);
            return `
            <div style="margin-top:8px; font-size:0.75rem; color:#f59e0b;">目前進度 ${rs.currentProgress} / ${rs.threshold}</div>
            <div style="margin-top:12px; display:flex; align-items:center; gap:8px;">
                <span style="font-size:0.9rem;">每累積</span>
                <input type="number" value="${rs.threshold}" min="1" max="100" onchange="updateHabitRewardThreshold(${h.id}, this.value)" style="width:60px; padding:8px; border-radius:8px; background:var(--bg); color:white; border:1px solid var(--border); text-align:center;">
                <span style="font-size:0.9rem;">次，獲得 1 張抽獎券</span>
            </div>`;
        })() : ''}
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
        const rs = normalizeRewardSettings(h);
        let val = parseInt(value);
        if (isNaN(val) || val < 1) val = 1;
        rs.threshold = val;

        // 門檻降低時，現有進度可能立刻達標 → 自動兌換
        if (rs.currentProgress >= val) {
            const newCards = Math.floor(rs.currentProgress / val);
            rs.cardsCompleted += newCards;
            rs.currentProgress = rs.currentProgress % val;
            state.rewards.tickets += newCards;
        }
        save();
        renderHabits();
        openHabitDetails(id);
    }
}

let toastTimer = null;

function showToast(msg, { style = 'default', action = null } = {}) {
    const toast = document.getElementById("app-toast");
    const fill = document.getElementById("app-toast-fill");
    const msgEl = document.getElementById("app-toast-msg");
    const btn = document.getElementById("app-toast-btn");
    if (!toast || !fill || !msgEl || !btn) return;

    if (toastTimer) clearTimeout(toastTimer);
    toast.classList.remove("show", "success");
    fill.classList.remove("counting");
    void fill.offsetWidth; // reflow reset

    msgEl.innerText = msg;
    if (style === 'success') toast.classList.add("success");

    if (action) {
        btn.style.display = "block";
        btn.innerText = action.label;
        btn.onclick = () => { action.onClick(); hideToast(); };
    } else {
        btn.style.display = "none";
    }

    toast.classList.add("show");
    fill.classList.add("counting");

    toastTimer = setTimeout(() => hideToast(), 5000);
}

function hideToast() {
    const toast = document.getElementById("app-toast");
    const fill = document.getElementById("app-toast-fill");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = null;
    if (fill) fill.classList.remove("counting");
    if (toast) toast.classList.remove("show");
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

function validateAndImportData(jsonString, sourceLabel) {
    let imported;
    try {
        imported = JSON.parse(jsonString);
    } catch (err) {
        return { ok: false, error: 'JSON 格式解析失敗，請確認檔案內容是否完整。' };
    }

    if (!imported || typeof imported !== 'object') {
        return { ok: false, error: '檔案內容不是有效的 HabitFlow Pro 資料格式。' };
    }

    if (!Array.isArray(imported.habits)) {
        return { ok: false, error: '資料缺少 habits 陣列，這不是有效的備份檔。' };
    }

    // 補完缺失的頂層欄位，確保舊版備份也能匯入
    if (!Array.isArray(imported.focusLogs)) imported.focusLogs = [];
    if (!imported.rewards || typeof imported.rewards !== 'object') {
        imported.rewards = {
            tickets: 0,
            prizePool: { Rare: ["75 NT"], Epic: ["175 NT", "衣服"], Legendary: ["375 NT", "遊戲"] },
            missTime: { Rare: 0, Epic: 0 },
            inventory: []
        };
    } else {
        if (!imported.rewards.prizePool || typeof imported.rewards.prizePool !== 'object') {
            imported.rewards.prizePool = { Rare: ["75 NT"], Epic: ["175 NT", "衣服"], Legendary: ["375 NT", "遊戲"] };
        }
        if (!imported.rewards.missTime || typeof imported.rewards.missTime !== 'object') {
            imported.rewards.missTime = { Rare: 0, Epic: 0 };
        }
        if (!Array.isArray(imported.rewards.inventory)) imported.rewards.inventory = [];
        if (typeof imported.rewards.tickets !== 'number') imported.rewards.tickets = 0;
        if (typeof imported.rewards.lifetimeFocusTickets !== 'number') imported.rewards.lifetimeFocusTickets = 0;
    }
    if (!imported.settings || typeof imported.settings !== 'object') {
        imported.settings = { theme: 'dark', wakeLockEnabled: false, autoRecoverTimer: true, autoRecoverCap: 120 };
    } else {
        if (imported.settings.wakeLockEnabled === undefined) imported.settings.wakeLockEnabled = false;
        if (imported.settings.autoRecoverTimer === undefined) imported.settings.autoRecoverTimer = true;
        if (imported.settings.autoRecoverCap === undefined) imported.settings.autoRecoverCap = 120;
    }

    // 確保每個 habit 都有 rewardSettings
    imported.habits.forEach(h => {
        if (!h.rewardSettings) h.rewardSettings = { enabled: false, threshold: 10 };
    });

    return { ok: true, data: imported };
}

function importFromData(jsonString, sourceLabel) {
    const result = validateAndImportData(jsonString, sourceLabel);
    if (!result.ok) {
        return result;
    }

    state = result.data;
    save();
    migrate();
    save();
    renderHabits();
    closeSheets();
    return { ok: true };
}

function importFromText() {
    const text = prompt('請貼上備份 JSON 代碼：');
    if (!text) return;
    const result = importFromData(text, '剪貼簿');
    if (!result.ok) {
        alert(result.error);
    } else {
        alert('還原成功！');
    }
}

// Drag & Drop + File Import
function handleImportFile(file) {
    const fb = document.getElementById('drop-feedback');
    if (!file.name.toLowerCase().endsWith('.json')) {
        fb.className = 'drop-feedback error';
        fb.textContent = '僅接受 .json 備份檔案，請重新選擇。';
        fb.style.display = 'block';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const result = importFromData(e.target.result, file.name);
        fb.style.display = 'block';
        if (result.ok) {
            fb.className = 'drop-feedback success';
            fb.textContent = `已成功從「${file.name}」還原資料！`;
        } else {
            fb.className = 'drop-feedback error';
            fb.textContent = result.error;
        }
    };
    reader.onerror = () => {
        fb.className = 'drop-feedback error';
        fb.textContent = '檔案讀取失敗，請再試一次。';
        fb.style.display = 'block';
    };
    reader.readAsText(file);
}

function setupDropZone() {
    const zone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const fb = document.getElementById('drop-feedback');
    if (!zone || !fileInput) return;

    // 點擊開啟檔案選擇器
    zone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) {
            handleImportFile(fileInput.files[0]);
            fileInput.value = '';
        }
    });

    // 阻止預設拖曳行為（防止瀏覽器直接開啟檔案）
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
        zone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
        document.body.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    zone.addEventListener('dragenter', () => {
        zone.classList.add('drag-over');
    });

    zone.addEventListener('dragover', () => {
        zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', (e) => {
        if (!zone.contains(e.relatedTarget)) {
            zone.classList.remove('drag-over');
        }
    });

    zone.addEventListener('drop', (e) => {
        zone.classList.remove('drag-over');
        fb.style.display = 'none';
        if (e.dataTransfer.files.length > 0) {
            handleImportFile(e.dataTransfer.files[0]);
        }
    });
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
(function init() {
    const dateEl = document.getElementById("display-date");
    if (dateEl) {
        const options = { month: 'long', day: 'numeric', weekday: 'long' };
        dateEl.innerText = new Date().toLocaleDateString('zh-TW', options);
    }

    // 首次載入：若 localStorage 無資料，自動載入測試資料集
    const hasExistingData = localStorage.getItem(STORAGE_KEY);
    if (!hasExistingData && window.__HABITFLOW_TEST_DATA__) {
        state = window.__HABITFLOW_TEST_DATA__;
        save();
        console.log('已載入測試資料集');
    }

    migrate();

    // 復原中斷的計時（手勢返回導致頁面卸載時），依設定開關決定是否啟用
    window.__recoveryInfo = null;
    if (state.settings.autoRecoverTimer && state._activeTimer && state._activeTimer.startTime) {
        const at = state._activeTimer;
        const now = Date.now();
        const elapsedSec = Math.round((now - at.startTime) / 1000);
        const rawMins = Math.floor(elapsedSec / 60);
        const cap = state.settings.autoRecoverCap || 120;
        const elapsedMins = Math.min(rawMins, cap);
        if (at.mode === 'stopwatch' || at.focusMode === 'work') {
            if (elapsedMins > 0) {
                state.focusLogs.push({ timestamp: now, duration: elapsedMins });
                checkFocusRewards();
                console.log(`復原中斷計時：已記錄 ${elapsedMins} 分鐘`);
            }
            window.__recoveryInfo = { startTime: at.startTime, elapsedMins };
        }
        state._activeTimer = null;
        save();
    }

    renderHabits();
    setupDropZone();

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
})();
