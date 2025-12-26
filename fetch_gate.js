// Node.js 18+ 內建 fetch
const fs = require("fs");

const MODE = process.env.MODE || "fast";
const INTERVAL = MODE === "fast" ? "1m" : "5m";
const LIMIT = 60;

// ===== 工具 =====
const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

const std = arr => {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const v = mean(arr.map(x => (x - m) ** 2));
  return Math.sqrt(v);
};

const safeZ = (value, arr) => {
  const s = std(arr);
  if (!isFinite(s) || s === 0) return 0;
  return (value - mean(arr)) / s;
};

// ===== Gate API =====
async function fetchTickers() {
  const res = await fetch(
    "https://api.gateio.ws/api/v4/futures/usdt/tickers"
  );
  return res.json();
}

async function fetchCandles(symbol) {
  const url =
    "https://api.gateio.ws/api/v4/futures/usdt/candlesticks" +
    `?contract=${symbol}&interval=${INTERVAL}&limit=${LIMIT}`;
  const res = await fetch(url);
  return res.json();
}

// ===== 幣種分類 =====
function classify(atr) {
  if (atr > 0.05) return "瘋狗";
  if (atr > 0.02) return "山寨";
  return "主流";
}

// ===== 主程式 =====
async function run() {
  const tickers = await fetchTickers();

  const top = tickers
    .filter(t => t.contract.endsWith("USDT"))
    .sort((a, b) => Number(b.volume_24h) - Number(a.volume_24h))
    .slice(0, 100);

  const items = [];

  for (const t of top) {
    try {
      const candles = await fetchCandles(t.contract);
      if (!candles || candles.length < 30) continue;

      const closes = candles.map(c => Number(c[2])).filter(Boolean);
      const vols = candles.map(c => Number(c[5])).filter(Boolean);
      if (closes.length < 20 || vols.length < 20) continue;

      // 報酬率
      const ret = closes.map((v, i) =>
        i === 0 ? 0 : (v - closes[i - 1]) / closes[i - 1]
      );

      // Z-Score（防 NaN）
      const rz = safeZ(ret.at(-1), ret);
      const vz = safeZ(vols.at(-1), vols);

      // 波動近似
      const atr = Math.abs(ret.at(-1));
      const category = classify(atr);

      // === 分數核心（你之後只需要改這） ===
      let score =
        Math.abs(rz) * 40 +
        Math.abs(vz) * 40 +
        atr * 200;

      // 瘋狗幣降權（避免洗爆）
      if (category === "瘋狗") score *= 0.7;

      score = Math.round(score);

      // 門檻（避免垃圾訊號）
      if (!isFinite(score) || score < 60) continue;

      items.push({
        symbol: t.contract,
        direction: rz >= 0 ? "long" : "short",
        score,
        category,
        rz: Number(rz.toFixed(2)),
        vz: Number(vz.toFixed(2)),
        atr: Number(atr.toFixed(4))
      });
    } catch (e) {
      // 單一幣錯誤不影響整體
    }
  }

  const out = {
    updated: new Date().toLocaleString("zh-TW"),
    mode: MODE,
    interval: INTERVAL,
    count: items.length,
    items: items.sort((a, b) => b.score - a.score)
  };

  fs.writeFileSync(
    MODE === "fast" ? "data_fast.json" : "data_slow.json",
    JSON.stringify(out, null, 2)
  );
}

run();
