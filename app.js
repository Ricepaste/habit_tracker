let data = JSON.parse(localStorage.getItem("habitData")) || {
  habits: [],
  lastDate: null,
};

function today() {
  return new Date().toISOString().split("T")[0];
}

function dailyReset() {
  if (data.lastDate !== today()) {
    data.habits.forEach((h) => {
      if (h.done) {
        h.streak++;
      } else {
        h.streak = 0;
      }

      h.done = false;
    });

    data.lastDate = today();

    save();
  }
}

function save() {
  localStorage.setItem("habitData", JSON.stringify(data));
}

function render() {
  const list = document.getElementById("habitList");
  list.innerHTML = "";

  data.habits.forEach((h, i) => {
    const li = document.createElement("li");

    const left = document.createElement("div");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = h.done;

    checkbox.onclick = () => {
      h.done = checkbox.checked;
      save();
    };

    left.appendChild(checkbox);
    left.append(" " + h.name);

    const streak = document.createElement("span");
    streak.className = "streak";
    streak.innerText = "🔥 " + h.streak;

    li.appendChild(left);
    li.appendChild(streak);

    list.appendChild(li);
  });
}

function addHabit() {
  const input = document.getElementById("habitInput");

  if (!input.value) return;

  data.habits.push({
    name: input.value,
    streak: 0,
    done: false,
  });

  input.value = "";

  save();
  render();
}

dailyReset();
render();
