// Data structure and Initialization
let data = JSON.parse(localStorage.getItem("habitData")) || {
    habits: [],
    lastDate: null,
};

// Ensure habits have unique IDs for better handling
if (data.habits.length > 0 && !data.habits[0].id) {
    data.habits = data.habits.map((h, i) => ({ ...h, id: Date.now() + i }));
    save();
}

function today() {
    return new Date().toISOString().split("T")[0];
}

function formatDate(dateStr) {
    const options = { month: 'long', day: 'numeric', weekday: 'long' };
    return new Date(dateStr).toLocaleDateString('zh-TW', options);
}

function dailyReset() {
    const currentDate = today();
    if (data.lastDate !== currentDate) {
        data.habits.forEach((h) => {
            // If the habit was donor yesterday, increase streak? 
            // Actually, simplest logic: if done today, it will be checked.
            // When day changes, if it wasn't done yesterday, streak resets.
            if (!h.done) {
                h.streak = 0;
            }
            // Reset done status for the new day
            h.done = false;
        });

        data.lastDate = currentDate;
        save();
    }
}

function save() {
    localStorage.setItem("habitData", JSON.stringify(data));
    updateStats();
}

function updateStats() {
    const total = data.habits.length;
    const doneCount = data.habits.filter(h => h.done).length;
    const completion = total === 0 ? 0 : Math.round((doneCount / total) * 100);
    
    document.getElementById("statCompletion").innerText = `${completion}%`;
    document.getElementById("statTotalHabits").innerText = total;
    document.getElementById("currentDate").innerText = formatDate(today());
}

function toggleHabit(id) {
    const habit = data.habits.find(h => h.id === id);
    if (habit) {
        const wasDone = habit.done;
        habit.done = !wasDone;
        
        if (habit.done) {
            habit.streak++;
        } else {
            habit.streak = Math.max(0, habit.streak - 1);
        }
        
        save();
        render();
    }
}

function deleteHabit(id) {
    if (confirm('確定要刪除這個習慣嗎？')) {
        data.habits = data.habits.filter(h => h.id !== id);
        save();
        render();
    }
}

function render() {
    const list = document.getElementById("habitList");
    list.innerHTML = "";

    if (data.habits.length === 0) {
        list.innerHTML = '<div class="empty-state">還沒有任何習慣，開始建立一個吧！</div>';
        return;
    }

    data.habits.forEach((h) => {
        const item = document.createElement("div");
        item.className = `habit-item ${h.done ? 'done' : ''}`;
        
        item.innerHTML = `
            <div class="habit-info">
                <span class="habit-name">${h.name}</span>
                <div class="habit-meta">
                    <span class="streak-badge">🔥 ${h.streak} 天連擊</span>
                    ${h.done ? '<span>• 已完成</span>' : ''}
                </div>
            </div>
            <div style="display: flex; align-items: center; gap: 16px;">
                <button onclick="deleteHabit(${h.id})" style="background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.2rem; padding: 4px;">×</button>
                <label class="checkbox-container">
                    <input type="checkbox" ${h.done ? 'checked' : ''} onchange="toggleHabit(${h.id})">
                    <span class="checkmark"></span>
                </label>
            </div>
        `;

        list.appendChild(item);
    });
}

function addHabit() {
    const input = document.getElementById("habitInput");
    const name = input.value.trim();

    if (!name) return;

    data.habits.push({
        id: Date.now(),
        name: name,
        streak: 0,
        done: false,
    });

    input.value = "";
    save();
    render();
}

// Handle Enter key in input
document.getElementById("habitInput")?.addEventListener("keypress", (e) => {
    if (e.key === "Enter") addHabit();
});

// Initialize
dailyReset();
updateStats();
render();
