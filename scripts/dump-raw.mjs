import { createPublicClient, http, defineChain } from 'viem';
const arc = defineChain({ id: 5042, name: 'Arc', nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18}, rpcUrls:{default:{http:['https://rpc.mainnet.arc.io']}} });
const client = createPublicClient({ chain: arc, transport: http() });
const MEMO = '0x5294E9927c3306DcBaDb03fe70b92e01cCede505';
const latest = await client.getBlockNumber();
const logs = await client.request({ method:'eth_getLogs', params:[{ address: MEMO, fromBlock:'0x'+(latest-2000n).toString(16), toBlock:'0x'+latest.toString(16) }] });
console.log('共', logs.length, '条日志\n');
for (const l of logs.slice(0,4)) {
  console.log('--- log ---');
  console.log('  topic0    :', l.topics[0]);
  console.log('  topics 数量:', l.topics.length);
  l.topics.forEach((t,i)=>console.log(`    topics[${i}] len=${(t.length-2)/2} :`, t));
  console.log('  data 长度 :', (l.data.length-2)/2, 'bytes');
  console.log('  data      :', l.data);
  console.log('  block     :', Number(l.blockNumber));
  console.log('  txHash    :', l.transactionHash);
  console.log();
}
