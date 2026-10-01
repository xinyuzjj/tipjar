/**
 * 部署 TipJarSocial 到 Arc（测试网或主网）
 *
 * 用法：
 *   1. 复制 .env.example 为 .env，填入 PRIVATE_KEY
 *   2. node scripts/deploy.mjs testnet     # 先测
 *   3. node scripts/deploy.mjs mainnet     # 再上主网
 *
 * 安全：私钥只从环境变量/.env 读取，不经过任何网络传输。
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));

const NETWORKS = {
  testnet: defineChain({
    id: 5042002,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.testnet.arc.io'] } },
    blockExplorers: { default: { name: 'Arcscan', url: 'https://testnet.arcscan.app' } },
  }),
  mainnet: defineChain({
    id: 5042,
    name: 'Arc',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
    blockExplorers: { default: { name: 'Arcscan', url: 'https://explorer.arc.io' } },
  }),
};

const which = process.argv[2] || 'testnet';
const chain = NETWORKS[which];
if (!chain) {
  console.error(`未知网络: ${which}（可选 testnet / mainnet）`);
  process.exit(1);
}

const pk = process.env.PRIVATE_KEY;
if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
  console.error('缺少 PRIVATE_KEY。请在 .env 里设置一个 0x 开头的 64 位十六进制私钥。');
  process.exit(1);
}

const account = privateKeyToAccount(pk);
const publicClient = createPublicClient({ chain, transport: http() });
const walletClient = createWalletClient({ account, chain, transport: http() });

const abi = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'TipJarSocial.abi.json'), 'utf8'));
const bytecode = fs.readFileSync(path.join(ROOT, 'build', 'TipJarSocial.bytecode.txt'), 'utf8').trim();

console.log(`网络      : ${chain.name} (chainId ${chain.id})`);
console.log(`部署账户  : ${account.address}`);

const balance = await publicClient.getBalance({ address: account.address });
console.log(`账户余额  : ${Number(balance) / 1e18} USDC`);

if (balance === 0n) {
  console.error(`\n余额为 0，无法支付 gas。`);
  console.error(which === 'testnet'
    ? '去 https://faucet.circle.com/ 选 Arc Testnet 领测试 USDC。'
    : '主网需要真实 USDC，通过 Circle CCTP 从其他链桥入。');
  process.exit(1);
}

const gasPrice = await publicClient.getGasPrice();
// Arc mempool 20 gwei 硬下限：低于此值的交易会被静默丢弃
const maxFee = gasPrice > 20000000000n ? gasPrice : 20000000000n;
console.log(`gasPrice  : ${Number(maxFee) / 1e9} gwei`);

console.log('\n部署中…');
const hash = await walletClient.deployContract({
  abi,
  bytecode,
  args: [],
  maxFeePerGas: maxFee,
  maxPriorityFeePerGas: maxFee > 1000000000n ? maxFee / 10n : 1000000000n,
});

console.log(`交易已提交: ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });

if (receipt.status !== 'success') {
  console.error('部署失败');
  process.exit(1);
}

const addr = receipt.contractAddress;
const cost = receipt.gasUsed * (receipt.effectiveGasPrice ?? maxFee);

console.log(`\n✅ 部署成功`);
console.log(`  合约地址 : ${addr}`);
console.log(`  gasUsed  : ${receipt.gasUsed.toLocaleString()}`);
console.log(`  成本     : ${Number(cost) / 1e18} USDC`);
console.log(`  浏览器   : ${chain.blockExplorers.default.url}/address/${addr}`);

// 写入部署记录，方便前端读取
const deployFile = path.join(ROOT, 'build', `deploy-${which}.json`);
fs.writeFileSync(deployFile, JSON.stringify({
  network: which,
  chainId: chain.id,
  address: addr,
  deployer: account.address,
  txHash: hash,
  blockNumber: Number(receipt.blockNumber),
  deployedAt: new Date().toISOString(),
}, null, 2));
console.log(`\n部署记录已写入 ${path.relative(ROOT, deployFile)}`);
console.log(`\n下一步：把合约地址填进 worker/wrangler.toml 和 web/app.js`);
