import fs from "fs";
import fetch from "node-fetch";

const MODE = process.env.MODE || "fast";
const INTERVAL = MODE === "fast" ? "1m" : "5m";
const LIMIT = 60;

const mean = arr => arr.reduce((a,b)=>a+b,0) / arr.length;
const std  = arr => {
  const m = mean(arr);
  return Math.sqrt(mean(arr.map(x => (x-m)**2)));
};

async function fetchTickers() {
  const url = "https://api.gateio.ws/api/v4/futures/usdt/tickers";
  const res = await fetch(url);
  return await res.json();
}

async function fetchCandles(symbol) {
  const url =
    `https://api.gateio.ws/api/v4/futures/usdt/candlesticks` +
    `?contract=${symbol}&interval=${INTERVAL}&limit=${LIMIT}`;
  const res = await fetch(url);
  return await res.json();
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
    .sort((a,b)=>Number(b.volume_24h)-Number(a.volume_24h))
    .slice(0,100);

  const items = [];

  for (const t of top) {
    try {
      const candles = await fetchCandles(t.contract);
      if (candles.length < 20) continue;

      const closes = candles.map(c=>Number(c[2]));
      const vols   = candles.map(c=>Number(c[5]));

      const ret = closes.map((v,i)=> i===0 ? 0 : (v-closes[i-1])/closes[i-1]);
      const rz = (ret.at(-1) - mean(ret)) / std(ret);
      const vz = (vols.at(-1) - mean(vols)) / std(vols);

      const atr = Math.abs(ret.at(-1));
      const category = classify(atr);

      let score = Math.min(
        100,
        Math.round(Math.abs(rz)*40 + Math.abs(vz)*40 + atr*200)
      );

      if (category === "瘋狗") score = Math.round(score * 0.7);
      if (score < 70) continue;

      items.push({
        symbol: t.contract,
        direction: rz > 0 ? "long" : "short",
        score,
        category
      });
    } catch {}
  }

  const out = {
    updated: new Date().toLocaleString("zh-TW"),
    items: items.sort((a,b)=>b.score-a.score)
  };

  fs.writeFileSync(
    MODE === "fast" ? "data_fast.json" : "data_slow.json",
    JSON.stringify(out, null, 2)
  );
}

run();
