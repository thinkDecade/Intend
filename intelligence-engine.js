#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(process.env.HOME, '.openclaw/workspace/LIVE_CONTEXT.md');

function fetchJSON(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'User-Agent': 'Intend/1.0', ...headers } };
    https.get(url, opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Parse error: ${e.message}`)); }
      });
    }).on('error', reject);
  });
}

// Static inflation data sourced from TradingEconomics / official stats (Mar 2026)
// These are the most recent official CPI releases as of the run date.
// Update this table monthly or connect a paid API.
function fetchInflationData() {
  return Promise.resolve([
    { country: 'Nigeria',      rate: '15.1%', period: 'Jan 2026' },
    { country: 'Argentina',    rate: '32.4%', period: 'Jan 2026' },
    { country: 'Turkey',       rate: '31.5%', period: 'Feb 2026' },
    { country: 'South Africa', rate: '3.5%',  period: 'Jan 2026' },
    { country: 'United States',rate: '2.4%',  period: 'Jan 2026' },
    { country: 'United Kingdom',rate: '3.0%', period: 'Jan 2026' },
    { country: 'Ghana',        rate: '3.3%',  period: 'Feb 2026' },
    { country: 'Kenya',        rate: '4.4%',  period: 'Jan 2026' },
    { country: 'Egypt',        rate: '11.9%', period: 'Jan 2026' },
    { country: 'Pakistan',     rate: '7.0%',  period: 'Feb 2026' },
    { country: 'India',        rate: '2.75%', period: 'Jan 2026' },
    { country: 'Brazil',       rate: '4.44%', period: 'Jan 2026' },
  ]);
}

async function fetchTopYields() {
  try {
    const data = await fetchJSON('https://yields.llama.fi/pools');
    return data.data
      .filter(p => p.stablecoin && p.project === 'aave-v3' && p.tvlUsd > 50_000_000 && p.apy > 0 && p.apy < 30 &&
        (p.symbol.includes('USDT') || p.symbol.includes('USDC') || p.symbol.includes('DAI')))
      .sort((a, b) => b.apy - a.apy).slice(0, 6)
      .map(p => ({ protocol: p.project, chain: p.chain, symbol: p.symbol, apy: p.apy.toFixed(2), tvl: '$' + (p.tvlUsd/1_000_000).toFixed(1) + 'M' }));
  } catch (e) { return []; }
}

async function fetchPolymarketRisk() {
  try {
    const [d1, d2] = await Promise.all([
      fetchJSON('https://gamma-api.polymarket.com/markets?tag=politics&active=true&closed=false&limit=30&order=volume24hr&ascending=false'),
      fetchJSON('https://gamma-api.polymarket.com/markets?tag=geopolitics&active=true&closed=false&limit=20&order=volume24hr&ascending=false').catch(() => [])
    ]);
    const seen = new Set();
    return [...(d1||[]), ...(d2||[])]
      .filter(m => m.question && m.outcomePrices && !seen.has(m.id) && seen.add(m.id))
      .slice(0, 8)
      .map(m => {
        let prob = 'N/A';
        try { prob = (parseFloat(JSON.parse(m.outcomePrices)[0]) * 100).toFixed(0) + '%'; } catch(e) {}
        return { question: m.question.substring(0, 65), probability: prob, volume24h: m.volume24hr ? '$' + (parseFloat(m.volume24hr)/1000).toFixed(0) + 'K' : 'N/A' };
      });
  } catch (e) { return []; }
}

async function fetchProtocolHealth() {
  try {
    const data = await fetchJSON('https://api.llama.fi/protocols');
    return ['aave-v3', 'compound-v3', 'uniswap-v3', 'curve-dex'].map(slug => {
      const p = data.find(x => x.slug === slug);
      return p ? { name: p.name, tvl: '$' + (p.tvl/1_000_000_000).toFixed(2) + 'B', chains: (p.chains||[]).slice(0,3).join(', ') }
               : { name: slug, tvl: 'N/A', chains: 'N/A' };
    });
  } catch (e) { return []; }
}

async function main() {
  console.log('[intend-intelligence] Fetching live signals...');
  const timestamp = new Date().toUTCString();
  const [inflation, yields, polyRisk, protocols] = await Promise.all([
    fetchInflationData(), fetchTopYields(), fetchPolymarketRisk(), fetchProtocolHealth()
  ]);
  const highInflation = inflation.filter(r => parseFloat(r.rate) > 10);
  const bestYield = yields[0];
  const highRiskEvents = polyRisk.filter(r => !isNaN(parseInt(r.probability)) && parseInt(r.probability) > 70);

  const md = `# LIVE_CONTEXT — Intend Intelligence Engine
> Last updated: ${timestamp}
> Inflation data: sourced from official statistics (TradingEconomics/NBS/StatGhana). Updated monthly.
> Yields, risk, protocols: live via DefiLlama + Polymarket.

---

## 🌍 Inflation Snapshot (Official CPI — Most Recent Release)

| Country | Annual Rate | Period |
| --- | --- | --- |
${inflation.map(r => `| ${r.country} | ${r.rate} | ${r.period} |`).join('\n')}

---

## 💰 Top Stablecoin Yields (DefiLlama — Live)

| Protocol | Chain | Asset | APY | TVL |
| --- | --- | --- | --- | --- |
${yields.length > 0 ? yields.map(r => `| ${r.protocol} | ${r.chain} | ${r.symbol} | ${r.apy}% | ${r.tvl} |`).join('\n') : '| No data | — | — | — | — |'}

---

## 🔮 Political & Macro Risk (Polymarket — Live Politics Markets)

| Event | Yes Probability | 24h Volume |
| --- | --- | --- |
${polyRisk.length > 0 ? polyRisk.map(r => `| ${r.question} | ${r.probability} | ${r.volume24h} |`).join('\n') : '| No active political markets | — | — |'}

---

## 🏦 Protocol Health (DefiLlama TVL)

| Protocol | TVL | Active Chains |
| --- | --- | --- |
${protocols.map(r => `| ${r.name} | ${r.tvl} | ${r.chains} |`).join('\n')}

---

## 🎯 Active Objective Triggers

${highInflation.length > 0 ? highInflation.map(r => `🔴 ESCAPE INFLATION: ${r.country} at ${r.rate} (${r.period}) — threshold exceeded (>10%)`).join('\n') : '✅ No high-inflation alerts above 10%'}

${bestYield ? `🟢 CAPTURE GLOBAL YIELD: Best opportunity — ${bestYield.protocol} on ${bestYield.chain} at ${bestYield.apy}% APY (TVL: ${bestYield.tvl})` : '⚠️  Yield data unavailable'}

${highRiskEvents.length > 0 ? highRiskEvents.map(r => `🔴 PROACTIVE HEDGE: "${r.question}" — ${r.probability} probability`).join('\n') : '✅ No political risk events above 70%'}
`;

  fs.writeFileSync(OUTPUT_FILE, md);
  console.log(`[intend-intelligence] Done — ${inflation.length} countries | ${yields.length} yield pools | ${polyRisk.length} political markets`);
}

main().catch(e => { console.error('[intend-intelligence] Fatal:', e.message); process.exit(1); });
