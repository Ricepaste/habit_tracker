// 1. Data Management
let data = JSON.parse(localStorage.getItem("habitFlowData")) || { habits: [] };

// Try to request persistent storage (Prevents browser from clearing data automatically)
if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then(persistent => {
        if (persistent) console.log("Storage will not be cleared except by explicit user action");
    });
}

function save() {
    localStorage.setItem("habitFlowData", JSON.stringify(data));
    updateGlobalStats();
}

// 2. Core Actions
function addHabit() {
    const input = document.getElementById("habitInput");
    const name = input.value.trim();
    if (!name) return;
    data.habits.push({ id: Date.now(), name, logs: {}, createdAt: new Date().toISOString() });
    input.value = "";
    save();
    render();
}

function toggleHabit(id) {
    const h = data.habits.find(x => x.id === id);
    if (!h) return;
    const d = new Date().toISOString().split("T")[0];
    h.logs[d] = (h.logs[d] || 0) + 1;
    save();
    render();
}

function deleteHabit(id) {
    if (confirm('確定移除？紀錄將永久刪除。')) {
        data.habits = data.habits.filter(x => x.id !== id);
        save();
        render();
    }
}

// 3. View Management
function switchView(v) {
    document.getElementById("habitsView").style.display = v === 'habits' ? 'block' : 'none';
    document.getElementById("dashboardView").style.display = v === 'dashboard' ? 'block' : 'none';
    document.getElementById("viewHabits").classList.toggle('active', v === 'habits');
    document.getElementById("viewDash").classList.toggle('active', v === 'dashboard');
    v === 'habits' ? render() : renderDashboard();
}

function render() {
    const list = document.getElementById("habitList");
    if (!list) return;
    list.innerHTML = data.habits.length ? "" : '<div style="text-align:center; padding:40px; color:var(--text-muted);">點擊下方新增成長。</div>';
    
    data.habits.forEach(h => {
        const div = document.createElement("div");
        div.className = "habit-item";
        const today = new Date().toISOString().split("T")[0];
        const count = h.logs[today] || 0;
        const total = Object.values(h.logs).reduce((a,b)=>a+b, 0);
        div.innerHTML = `
            <div class="habit-main">
                <span class="habit-title">${h.name}</span>
                <span class="habit-sub">今日: ${count} | 總計: ${total}</span>
            </div>
            <div class="habit-actions">
                <button onclick="deleteHabit(${h.id})" style="background:none; border:none; color:var(--text-muted); cursor:pointer;">×</button>
                <button class="log-btn" onclick="toggleHabit(${h.id})">+</button>
            </div>
        `;
        list.appendChild(div);
    });
}

function renderDashboard() {
    renderGlobalHeatmap();
    renderDetailedStats();
}

function renderGlobalHeatmap() {
    const grid = document.getElementById("globalHeatmap");
    grid.innerHTML = "";
    const logs = {};
    data.habits.forEach(h => Object.entries(h.logs).forEach(([d,c]) => logs[d] = (logs[d]||0)+c));
    
    const now = new Date();
    for(let i=140; i>=0; i--) {
        const d = new Date(); d.setDate(now.getDate()-i);
        const s = d.toISOString().split("T")[0];
        const c = logs[s] || 0;
        const cell = document.createElement("div");
        cell.className = "cell";
        if (c > 0) cell.classList.add(`lvl-${Math.min(4, Math.ceil(c/2))}`);
        grid.appendChild(cell);
    }
}

function renderDetailedStats() {
    const container = document.getElementById("habitStatsDetailed");
    container.innerHTML = "";
    data.habits.forEach(h => {
        const t = Object.values(h.logs).reduce((a,b)=>a+b, 0);
        const card = document.createElement("div");
        card.className = "card";
        card.style.marginBottom = "12px";
        card.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center;">
            <span>${h.name}</span><strong>${t} 次</strong>
        </div>`;
        container.appendChild(card);
    });
}

function updateGlobalStats() {
    let total = 0;
    data.habits.forEach(h => Object.values(h.logs).forEach(c => total += c));
    document.getElementById("statTotalLogs").innerText = total;
    document.getElementById("statActiveHabits").innerText = data.habits.length;
}

// 4. Safety & Backup Functions
function toggleModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function closeModal(e) {
    document.querySelectorAll('.overlay').forEach(el => el.style.display = 'none');
}

function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `habitflow-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const imported = JSON.parse(event.target.result);
            if (imported.habits) {
                data = imported;
                save();
                render();
                closeModal();
                alert('還原成功！');
            }
        } catch (err) { alert('無效的備份檔案'); }
    };
    reader.readAsText(file);
}

function copyToClipboardData() {
    const text = JSON.stringify(data);
    navigator.clipboard.writeText(text).then(() => alert('JSON 代碼已複製！請妥善保存至你的雲端筆記。'));
}

function importFromText() {
    const text = prompt('請貼上之前備份的 JSON 代碼：');
    if (!text) return;
    try {
        const imported = JSON.parse(text);
        if (imported.habits) {
            data = imported;
            save();
            render();
            closeModal();
            alert('還原成功！');
        }
    } catch (err) { alert('無效的代碼'); }
}

function forceUpdate() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
            for (let registration of registrations) {
                registration.unregister();
            }
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
updateGlobalStats();
render();
