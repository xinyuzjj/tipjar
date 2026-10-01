/**
 * 探测脚本：验证 Arc 上 Memo 合约的事件能否被索引。
 * 不需要私钥，纯只读。
 *
 * 用法: node scripts/probe.mjs
 */
import { createPublicClient, http, parseAbiItem, defineChain, formatUnits } from 'viem';

const MEMO = '0x5294E9927c3306DcBaDb03fe70b92e01cCede505';
const USDC = '0x3600000000000000000000000000000000000000';

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' } },
});

const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc Mainnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://explorer.arc.io' } },
});

const memoEvent = parseAbiItem(
  'event Memo(address indexed sender, address indexed target, bytes32 callDataHash, bytes32 indexed memoId, bytes memo, uint256 memoIndex)'
);
const beforeMemoEvent = parseAbiItem('event BeforeMemo(uint256 indexed memoIndex)');

async function probe(label, chain) {
  console.log(`\n${'='.repeat(60)}\n${label}\n${'='.repeat(60)}`);
  const client = createPublicClient({ chain, transport: http() });

  const [chainId, block, gasPrice] = await Promise.all([
    client.getChainId(),
    client.getBlockNumber(),
    client.getGasPrice(),
  ]);
  console.log(`chainId   : ${chainId}`);
  console.log(`block     : ${block}`);
  console.log(`gasPrice  : ${gasPrice} wei  (${Number(gasPrice) / 1e9} gwei)`);

  // 扫最近 N 个区块里的 Memo 事件
  const SPAN = 5000n;
  const from = block > SPAN ? block - SPAN : 0n;
  console.log(`\n扫描区块 ${from} → ${block} 的 Memo 事件...`);

  let memos = [];
  try {
    memos = await client.getLogs({ address: MEMO, event: memoEvent, fromBlock: from, toBlock: block });
    console.log(`  Memo 事件     : ${memos.length} 条`);
  } catch (e) {
    console.log(`  Memo 事件查询失败: ${e.shortMessage || e.message}`);
  }

  let befores = [];
  try {
    befores = await client.getLogs({ address: MEMO, event: beforeMemoEvent, fromBlock: from, toBlock: block });
    console.log(`  BeforeMemo 事件: ${befores.length} 条`);
  } catch (e) {
    console.log(`  BeforeMemo 查询失败: ${e.shortMessage || e.message}`);
  }

  // 打印最近 3 条，看数据长什么样
  for (const m of memos.slice(-3)) {
    console.log(`\n  --- Memo @ block ${m.blockNumber} ---`);
    console.log(`  sender   : ${m.args.sender}`);
    console.log(`  target   : ${m.args.target}`);
    console.log(`  memoId   : ${m.args.memoId}`);
    console.log(`  memoIndex: ${m.args.memoIndex}`);
    console.log(`  memo(raw): ${m.args.memo}`);
    try {
      const txt = Buffer.from(m.args.memo.slice(2), 'hex').toString('utf8');
      console.log(`  memo(utf8): ${JSON.stringify(txt)}`);
    } catch {}
    console.log(`  txHash   : ${m.transactionHash}`);
  }

  // 同时看这笔交易里有没有 USDC Transfer（金额来源）
  if (memos.length) {
    const last = memos[memos.length - 1];
    try {
      const receipt = await client.getTransactionReceipt({ hash: last.transactionHash });
      const transfers = receipt.logs.filter(
        (l) => l.address.toLowerCase() === USDC.toLowerCase()
      );
      console.log(`\n  该交易的 USDC Transfer 日志: ${transfers.length} 条`);
      for (const t of transfers) {
        const from = '0x' + t.topics[1].slice(26);
        const to = '0x' + t.topics[2].slice(26);
        const raw = BigInt(t.data);
        console.log(`    ${from} → ${to}`);
        console.log(`      6位(ERC20): ${formatUnits(raw, 6)}  |  18位(原生): ${formatUnits(raw, 18)}`);
      }
    } catch (e) {
      console.log(`  receipt 查询失败: ${e.shortMessage || e.message}`);
    }
  }

  return { chainId, block, memos: memos.length, befores: befores.length };
}

const t = await probe('ARC TESTNET', arcTestnet);
const m = await probe('ARC MAINNET', arcMainnet);

console.log(`\n${'='.repeat(60)}\n汇总\n${'='.repeat(60)}`);
console.log(`测试网: block ${t.block}, Memo ${t.memos} 条, BeforeMemo ${t.befores} 条`);
console.log(`主网  : block ${m.block}, Memo ${m.memos} 条, BeforeMemo ${m.befores} 条`);
