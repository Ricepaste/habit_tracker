// HabitFlow Pro — 測試資料集（相對時間，永久有效）
// 首次載入時若 localStorage 為空，將自動使用此資料
(function() {
  const NOW = Date.now();
  const DAY = 86400000;
  const HOUR = 3600000;
  const TODAY_MIDNIGHT = new Date().setHours(0,0,0,0);

  // 產生指定日期與小時的 timestamp
  function ts(daysAgo, hour) {
    return TODAY_MIDNIGHT - daysAgo * DAY + (hour || 12) * HOUR;
  }

  // 均勻分配 N 筆紀錄到指定天數範圍內
  function distribute(count, startDay, spanDays, perDay) {
    const result = [];
    let remaining = count;
    for (let d = startDay; d < startDay + spanDays && remaining > 0; d++) {
      const n = Math.min(remaining, perDay);
      for (let i = 0; i < n; i++) {
        result.push(ts(d, 8 + i * 3));
      }
      remaining -= n;
    }
    return result;
  }

  window.__HABITFLOW_TEST_DATA__ = {
    habits: [
      {
        id: 1001,
        name: "每日閱讀",
        // 過去 28 天，平均每天 1~2 筆
        logs: distribute(45, 0, 28, 2),
        createdAt: new Date(NOW - 28 * DAY).toISOString(),
        rewardSettings: { enabled: true, threshold: 10, lifetimeTickets: 4 }
      },
      {
        id: 1002,
        name: "深蹲運動",
        // 過去 28 天，平均每天 4 筆
        logs: distribute(120, 0, 28, 5),
        createdAt: new Date(NOW - 28 * DAY).toISOString(),
        rewardSettings: { enabled: true, threshold: 20, lifetimeTickets: 6 }
      },
      {
        id: 1003,
        name: "冥想練習",
        // 過去 14 天，每天 1 筆 + 最後一天多 1 筆
        logs: distribute(15, 0, 14, 2),
        createdAt: new Date(NOW - 14 * DAY).toISOString(),
        rewardSettings: { enabled: false, threshold: 10 }
      },
      {
        id: 1004,
        name: "日記寫作",
        // 過去 8 天，每天 1 筆
        logs: distribute(8, 0, 8, 1),
        createdAt: new Date(NOW - 8 * DAY).toISOString(),
        rewardSettings: { enabled: true, threshold: 5, lifetimeTickets: 1 }
      }
    ],
    focusLogs: [
      { timestamp: ts(7, 9),  duration: 45 },
      { timestamp: ts(6, 10), duration: 30 },
      { timestamp: ts(5, 14), duration: 60 },
      { timestamp: ts(4, 8),  duration: 25 },
      { timestamp: ts(4, 15), duration: 50 },
      { timestamp: ts(3, 9),  duration: 35 },
      { timestamp: ts(3, 16), duration: 55 },
      { timestamp: ts(2, 10), duration: 40 },
      { timestamp: ts(2, 14), duration: 45 },
      { timestamp: ts(1, 8),  duration: 30 }
    ],
    rewards: {
      tickets: 3,
      prizePool: {
        Rare:      ["75 NT", "一杯珍奶", "零食一包"],
        Epic:      ["175 NT", "一本書", "電影票"],
        Legendary: ["375 NT", "遊戲", "大餐一頓"]
      },
      missTime: { Rare: 2, Epic: 5 },
      inventory: [
        { prize: "75 NT",    rarity: "Rare",      timestamp: ts(5, 12) },
        { prize: "一杯珍奶",  rarity: "Rare",      timestamp: ts(4, 12) },
        { prize: "175 NT",   rarity: "Epic",      timestamp: ts(3, 12) },
        { prize: "375 NT",   rarity: "Legendary", timestamp: ts(2, 12) }
      ],
      lifetimeFocusTickets: 0
    },
    settings: { theme: "dark", wakeLockEnabled: false }
  };
})();
