/**
 * 验证手写 ABI 解码器：用 viem 编码出真实格式的事件日志，再用 worker 的解码函数解析，对比结果。
 * 用法: node scripts/test-decode.mjs
 */
import { encodeAbiParameters, encodeEventTopics, pad, toHex, getAddress } from 'viem';
import { decodePost, decodeTipped, decodeIdentity } from '../worker/src/index.js';

let pass = 0, fail = 0;
const eq = (label, got, want) => {
  const ok = String(got) === String(want);
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(22)} got=${got}${ok ? '' : `  want=${want}`}`);
  ok ? pass++ : fail++;
};

const author = getAddress('0x6BF666080CB9f3Dedf7478985d6674Ca260C9201');
const fan = getAddress('0xd0FB7e0A493FaB209C2beb5D131B0D85086D1F0D');
const fakeTx = '0x' + 'ab'.repeat(32);

// ---------- Post ----------
console.log('=== Post 事件 ===');
{
  const content = '刚把合约部署到 Arc 了，发一条帖子只要 $0.0014。';
  const ts = 1790852382n;
  const topics = encodeEventTopics({
    abi: [{ type: 'event', name: 'Post', inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'author', type: 'address', indexed: true },
      { name: 'parent', type: 'uint256', indexed: true },
      { name: 'content', type: 'string', indexed: false },
      { name: 'timestamp', type: 'uint64', indexed: false },
    ]}],
    eventName: 'Post',
    args: { id: 42n, author, parent: 7n },
  });
  const data = encodeAbiParameters([{ type: 'string' }, { type: 'uint64' }], [content, ts]);
  const log = { topics, data, transactionHash: fakeTx, blockNumber: '0x169f000' };

  const r = decodePost(log);
  eq('id', r.id, 42);
  eq('author', r.author, author.toLowerCase());
  eq('parent', r.parent, 7);
  eq('content', r.content, content);
  eq('timestamp', r.timestamp, 1790852382);
}

// ---------- Tipped ----------
console.log('\n=== Tipped 事件 ===');
{
  const note = '写得好，请喝咖啡';
  const amount = 250000000000000000n; // 0.25 USDC（18 位）
  const topics = encodeEventTopics({
    abi: [{ type: 'event', name: 'Tipped', inputs: [
      { name: 'postId', type: 'uint256', indexed: true },
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'note', type: 'string', indexed: false },
    ]}],
    eventName: 'Tipped',
    args: { postId: 42n, from: fan, to: author },
  });
  const data = encodeAbiParameters([{ type: 'uint256' }, { type: 'string' }], [amount, note]);
  const log = { topics, data, transactionHash: fakeTx, blockNumber: '0x169f001' };

  const r = decodeTipped(log);
  eq('postId', r.postId, 42);
  eq('from', r.from, fan.toLowerCase());
  eq('to', r.to, author.toLowerCase());
  eq('amount', r.amount, '0.25');
  eq('note', r.note, note);
}

// ---------- IdentityBound ----------
console.log('\n=== IdentityBound 事件 ===');
{
  const platform = 'github';
  const username = 'octocat';
  const topics = encodeEventTopics({
    abi: [{ type: 'event', name: 'IdentityBound', inputs: [
      { name: 'wallet', type: 'address', indexed: true },
      { name: 'platform', type: 'string', indexed: false },
      { name: 'username', type: 'string', indexed: false },
    ]}],
    eventName: 'IdentityBound',
    args: { wallet: author },
  });
  const data = encodeAbiParameters([{ type: 'string' }, { type: 'string' }], [platform, username]);
  const log = { topics, data, blockNumber: '0x169f002' };

  const r = decodeIdentity(log);
  eq('wallet', r.wallet, author.toLowerCase());
  eq('platform', r.platform, platform);
  eq('username', r.username, username);
}

// ---------- 边界：超长内容 ----------
console.log('\n=== 边界：5000 字内容 ===');
{
  const content = '长'.repeat(5000);
  const topics = encodeEventTopics({
    abi: [{ type: 'event', name: 'Post', inputs: [
      { name: 'id', type: 'uint256', indexed: true },
      { name: 'author', type: 'address', indexed: true },
      { name: 'parent', type: 'uint256', indexed: true },
      { name: 'content', type: 'string', indexed: false },
      { name: 'timestamp', type: 'uint64', indexed: false },
    ]}],
    eventName: 'Post',
    args: { id: 1n, author, parent: 0n },
  });
  const data = encodeAbiParameters([{ type: 'string' }, { type: 'uint64' }], [content, 1n]);
  const r = decodePost({ topics, data, transactionHash: fakeTx, blockNumber: '0x1' });
  eq('长度', r.content.length, 5000);
  eq('内容一致', r.content === content, true);
}

console.log(`\n=== 结果: ${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail ? 1 : 0);
