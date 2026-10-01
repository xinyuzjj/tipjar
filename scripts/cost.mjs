import { formatUnits } from 'viem';
const price = 20000000000n; // 20 gwei，Arc 下限

function cost(gas) { return Number(formatUnits(BigInt(gas) * price, 18)); }
function row(label, gas) {
  const c = cost(gas);
  console.log(`  ${label.padEnd(34)} ${String(gas).padStart(10)} gas  →  $${c.toFixed(6)}`);
  return c;
}

console.log('=== 实测（Arc 主网真实交易）===');
row('Memo 包 USDC transfer (实测)', 199542);
row('Memo 包 Multicall3 (实测)', 1749420);

console.log('\n=== 估算：不同发帖方案 ===');
// 方案 A: 用 Memo 合约包一次 transfer（无需部署）
const memoOverhead = 60000;
const bodyBytes = 540; // 200 字中文
const a1 = row('A. Memo + transfer (200字)', memoOverhead + bodyBytes * 16 + 50000);
const a2 = row('A. Memo + transfer (50字)', memoOverhead + 150 * 16 + 50000);

console.log();
// 方案 B: 自建极简 Post 合约，只发事件（不存 storage）
//   calldata: 4 + 32(offset) + 32(len) + data
//   LOG: 375 + 375*topics + 8*dataBytes
//   基础: 21000
function postGas(bytes, topics = 2) {
  const calldataGas = 4 * 16 + (bytes + 64) * 16;
  const logGas = 375 + 375 * topics + 8 * bytes;
  return 21000 + calldataGas + logGas + 15000; // 15000 余量
}
const b1 = row('B. 自建 Post 合约 (200字)', postGas(540));
const b2 = row('B. 自建 Post 合约 (50字)', postGas(150));
const b3 = row('B. 自建 Post 合约 (500字)', postGas(1350));

console.log('\n=== 规模成本 ===');
console.log(`  1000 条帖子  (方案A): $${(a1*1000).toFixed(2)}`);
console.log(`  1000 条帖子  (方案B): $${(b1*1000).toFixed(2)}`);
console.log(`  10000 条帖子 (方案B): $${(b1*10000).toFixed(2)}`);
console.log(`\n=== 对比 ===`);
console.log(`  方案B 比方案A 便宜 ${((1 - b1/a1)*100).toFixed(0)}%`);
console.log(`  自建合约部署一次约 $0.01，发 ${Math.ceil(0.01/(a1-b1))} 条帖子即可回本`);
console.log(`\n=== 参考 ===`);
console.log(`  Twitter/X 发帖: 免费，但平台可删、可封号、可改算法`);
console.log(`  本方案发帖: $${b1.toFixed(5)}，永久、不可删、带时间戳`);
