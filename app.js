// Data structure and Initialization
let data = JSON.parse(localStorage.getItem("habitFlowData")) || {
    habits: [],
};

// Migrate old data if necessary (simple check)
if (localStorage.getItem("habitData")) {
    const old = JSON.parse(localStorage.getItem("habitData"));
    if (old.habits && data.habits.length === 0) {
        data.habits = old.habits.map(h => ({
            id: Date.now() + Math.random(),
            name: h.name,
            logs: h.done ? { [new Date().toISOString().split("T")[0]]: 1 } : {},
            createdAt: new Date().toISOString()
        }));
        localStorage.removeItem("habitData");
        save();
    }
}

function today() {
    return new Date().toISOString().split("T")[0];
}

function save() {
    localStorage.setItem("habitFlowData", JSON.stringify(data));
    updateGlobalStats();
}

function toggleHabit(id) {
    const habit = data.habits.find(h => h.id === id);
    if (!habit) return;

    const date = today();
    habit.logs[date] = (habit.logs[date] || 0) + 1;
    
    save();
    render();
}

function deleteHabit(id) {
    if (confirm('確定要移除這個成長項目嗎？相關記錄也將消失。')) {
        data.habits = data.habits.filter(h => h.id !== id);
        save();
        render();
    }
}

function addHabit() {
    const input = document.getElementById("habitInput");
    const name = input.value.trim();
    if (!name) return;

    data.habits.push({
        id: Date.now(),
        name: name,
        logs: {},
        createdAt: new Date().toISOString()
    });

    input.value = "";
    save();
    render();
}

function updateGlobalStats() {
    let totalLogs = 0;
    data.habits.forEach(h => {
        Object.values(h.logs).forEach(count => totalLogs += count);
    });
    
    const statTotalLogs = document.getElementById("statTotalLogs");
    const statActiveHabits = document.getElementById("statActiveHabits");
    if (statTotalLogs) statTotalLogs.innerText = totalLogs;
    if (statActiveHabits) statActiveHabits.innerText = data.habits.length;
}

function switchView(view) {
    const habitsView = document.getElementById("habitsView");
    const dashView = document.getElementById("dashboardView");
    const hBtn = document.getElementById("viewHabits");
    const dBtn = document.getElementById("viewDash");

    if (view === 'habits') {
        habitsView.style.display = 'block';
        dashView.style.display = 'none';
        hBtn.classList.add('active');
        dBtn.classList.remove('active');
        render();
    } else {
        habitsView.style.display = 'none';
        dashView.style.display = 'block';
        hBtn.classList.remove('active');
        dBtn.classList.add('active');
        renderDashboard();
    }
}

function render() {
    const list = document.getElementById("habitList");
    if (!list) return;
    list.innerHTML = "";

    if (data.habits.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">還沒有任何記錄，點擊下方新增。</div>';
        return;
    }

    data.habits.forEach((h) => {
        const item = document.createElement("div");
        item.className = "habit-item";
        
        const todayCount = h.logs[today()] || 0;
        const totalCount = Object.values(h.logs).reduce((a, b) => a + b, 0);

        item.innerHTML = `
            <div class="habit-main">
                <span class="habit-title">${h.name}</span>
                <span class="habit-sub">今日累積: ${todayCount} | 總計: ${totalCount}</span>
            </div>
            <div class="habit-actions">
                <button onclick="deleteHabit(${h.id})" style="background:none; border:none; color:var(--text-muted); cursor:pointer;">×</button>
                <button class="log-btn" onclick="toggleHabit(${h.id})">+</button>
            </div>
        `;
        list.appendChild(item);
    });
}

function renderDashboard() {
    renderGlobalHeatmap();
    renderDetailedStats();
}

function renderGlobalHeatmap() {
    const grid = document.getElementById("globalHeatmap");
    grid.innerHTML = "";
    
    // Calculate combined logs for all habits
    const globalLogs = {};
    data.habits.forEach(h => {
        for (const [date, count] of Object.entries(h.logs)) {
            globalLogs[date] = (globalLogs[date] || 0) + count;
        }
    });

    const now = new Date();
    // Show last 20 weeks
    const daysToShow = 20 * 7;
    for (let i = daysToShow; i >= 0; i--) {
        const d = new Date();
        d.setDate(now.getDate() - i);
        const dateStr = d.toISOString().split("T")[0];
        const count = globalLogs[dateStr] || 0;
        
        const cell = document.createElement("div");
        cell.className = "cell";
        if (count > 0) {
            const level = Math.min(4, Math.ceil(count / 2)); // Adjust sensitivity
            cell.classList.add(`lvl-${level}`);
        }
        cell.title = `${dateStr}: ${count} 次成就`;
        grid.appendChild(cell);
    }
}

function renderDetailedStats() {
    const container = document.getElementById("habitStatsDetailed");
    container.innerHTML = "";

    data.habits.forEach(h => {
        const total = Object.values(h.logs).reduce((a, b) => a + b, 0);
        const card = document.createElement("div");
        card.className = "card";
        card.style.marginBottom = "12px";
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-weight:700;">${h.name}</span>
                <span style="color:var(--primary-light); font-weight:800;">${total} 次</span>
            </div>
            <div style="height:4px; background:var(--level-0); border-radius:2px; margin-top:8px; overflow:hidden;">
                <div style="height:100%; width:${Math.min(100, (total / 50) * 100)}%; background:var(--primary);"></div>
            </div>
        `;
        container.appendChild(card);
    });
}

// Handle Enter key
document.getElementById("habitInput")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") addHabit();
});

// Init
updateGlobalStats();
render();
