/**
 * 编译 TipJarSocial.sol，输出 ABI + bytecode 到 build/
 * 用法: node scripts/compile.mjs
 */
import solc from 'solc';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const SRC = path.join(ROOT, 'contracts', 'TipJarSocial.sol');
const OUT = path.join(ROOT, 'build');

const source = fs.readFileSync(SRC, 'utf8');

const input = {
  language: 'Solidity',
  sources: { 'TipJarSocial.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      '*': {
        '*': [
          'abi',
          'evm.bytecode.object',
          'evm.bytecode.linkReferences',
          'evm.deployedBytecode.object',
          'evm.gasEstimates',
        ],
      },
    },
  },
};

console.log(`solc 版本: ${solc.version()}`);
console.log(`编译 ${path.relative(ROOT, SRC)} ...\n`);

const out = JSON.parse(solc.compile(JSON.stringify(input)));

// 错误处理
const errors = (out.errors || []).filter((e) => e.severity === 'error');
const warnings = (out.errors || []).filter((e) => e.severity === 'warning');

if (warnings.length) {
  console.log('警告:');
  warnings.forEach((w) => console.log('  ' + w.formattedMessage.split('\n')[0]));
  console.log();
}
if (errors.length) {
  console.log('错误:');
  errors.forEach((e) => console.log(e.formattedMessage));
  process.exit(1);
}

const c = out.contracts['TipJarSocial.sol']['TipJarSocial'];
const bytecode = '0x' + c.evm.bytecode.object;
const deployed = '0x' + c.evm.deployedBytecode.object;

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'TipJarSocial.abi.json'), JSON.stringify(c.abi, null, 2));
fs.writeFileSync(path.join(OUT, 'TipJarSocial.bytecode.txt'), bytecode);

console.log('✅ 编译成功\n');
console.log(`  ABI              : ${c.abi.length} 个条目`);
console.log(`  部署字节码       : ${(bytecode.length - 2) / 2} bytes`);
console.log(`  运行时字节码     : ${(deployed.length - 2) / 2} bytes`);

const gas = c.evm.gasEstimates;
if (gas?.creation) {
  const total = gas.creation.totalCost;
  console.log(`  部署 gas (估算)  : ${Number(total).toLocaleString()}`);
  // Arc: 20 gwei, 18 位 USDC
  const cost = (BigInt(total) * 20000000000n);
  const usdc = Number(cost) / 1e18;
  console.log(`  部署成本 (20gwei): $${usdc.toFixed(5)}`);
}

console.log('\n  --- 函数 gas 估算 ---');
const methods = gas?.external || {};
for (const [sig, g] of Object.entries(methods)) {
  let num = 0;
  if (typeof g === 'string') num = g === 'infinite' ? -1 : Number(g);
  else if (g && typeof g.totalCost === 'number') num = g.totalCost;

  if (!Number.isFinite(num) || num < 0) {
    console.log(`  ${sig.padEnd(34)} 不固定（取决于 calldata 长度）`);
    continue;
  }
  const cost = Number(BigInt(Math.round(num)) * 20000000000n) / 1e18;
  console.log(`  ${sig.padEnd(34)} ${String(num).padStart(9)} gas  → $${cost.toFixed(6)}`);
}

console.log('\n  --- 发帖实际成本（理论估算，含 calldata）---');
// calldata: 4(selector) + 32(offset) + 32(len) + data(padded to 32)
// LOG: 375 + 375*3(topics) + 8*dataBytes
// storage: postCount(5k) + postAuthor(20k) = 25k（时间和父帖只在事件里）
for (const [label, chars] of [['50 字中文', 150], ['200 字中文', 540], ['1000 字中文', 2700], ['5000 字中文', 13500]]) {
  const dataBytes = chars;
  const padded = Math.ceil(dataBytes / 32) * 32;
  const calldataGas = (4 + 32 + 32 + padded) * 16;
  const logGas = 375 + 375 * 3 + 8 * dataBytes;
  const storageGas = 25000;
  const base = 21000;
  const total = base + calldataGas + logGas + storageGas + 8000; // 8000 余量
  const cost = Number(BigInt(total) * 20000000000n) / 1e18;
  console.log(`  ${label.padEnd(14)} ${String(total).padStart(8)} gas  → $${cost.toFixed(6)}`);
}

console.log(`\n输出目录: ${path.relative(ROOT, OUT)}/`);
