/**
 * 本地跑一遍索引器（用内存 KV 代替 Cloudflare KV）
 * 会真实拉取 Arc 主网数据，验证整条链路。
 *
 * 用法: node scripts/test-indexer.mjs
 */
import worker from '../worker/src/index.js';

// ---- 内存 KV ----
const store = new Map();
const TIPS = {
  async get(key, type) {
    const v = store.get(key);
    if (v === undefined || v === null) return null;
    return type === 'json' ? JSON.parse(v) : v;
  },
  async put(key, value) {
    store.set(key, value);
  },
};

const env = {
  TIPS,
  RPC_URL: 'https://rpc.mainnet.arc.io',
  MEMO_ADDRESS: '0x5294E9927c3306DcBaDb03fe70b92e01cCede505',
  USDC_ADDRESS: '0x3600000000000000000000000000000000000000',
  CHAIN: 'mainnet',
  LOOKBACK_BLOCKS: '600',
};

console.log('=== 1. 触发索引（扫描最近 600 个区块）===');
const t0 = Date.now();
const res = await worker.fetch(new Request('http://x/api/index?force=1'), env);
const r = await res.json();
console.log(JSON.stringify(r, null, 2));
console.log(`耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);

console.log('\n=== 2. /api/health ===');
console.log(JSON.stringify(await (await worker.fetch(new Request('http://x/api/health'), env)).json(), null, 2));

console.log('\n=== 3. /api/recent ===');
const recent = await (await worker.fetch(new Request('http://x/api/recent?limit=5'), env)).json();
console.log(`共 ${recent.count} 条，前 5 条：`);
for (const x of recent.items) {
  console.log(`  ${x.amount} USDC | "${x.message}" | ${x.sender.slice(0, 10)}… → ${(x.recipient || '').slice(0, 10)}…`);
}

console.log('\n=== 4. /api/leaderboard ===');
const board = await (await worker.fetch(new Request('http://x/api/leaderboard'), env)).json();
for (const [i, x] of board.items.slice(0, 5).entries()) {
  console.log(`  #${i + 1}  ${x.recipient}  ${x.total} USDC  (${x.count} 笔)`);
}

console.log('\n=== 5. /api/page/<memoId> （验证按打赏页聚合）===');
if (recent.items.length) {
  const memoId = recent.items[0].memoId;
  const page = await (await worker.fetch(new Request('http://x/api/page/' + memoId), env)).json();
  console.log(`memoId ${memoId.slice(0, 18)}… → ${page.count} 条`);
}

console.log('\n=== 6. KV 里存了哪些 key ===');
for (const k of [...store.keys()].slice(0, 20)) {
  const v = store.get(k);
  console.log(`  ${k}  (${v.length} bytes)`);
}
console.log(`  总计 ${store.size} 个 key`);
