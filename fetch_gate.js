// Node.js 18+（GitHub Actions OK）
const fs = require("fs");

const MODE = process.env.MODE || "fast";
const INTERVAL = MODE === "fast" ? "1m" : "5m";
const LIMIT = 80;

// ===== utils =====
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const std  = a => {
  const m = mean(a);
  return Math.sqrt(mean(a.map(x => (x - m) ** 2)));
};

// ===== API =====
async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchTickers() {
  return fetchJSON("https://api.gateio.ws/api/v4/futures/usdt/tickers");
}

async function fetchCandles(symbol) {
  const data = await fetchJSON(
    `https://api.gateio.ws/api/v4/futures/usdt/candlesticks` +
    `?contract=${symbol}&interval=${INTERVAL}&limit=${LIMIT}`
  );
  return data.reverse(); // 轉成 舊 → 新
}

function classify(atr) {
  if (atr > 0.03) return "瘋狗";
  if (atr > 0.015) return "山寨";
  return "主流";
}

async function run() {
  const tickers = await fetchTickers();

  const top = tickers
    .filter(t => t.contract.endsWith("USDT"))
    .sort((a, b) => Number(b.volume_24h) - Number(a.volume_24h))
    .slice(0, 40);

  const items = [];

  for (const t of top) {
    try {
      const candles = await fetchCandles(t.contract);
      if (candles.length < 20) continue;

      const close = candles.map(c => Number(c[2]));
      const ret = close.slice(1).map((v, i) => (v - close[i]) / close[i]);

      const rStd = std(ret);
      if (!isFinite(rStd) || rStd === 0) continue;

      const rz  = (ret.at(-1) - mean(ret)) / rStd;
      const atr = Math.abs(ret.at(-1));
      const category = classify(atr);
