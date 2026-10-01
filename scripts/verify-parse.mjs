/**
 * 用真实链上数据验证解析逻辑（和 worker/src/index.js 里的算法一致）
 * 用法: node scripts/verify-parse.mjs
 */
import { createPublicClient, http, defineChain } from 'viem';

const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc Mainnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://explorer.arc.io' } },
});

const MEMO = '0x5294E9927c3306DcBaDb03fe70b92e01cCede505';
const USDC = '0x3600000000000000000000000000000000000000';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const USDC_DECIMALS = 6;

// ---- 复制 worker 里的解析算法 ----
const dec = new TextDecoder();

function hexToBytes(hex) {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
function bytesToHex(b) {
  return '0x' + Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
}
function topicToAddress(t) {
  return '0x' + t.slice(26).toLowerCase();
}
function formatUsdc(raw) {
  const s = raw.toString().padStart(USDC_DECIMALS + 1, '0');
  const int = s.slice(0, -USDC_DECIMALS);
  const frac = s.slice(-USDC_DECIMALS).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}
function parseMemoData(dataHex) {
  const d = hexToBytes(dataHex);
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const callDataHash = bytesToHex(d.slice(0, 32));
  const memoOffset = Number(dv.getBigUint64(32 + 24)); // [32:64] 低 8 字节
  const memoIndex = Number(dv.getBigUint64(64 + 24));  // [64:96] 低 8 字节
  let memoText = '';
  try {
    const len = Number(dv.getBigUint64(memoOffset + 24));
    const start = memoOffset + 32;
    memoText = dec.decode(d.slice(start, start + len));
  } catch { memoText = ''; }
  return { callDataHash, memoIndex, memoText };
}
function parseMemoPayload(t) {
  if (!t) return {};
  try { const o = JSON.parse(t); return typeof o === 'object' && o !== null ? o : { msg: t }; }
  catch { return { msg: t }; }
}
// ---------------------------------

const client = createPublicClient({ chain: arcMainnet, transport: http() });
const latest = await client.getBlockNumber();

// 1) 拿 Memo 事件的 topic0（直接从链上日志取，最可靠）
const anyLogs = await client.request({
  method: 'eth_getLogs',
  params: [{ address: MEMO, fromBlock: '0x' + (latest - 2000n).toString(16), toBlock: '0x' + latest.toString(16) }],
});

const topicsSeen = [...new Set(anyLogs.map((l) => l.topics[0]))];
console.log('=== Memo 合约上出现的所有事件 topic0 ===');
topicsSeen.forEach((t) => console.log('  ' + t, `(${anyLogs.filter((l) => l.topics[0] === t).length} 条)`));

const MEMO_SIG = '0xeb15ee720798341c37739df41be53acfbbf70ae6802dade35457beec6e47a5e4';
console.log(`\n→ 假定 Memo 事件 topic0 = ${MEMO_SIG}`);

// 2) 用这个 topic 拉日志并解析
const logs = await client.request({
  method: 'eth_getLogs',
  params: [{ address: MEMO, topics: [MEMO_SIG], fromBlock: '0x' + (latest - 2000n).toString(16), toBlock: '0x' + latest.toString(16) }],
});
console.log(`\n=== 解析 ${logs.length} 条 Memo 日志 ===`);

let ok = 0, bad = 0;
for (const log of logs) {
  try {
    const sender = topicToAddress(log.topics[1]);
    const target = topicToAddress(log.topics[2]);
    const memoId = log.topics[3];
    const { memoIndex, memoText } = parseMemoData(log.data);
    const payload = parseMemoPayload(memoText);

    // 同交易拿 USDC 金额
    const receipt = await client.getTransactionReceipt({ hash: log.transactionHash });
    const transfers = receipt.logs.filter(
      (l) => l.topics[0] === TRANSFER_TOPIC && l.address.toLowerCase() === USDC.toLowerCase()
    );
    let amount = null, recipient = null;
    if (transfers.length) {
      const t = transfers[transfers.length - 1];
      recipient = topicToAddress(t.topics[2]);
      amount = formatUsdc(BigInt(t.data));
    }

    console.log(`\n  block ${Number(log.blockNumber)}`);
    console.log(`    sender   : ${sender}`);
    console.log(`    target   : ${target}`);
    console.log(`    memoId   : ${memoId}`);
    console.log(`    memoIndex: ${memoIndex}`);
    console.log(`    memo     : ${JSON.stringify(memoText)}`);
    console.log(`    payload  : ${JSON.stringify(payload)}`);
    console.log(`    recipient: ${recipient}`);
    console.log(`    amount   : ${amount} USDC`);
    ok++;
  } catch (e) {
    console.log(`  ✗ 解析失败: ${e.message}`);
    bad++;
  }
}

console.log(`\n=== 结果: 成功 ${ok} / 失败 ${bad} ===`);
console.log(`\n把下面这行填进 worker/src/index.js 的 MEMO_SIG_TOPIC：`);
console.log(`  const MEMO_SIG_TOPIC = '${MEMO_SIG}';`);
