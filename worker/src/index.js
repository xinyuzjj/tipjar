/**
 * TipJar Social — 索引器 + API
 *
 * 职责：
 *  1) Cron 拉取 TipJarSocial 合约的 Post / Tipped / IdentityBound 事件
 *  2) 提供只读 API 给推特式前端
 *
 * 设计要点：
 *  - 帖子内容只在事件里（不在 storage），索引器就是"链上数据库的读层"
 *  - 手写 ABI 解码（不打包 viem，Worker 体积小、冷启动快）
 *  - 事件签名 topic 由 scripts/gen-topics.mjs 计算后写进 wrangler.toml
 */

// 事件签名 topic（运行时从 env 注入，见文件底部）
const TOPICS = { Post: '', Tipped: '', IdentityBound: '' };

// ---------- 工具 ----------
const dec = new TextDecoder();

function hexToBytes(hex) {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
const topicToAddress = (t) => '0x' + t.slice(26).toLowerCase();
const topicToUint = (t) => Number(BigInt(t));
const hexToBigInt = (hex) => BigInt(hex === '0x' ? '0x0' : hex);

/** Arc 上 USDC 原生余额是 18 位（gas 与 msg.value 都用它） */
function formatUsdc(raw) {
  const s = raw.toString().padStart(19, '0');
  const int = s.slice(0, -18);
  const frac = s.slice(-18).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}

function readOffset(d, headPos) {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  return Number(dv.getBigUint64(headPos + 24));
}
function readString(d, offset) {
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const len = Number(dv.getBigUint64(offset + 24));
  return dec.decode(d.slice(offset + 32, offset + 32 + len));
}

// ---------- 事件解码 ----------
/**
 * event Post(uint256 indexed id, address indexed author, uint256 indexed parent,
 *            string content, uint64 timestamp)
 * topics: [sig, id, author, parent]
 * data  : [contentOffset(32) | timestamp(32) | content(len+data)]
 */
export function decodePost(log) {
  const d = hexToBytes(log.data);
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const contentOff = readOffset(d, 0);
  const timestamp = Number(dv.getBigUint64(32 + 24));
  return {
    id: topicToUint(log.topics[1]),
    author: topicToAddress(log.topics[2]),
    parent: topicToUint(log.topics[3]),
    content: readString(d, contentOff),
    timestamp,
    txHash: log.transactionHash,
    blockNumber: Number(hexToBigInt(log.blockNumber)),
  };
}

/**
 * event Tipped(uint256 indexed postId, address indexed from, address indexed to,
 *              uint256 amount, string note)
 * topics: [sig, postId, from, to]
 * data  : [amount(32) | noteOffset(32) | note(len+data)]
 */
export function decodeTipped(log) {
  const d = hexToBytes(log.data);
  const amount = hexToBigInt('0x' + log.data.slice(2, 66));
  const noteOff = readOffset(d, 32);
  return {
    postId: topicToUint(log.topics[1]),
    from: topicToAddress(log.topics[2]),
    to: topicToAddress(log.topics[3]),
    amount: formatUsdc(amount),
    note: readString(d, noteOff),
    txHash: log.transactionHash,
    blockNumber: Number(hexToBigInt(log.blockNumber)),
  };
}

/**
 * event IdentityBound(address indexed wallet, string platform, string username)
 * topics: [sig, wallet]
 * data  : [platformOffset(32) | usernameOffset(32) | platform | username]
 */
export function decodeIdentity(log) {
  const d = hexToBytes(log.data);
  return {
    wallet: topicToAddress(log.topics[1]),
    platform: readString(d, readOffset(d, 0)),
    username: readString(d, readOffset(d, 32)),
    blockNumber: Number(hexToBigInt(log.blockNumber)),
  };
}

/**
 * UsernameSet(address indexed wallet, string username)
 * topics[1] = wallet（indexed），data 里只有一个 string。
 */
export function decodeUsername(log) {
  const d = hexToBytes(log.data);
  return {
    wallet: topicToAddress(log.topics[1]),
    username: readString(d, readOffset(d, 0)),
    blockNumber: Number(hexToBigInt(log.blockNumber)),
  };
}

// ---------- RPC ----------
async function rpc(env, method, params) {
  const res = await fetch(env.RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await res.json();
  if (j.error) throw new Error(`${method}: ${j.error.message}`);
  return j.result;
}

/** 带退避重试的 RPC：Arc 的公共 RPC 会限流，尤其从 Cloudflare 网络出口 */
async function rpcRetry(env, method, params, attempts = 4) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await rpc(env, method, params);
    } catch (e) {
      lastErr = e;
      const msg = String(e.message || e);
      const throttled = /rate limit|too many|429|timeout/i.test(msg);
      if (!throttled || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));  // 0.8s, 1.6s, 2.4s
    }
  }
  throw lastErr;
}
const hexBlock = (n) => '0x' + Number(n).toString(16);

// ---------- 索引 ----------
const MAX_FEED = 500;
const MAX_USER_POSTS = 200;

export async function indexOnce(env, { force = false } = {}) {
  const contract = (env.CONTRACT_ADDRESS || '').toLowerCase();
  if (!contract) throw new Error('CONTRACT_ADDRESS 未配置');

  // 支持同时索引旧合约：换合约不该让已经上链的帖子消失
  const legacy = (env.LEGACY_CONTRACT || '').toLowerCase();
  const addresses = legacy && legacy !== contract ? [contract, legacy] : contract;

  const latest = Number(hexToBigInt(await rpcRetry(env, 'eth_blockNumber', [])));
  const lookback = Number(env.LOOKBACK_BLOCKS || 20000);

  const cursor = force ? null : await env.TIPS.get('cursor', 'json');
  const from = cursor ? cursor + 1 : latest - lookback;
  if (from > latest) return { scanned: 0, posts: 0, tips: 0, latest, from };

  // 分段扫描：RPC 对单次 getLogs 的区块跨度有上限，连续请求还会限流
  const CHUNK = Number(env.CHUNK_BLOCKS || 5000);
  const logs = [];
  let seg = 0;
  for (let f = from; f <= latest; f += CHUNK) {
    const t = Math.min(f + CHUNK - 1, latest);
    if (seg++ > 0) await new Promise((r) => setTimeout(r, 500)); // 避开 rate limit
    const part = await rpcRetry(env, 'eth_getLogs', [
      {
        address: addresses,
        topics: [[TOPICS.Post, TOPICS.Tipped, TOPICS.IdentityBound, TOPICS.UsernameSet]],
        fromBlock: hexBlock(f),
        toBlock: hexBlock(t),
      },
    ]);
    logs.push(...part);
  }

  const posts = [];
  const tips = [];
  const binds = [];
  const names = [];

  for (const log of logs) {
    try {
      const t0 = log.topics[0];
      if (t0 === TOPICS.Post) posts.push(decodePost(log));
      else if (t0 === TOPICS.Tipped) tips.push(decodeTipped(log));
      else if (t0 === TOPICS.IdentityBound) binds.push(decodeIdentity(log));
      else if (t0 === TOPICS.UsernameSet) names.push(decodeUsername(log));
    } catch (e) {
      console.error('decode failed', log.transactionHash, e.message);
    }
  }

  if (posts.length) {
    const prev = (await env.TIPS.get('feed', 'json')) || [];
    // 去重：force 重扫时同一条帖子会被抓到多次
    const seen = new Set();
    const merged = [...posts, ...prev]
      .filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
      .sort((a, b) => b.id - a.id)
      .slice(0, MAX_FEED);
    await env.TIPS.put('feed', JSON.stringify(merged));

    const byAuthor = {};
    for (const p of merged) (byAuthor[p.author.toLowerCase()] ||= []).push(p);
    for (const [a, list] of Object.entries(byAuthor)) {
      await env.TIPS.put(`user:${a}`, JSON.stringify(list.slice(0, MAX_USER_POSTS)));
    }
    for (const p of posts) await env.TIPS.put(`post:${p.id}`, JSON.stringify(p));

    // 按父帖聚合评论（parent != 0 的都是回复）
    const byParent = {};
    for (const p of merged) {
      if (p.parent && p.parent !== 0) (byParent[p.parent] ||= []).push(p);
    }
    for (const [pid, list] of Object.entries(byParent)) {
      list.sort((a, b) => a.id - b.id); // 评论按时间正序
      await env.TIPS.put(`replies:${pid}`, JSON.stringify(list.slice(0, 200)));
    }
    // 顶层帖的评论计数
    const counts = {};
    for (const p of merged) if (p.parent && p.parent !== 0) counts[p.parent] = (counts[p.parent] || 0) + 1;
    await env.TIPS.put('reply_counts', JSON.stringify(counts));
  }

  if (tips.length) {
    const prev = (await env.TIPS.get('tips', 'json')) || [];
    const seenT = new Set();
    const merged = [...tips, ...prev]
      .filter((x) => (seenT.has(x.txHash) ? false : (seenT.add(x.txHash), true)))
      .sort((a, b) => b.blockNumber - a.blockNumber)
      .slice(0, MAX_FEED);
    await env.TIPS.put('tips', JSON.stringify(merged));

    const byPost = {};
    for (const t of merged) (byPost[t.postId] ||= []).push(t);
    for (const [pid, list] of Object.entries(byPost)) {
      const total = list.reduce((s, x) => s + Number(x.amount), 0);
      await env.TIPS.put(
        `posttips:${pid}`,
        JSON.stringify({ total: Number(total.toFixed(6)), count: list.length, items: list.slice(0, 100) })
      );
    }

    const byTo = {};
    for (const t of merged) {
      const k = t.to.toLowerCase();
      byTo[k] ||= { to: t.to, total: 0, count: 0 };
      byTo[k].total += Number(t.amount);
      byTo[k].count += 1;
    }
    const board = Object.values(byTo)
      .sort((a, b) => b.total - a.total)
      .slice(0, 50)
      .map((x) => ({ ...x, total: Number(x.total.toFixed(6)) }));
    await env.TIPS.put('leaderboard', JSON.stringify(board));
  }

  if (binds.length || names.length) {
    const prev = (await env.TIPS.get('identities', 'json')) || {};
    for (const b of binds) {
      const k = b.wallet.toLowerCase();
      prev[k] ||= {};
      prev[k][b.platform] = b.username;
    }
    for (const n of names) {
      const k = n.wallet.toLowerCase();
      prev[k] ||= {};
      prev[k].username = n.username;   // 链上唯一用户名
    }
    await env.TIPS.put('identities', JSON.stringify(prev));
  }

  await env.TIPS.put('cursor', JSON.stringify(latest));
  await env.TIPS.put('last_indexed_at', JSON.stringify(Date.now()));

  // ---------------------------------------------------------------- 积分
  // 分数完全由链上行为推导，没有后台改分接口——规则公开、可复算。
  const SCORE = {
    post: 10,        // 发一条顶层帖
    reply: 5,        // 回一条
    gotReply: 2,     // 被别人回复
    tipSent: 20,     // 打赏别人
    tipReceived: 30, // 收到打赏
    bind: 50,        // 绑定社交账号
    username: 50,    // 设置用户名
  };

  const feedAll = (await env.TIPS.get('feed', 'json')) || [];
  const tipsAll = (await env.TIPS.get('tips', 'json')) || [];
  const identsAll = (await env.TIPS.get('identities', 'json')) || {};

  const acc = {};   // 小写地址 => {addr, score, posts, replies, tipsIn, tipsOut, tipAmountIn, ...}
  const touch = (a) => {
    const k = (a || '').toLowerCase();
    if (!k) return null;
    acc[k] ||= { addr: a, score: 0, posts: 0, replies: 0, gotReplies: 0,
                 tipsIn: 0, tipsOut: 0, amountIn: 0, amountOut: 0, firstSeen: null };
    return acc[k];
  };

  for (const p of feedAll) {
    const a = touch(p.author);
    if (!a) continue;
    if (p.parent && p.parent !== 0) { a.score += SCORE.reply; a.replies++; }
    else { a.score += SCORE.post; a.posts++; }
    if (!a.firstSeen || p.timestamp < a.firstSeen) a.firstSeen = p.timestamp;
    // 被回复：父帖作者得分
    if (p.parent && p.parent !== 0) {
      const parent = feedAll.find((x) => x.id === p.parent);
      if (parent && parent.author.toLowerCase() !== a.addr.toLowerCase()) {
        const pa = touch(parent.author);
        if (pa) { pa.score += SCORE.gotReply; pa.gotReplies++; }
      }
    }
  }

  for (const t of tipsAll) {
    const from = touch(t.from), to = touch(t.to);
    const amt = Number(t.amount) || 0;
    if (from) { from.score += SCORE.tipSent; from.tipsOut++; from.amountOut += amt; }
    if (to)   { to.score   += SCORE.tipReceived; to.tipsIn++; to.amountIn += amt; }
  }

  for (const [k, v] of Object.entries(identsAll)) {
    const a = touch(k);
    if (!a) continue;
    if (v.github || v.x || v.site) a.score += SCORE.bind;
    if (v.username) a.score += SCORE.username;
    a.username = v.username || null;
    a.github = v.github || null;
  }

  // ---------------------------------------------------------------- 成就
  // 每个成就都是「链上事实」的直接映射，不放水、不靠人工授予。
  // points = 解锁时一次性奖励的积分，越难拿的给得越多。
  const ACHIEVEMENTS = [
    { id:'first_post',    name:'创世帖',     en:'Genesis Post',    desc:'发出第一条帖子',        enDesc:'Publish your first post',      icon:'✍️', points:20 },
    { id:'ten_posts',     name:'笔耕不辍',   en:'Prolific',        desc:'累计发出 10 条帖子',    enDesc:'Publish 10 posts',              icon:'📚', points:50 },
    { id:'fifty_posts',   name:'多产作家',   en:'Wordsmith',       desc:'累计发出 50 条帖子',    enDesc:'Publish 50 posts',              icon:'🖋️', points:150 },
    { id:'first_reply',   name:'话痨',       en:'Chatterbox',      desc:'回复过别人的帖子',      enDesc:'Reply to someone',              icon:'💬', points:15 },
    { id:'twenty_replies',name:'讨论家',     en:'Debater',         desc:'累计回复 20 次',        enDesc:'Post 20 replies',               icon:'🗣️', points:60 },
    { id:'got_reply',     name:'被回应',     en:'Heard',           desc:'收到过别人的回复',      enDesc:'Receive a reply',               icon:'🔔', points:15 },
    { id:'ten_got_reply', name:'人气王',     en:'Popular',         desc:'累计收到 10 次回复',    enDesc:'Receive 10 replies',            icon:'🔥', points:60 },
    { id:'first_tip',     name:'慷慨解囊',   en:'Generous',        desc:'第一次打赏别人',        enDesc:'Send your first tip',           icon:'🎁', points:25 },
    { id:'ten_tips',      name:'常客',       en:'Regular',         desc:'累计打赏 10 次',        enDesc:'Send 10 tips',                  icon:'🧧', points:80 },
    { id:'big_tip',       name:'金主',       en:'Patron',          desc:'累计打赏超过 1 USDC',   enDesc:'Tip 1+ USDC in total',         icon:'👑', points:100 },
    { id:'whale_tip',     name:'巨鲸',       en:'Whale',           desc:'累计打赏超过 10 USDC',  enDesc:'Tip 10+ USDC in total',        icon:'🐋', points:300 },
    { id:'got_tip',       name:'被赏识',     en:'Appreciated',     desc:'收到过打赏',            enDesc:'Receive a tip',                 icon:'💰', points:30 },
    { id:'earned_1',      name:'创作者',     en:'Creator',         desc:'累计收到 1 USDC 打赏',  enDesc:'Earn 1+ USDC',                 icon:'🌟', points:80 },
    { id:'earned_10',     name:'明星创作者', en:'Star Creator',    desc:'累计收到 10 USDC 打赏', enDesc:'Earn 10+ USDC',                icon:'💎', points:250 },
    { id:'bound',         name:'实名认证',   en:'Verified',        desc:'绑定了社交账号',        enDesc:'Bind a social account',        icon:'🔗', points:50 },
    { id:'named',         name:'有名有姓',   en:'Named',           desc:'设置了链上用户名',      enDesc:'Claim a username',              icon:'🏷️', points:50 },
    { id:'checkin_1',     name:'初次签到',   en:'First Check-in',  desc:'完成一次每日签到',      enDesc:'Complete your first check-in',  icon:'📅', points:20 },
    { id:'checkin_3',     name:'三日打鱼',   en:'Streak 3',        desc:'连续签到 3 天',         enDesc:'3-day check-in streak',        icon:'📆', points:50 },
    { id:'checkin_7',     name:'坚持一周',   en:'Streak 7',        desc:'连续签到 7 天',         enDesc:'7-day check-in streak',        icon:'🗓️', points:100 },
    { id:'checkin_30',    name:'月度全勤',   en:'Streak 30',       desc:'连续签到 30 天',        enDesc:'30-day check-in streak',       icon:'🏅', points:400 },
  ];

  // ---------------------------------------------------------------- 每日签到
  // 签到 = 发一条内容为 #checkin 的帖子。不需要改合约：
  // 链上时间戳 + 作者地址天然防作弊，同一天同一地址只算一次。
  const CHECKIN_TAG = '#checkin';
  const dayOf = (ts) => new Date(ts * 1000).toISOString().slice(0, 10); // UTC 日期

  const checkins = {};   // 小写地址 => Set(日期)
  for (const p of feedAll) {
    if ((p.content || '').trim().toLowerCase().startsWith(CHECKIN_TAG)) {
      const k = p.author.toLowerCase();
      (checkins[k] ||= new Set()).add(dayOf(p.timestamp));
    }
  }

  const CHECKIN_BASE = 15;    // 每天签到基础分
  const CHECKIN_STREAK_BONUS = 5;  // 每多连续一天 +5
  const CHECKIN_STREAK_CAP = 10;   // 连续加成最多 10 天

  /** 从今天往回数连续签到天数 */
  function streakOf(days) {
    if (!days || !days.size) return 0;
    let n = 0;
    const d = new Date();
    for (;;) {
      const key = d.toISOString().slice(0, 10);
      if (!days.has(key)) {
        // 允许「今天还没签」——从昨天开始数
        if (n === 0) { d.setUTCDate(d.getUTCDate() - 1); 
          if (!days.has(d.toISOString().slice(0, 10))) return 0; continue; }
        break;
      }
      n++;
      d.setUTCDate(d.getUTCDate() - 1);
    }
    return n;
  }

  const checkinInfo = {};
  for (const [k, days] of Object.entries(checkins)) {
    const a = touch(k);
    if (!a) continue;
    const streak = streakOf(days);
    const bonus = Math.min(Math.max(streak - 1, 0), CHECKIN_STREAK_CAP) * CHECKIN_STREAK_BONUS;
    a.score += days.size * CHECKIN_BASE + bonus;
    a.checkinDays = days.size;
    a.checkinStreak = streak;
    a.checkinBonus = bonus;
    const today = new Date().toISOString().slice(0, 10);
    a.checkedInToday = days.has(today);
    checkinInfo[k] = { days: days.size, streak, bonus, today: a.checkedInToday };
  }

  const earned = {};
  for (const [k, a] of Object.entries(acc)) {
    const list = [];
    const st = a.checkinStreak || 0;
    if (a.posts >= 1) list.push('first_post');
    if (a.posts >= 10) list.push('ten_posts');
    if (a.posts >= 50) list.push('fifty_posts');
    if (a.replies >= 1) list.push('first_reply');
    if (a.replies >= 20) list.push('twenty_replies');
    if (a.gotReplies >= 1) list.push('got_reply');
    if (a.gotReplies >= 10) list.push('ten_got_reply');
    if (a.tipsOut >= 1) list.push('first_tip');
    if (a.tipsOut >= 10) list.push('ten_tips');
    if (a.amountOut >= 1) list.push('big_tip');
    if (a.amountOut >= 10) list.push('whale_tip');
    if (a.tipsIn >= 1) list.push('got_tip');
    if (a.amountIn >= 1) list.push('earned_1');
    if (a.amountIn >= 10) list.push('earned_10');
    if (a.github || a.x || a.site) list.push('bound');
    if (a.username) list.push('named');
    if ((a.checkinDays || 0) >= 1) list.push('checkin_1');
    if (st >= 3) list.push('checkin_3');
    if (st >= 7) list.push('checkin_7');
    if (st >= 30) list.push('checkin_30');
    a.achievements = list;
    // 成就奖励积分
    a.achievementPoints = list.reduce((s, id) => {
      const def = ACHIEVEMENTS.find((x) => x.id === id);
      return s + (def ? def.points : 0);
    }, 0);
    a.score += a.achievementPoints;
    earned[k] = list;
  }

  const scores = Object.values(acc)
    .filter((a) => a.score > 0)
    .sort((x, y) => y.score - x.score)
    .map((a, i) => ({ ...a, rank: i + 1, amountIn: Number(a.amountIn.toFixed(6)),
                      amountOut: Number(a.amountOut.toFixed(6)) }));

  await env.TIPS.put('scores', JSON.stringify(scores));
  await env.TIPS.put('achievements', JSON.stringify(earned));
  await env.TIPS.put('ach_defs', JSON.stringify(ACHIEVEMENTS));
  await env.TIPS.put('checkins', JSON.stringify(checkinInfo));

  return { scanned: latest - from + 1, posts: posts.length, tips: tips.length,
           binds: binds.length, names: names.length, scored: scores.length, latest, from };
}

// ---------- HTTP ----------
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,OPTIONS',
  'access-control-allow-headers': 'content-type',
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS },
  });

async function handle(env, url) {
  const p = url.pathname;

  if (p === '/api/health')
    return json({
      ok: true,
      contract: env.CONTRACT_ADDRESS,
      chain: env.CHAIN,
      cursor: await env.TIPS.get('cursor', 'json'),
      lastIndexedAt: await env.TIPS.get('last_indexed_at', 'json'),
    });

  if (p === '/api/feed') {
    const limit = Math.min(Number(url.searchParams.get('limit') || 50), MAX_FEED);
    const feed = (await env.TIPS.get('feed', 'json')) || [];
    const counts = (await env.TIPS.get('reply_counts', 'json')) || {};
    const isCheckin = (x) => (x.content || '').trim().toLowerCase().startsWith('#checkin');
    // 只返回顶层帖，附上评论数；签到帖不算内容帖，不进流
    const top = feed.filter((x) => !x.parent && !isCheckin(x)).slice(0, limit);
    return json({
      count: top.length,
      items: top.map((x) => ({ ...x, replies: counts[x.id] || 0 })),
    });
  }

  // 某条帖子的评论
  if (p.startsWith('/api/replies/')) {
    const id = p.slice('/api/replies/'.length);
    const list = (await env.TIPS.get('replies:' + id, 'json')) || [];
    return json({ postId: Number(id), count: list.length, items: list });
  }

  if (p === '/api/tips') {
    const limit = Math.min(Number(url.searchParams.get('limit') || 50), MAX_FEED);
    const tips = (await env.TIPS.get('tips', 'json')) || [];
    return json({ count: tips.length, items: tips.slice(0, limit) });
  }

  if (p === '/api/leaderboard')
    return json({ items: (await env.TIPS.get('leaderboard', 'json')) || [] });

  if (p === '/api/identities')
    return json({ items: (await env.TIPS.get('identities', 'json')) || {} });

  // 积分榜
  if (p === '/api/scores') {
    const limit = Math.min(Number(url.searchParams.get('limit') || 50), 200);
    const all = (await env.TIPS.get('scores', 'json')) || [];
    return json({ count: all.length, items: all.slice(0, limit) });
  }

  // 成就定义 + 各地址已获得
  if (p === '/api/achievements') {
    const earned = (await env.TIPS.get('achievements', 'json')) || {};
    const defs = (await env.TIPS.get('ach_defs', 'json')) || [];
    return json({ defs, earned });
  }

  // 签到状态
  if (p.startsWith('/api/checkin/')) {
    const addr = decodeURIComponent(p.slice('/api/checkin/'.length)).toLowerCase();
    const all = (await env.TIPS.get('checkins', 'json')) || {};
    const me = all[addr] || { days: 0, streak: 0, bonus: 0, today: false };
    return json({ ...me, base: 15, streakBonus: 5, streakCap: 10 });
  }

  // 单个地址的积分 + 成就
  if (p.startsWith('/api/score/')) {
    const addr = decodeURIComponent(p.slice('/api/score/'.length)).toLowerCase();
    const all = (await env.TIPS.get('scores', 'json')) || [];
    const me = all.find((x) => x.addr.toLowerCase() === addr) || null;
    const earned = (await env.TIPS.get('achievements', 'json')) || {};
    return json({ score: me, achievements: earned[addr] || [] });
  }

  if (p.startsWith('/api/post/')) {
    const id = p.slice('/api/post/'.length);
    const post = await env.TIPS.get(`post:${id}`, 'json');
    if (!post) return json({ error: 'not found' }, 404);
    const tips = (await env.TIPS.get(`posttips:${id}`, 'json')) || { total: 0, count: 0, items: [] };
    return json({ post, tips });
  }

  if (p.startsWith('/api/user/')) {
    const addr = p.slice('/api/user/'.length).toLowerCase();
    const posts = (await env.TIPS.get(`user:${addr}`, 'json')) || [];
    const ids = (await env.TIPS.get('identities', 'json')) || {};
    return json({ address: addr, identity: ids[addr] || {}, count: posts.length, items: posts });
  }

  if (p === '/api/oauth/config') {
    // 只暴露 client_id（公开信息），secret 永不返回前端
    return json({
      github: env.GITHUB_CLIENT_ID || '',
      google: env.GOOGLE_CLIENT_ID || '',
      twitter: env.TWITTER_CLIENT_ID || '',
    });
  }

  // OAuth 回调：用授权码换 token，取用户名，然后重定向前端
  if (p.startsWith('/api/oauth/') && p.endsWith('/callback')) {
    const provider = p.slice('/api/oauth/'.length, -'/callback'.length);
    const code = url.searchParams.get('code');
    const ret = url.searchParams.get('return') || '/';
    if (!code) return new Response('缺少 code', { status: 400 });

    let username = '';
    try {
      if (provider === 'github') {
        const tok = await (await fetch('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code,
          }),
        })).json();
        if (!tok.access_token) throw new Error(tok.error_description || 'token 交换失败');
        const me = await (await fetch('https://api.github.com/user', {
          headers: { authorization: `Bearer ${tok.access_token}`, 'user-agent': 'tipjar-on-arc' },
        })).json();
        username = me.login || '';
      } else if (provider === 'google') {
        const tok = await (await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: env.GOOGLE_CLIENT_ID,
            client_secret: env.GOOGLE_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: `${url.origin}/api/oauth/google/callback`,
          }),
        })).json();
        if (!tok.access_token) throw new Error(tok.error_description || 'token 交换失败');
        const me = await (await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { authorization: `Bearer ${tok.access_token}` },
        })).json();
        username = me.email || me.name || '';
      } else {
        return new Response('暂不支持该 provider', { status: 400 });
      }
    } catch (e) {
      return new Response(`OAuth 失败: ${e.message}`, { status: 500 });
    }

    if (!username) return new Response('拿不到用户名', { status: 500 });

    // 回到前端，带上结果
    const back = new URL(ret);
    back.searchParams.set('oauth', provider);
    back.searchParams.set('username', username);
    return Response.redirect(back.toString(), 302);
  }

  if (p === '/api/index') {
    const r = await indexOnce(env, { force: url.searchParams.get('force') === '1' });
    return json(r);
  }

  return json({ error: 'not found' }, 404);
}

function loadTopics(env) {
  TOPICS.Post = env.TOPIC_POST || '';
  TOPICS.Tipped = env.TOPIC_TIPPED || '';
  TOPICS.IdentityBound = env.TOPIC_IDENTITY || '';
  TOPICS.UsernameSet = env.TOPIC_USERNAME || '';
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname.startsWith('/api/')) {
      try {
        loadTopics(env);
        return await handle(env, url);
      } catch (e) {
        return json({ error: String(e.message || e) }, 500);
      }
    }
    return new Response('TipJar Social API — see /api/health', {
      headers: { 'content-type': 'text/plain; charset=utf-8', ...CORS },
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      (async () => {
        loadTopics(env);
        await indexOnce(env);
      })().catch((e) => console.error('index failed', e))
    );
  },
};
