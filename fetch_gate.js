// Node.js 18+（GitHub Actions OK）
const fs = require("fs");

const MODE = process.env.MODE || "fast";
const INTERVAL = MODE === "fast" ? "1m" : "5m";
const LIMIT = 120; // 一定要 >= 100

// ===== utils =====
const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;
const std = arr => {
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
};

// ===== Gate API =====
async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchTickers() {
  return fetchJSON("https://api.gateio.ws/api/v4/futures/usdt/tickers");
}

async function fetchCandles(symbol) {
  return fetchJSON(
    `https://api.gateio.ws/api/v4/futures/usdt/candlesticks` +
    `?contract=${symbol}&interval=${INTERVAL}&limit=${LIMIT}`
  );
}

function classify(atr) {
  if (atr > 0.05) return "瘋狗";
  if (atr > 0.02) return "山寨";
  return "主流";
}

async function run() {
  const tickers = await fetchTickers();

  const top = tickers
    .filter(t => t.contract.endsWith("USDT"))
    .sort((a, b) => Number(b.volume_24h) - Number(a.volume_24h))
    .slice(0, 60);

  const items = [];

  for (const t of top) {
    try {
      let candles = await fetchCandles(t.contract);
      if (!candles || candles.length < 50) continue;

      // 🔴 關鍵：Gate 是 新 → 舊，一定要反轉
      candles = candles.reverse();

      const closes = candles.map(c => Number(c[2]));
      const ret = closes.slice(1).map((v, i) =>
        (v - closes[i]) / closes[i]
      );

      if (ret.length < 20) continue;

      const rStd = std(ret);
      if (!isFinite(rStd) || rStd === 0) continue;

      const rz = (ret.at(-1) - mean(ret)) / rStd;
      const atr = Math.abs(ret.at(-1));
      const category = classify(atr);

      const score = Math.round(
        Math.abs(rz) * 60 + atr * 300
      );

      items.push({
        symbol: t.contract,
        direction: rz > 0 ? "long" : "short",
        score,
        category
      });

    } catch (e) {
      // 不吃掉錯誤你也會看到，但這裡先保持安靜
    }
  }

  const out = {
    updated: new Date().toLocaleString("zh-TW"),
    items: items.sort((a, b) => b.score - a.score)
  };

  fs.writeFileSync(
    MODE === "fast" ? "data_fast.json" : "data_slow.json",
    JSON.stringify(out, null, 2)
  );
}

run();
