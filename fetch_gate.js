// Node.js 18+（GitHub Actions 內建 fetch 可用）
const fs = require("fs");

const MODE = process.env.MODE || "fast";   // fast / slow
const INTERVAL = MODE === "fast" ? "1m" : "5m";
const LIMIT = 60;

// ================= utils =================
const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

const std = arr => {
  const m = mean(arr);
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
};

// ================= Gate API =================
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

// ================= 分類 =================
function classify(atr) {
  if (atr > 0.05) return "瘋狗";
  if (atr > 0.02) return "山寨";
  return "主流";
}

// ================= 主程式 =================
async function run() {
  const tickers = await fetchTickers();

  const top = tickers
    .filter(t => t.contract.endsWith("USDT"))
    .sort((a, b) => Number(b.volume_24h) - Number(a.volume_24h))
    .slice(0, 80);

  const items = [];

  for (const t of top) {
    try {
      const candles = await fetchCandles(t.contract);
      if (!candles || candles.length < 30) continue;

      /**
       * Gate USDT Futures candlestick 正確結構
       * c[0] timestamp
       * c[1] volume
       * c[2] close
       * c[3] high
       * c[4] low
       * c[5] open
       */
      const closes = candles.map(c => Number(c[2]));
      const vols   = candles.map(c => Number(c[1]));

      const ret = closes.slice(1).map((v, i) =>
        (v - closes[i]) / closes[i]
      );

      const rStd = std(ret);
      const vStd = std(vols);

      if (!isFinite(rStd) || !isFinite(vStd) || rStd === 0 || vStd === 0) {
        continue;
      }

      const rz = (ret.at(-1) - mean(ret)) / rStd;
      const vz = (vols.at(-1) - mean(vols)) / vStd;

      const atr = Math.abs(ret.at(-1));
      const category = classify(atr);

      let score =
        Math.abs(rz) * 40 +
        Math.abs(vz) * 40 +
        atr * 200;

      if (category === "瘋狗") score *= 0.7;
      score = Math.round(score);

      items.push({
        symbol: t.contract,
        direction: rz > 0 ? "long" : "short",
        score,
        category
      });

    } catch (_) {
      // 單一幣錯誤直接跳過
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
