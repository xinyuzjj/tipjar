/**
 * TipJar — 链上推特 前端
 * 发帖 = TipJarSocial.post(content) → 内容进链上事件，永久不可删改
 * 打赏 = tipPost(postId, note)     → USDC 直达作者，零托管
 * 绑定 = OAuth 授权 → 一次链上 bind() 声明
 */
import {
  createPublicClient, createWalletClient, custom, http, defineChain,
  getAddress, parseUnits, formatUnits, keccak256, toBytes,
} from 'https://esm.sh/viem@2.38.0';

// ---------------------------------------------------------------- i18n
// 默认英文；中文是完整对译。键名与 HTML 的 data-i18n 一一对应。
const I18N = {
  en: {
    page_title: 'TipJar — On-chain Twitter',
    nav_home:'Home', nav_profile:'Profile', nav_posts:'My Posts', nav_score:'My Score',
    nav_ach:'Achievements', nav_repos:'GitHub Projects',
    btn_post:'Post', btn_set:'Set', btn_connect:'Connect Wallet', btn_set_identity:'Set up identity',
    btn_checkin:'Daily check-in +15', btn_checkin_done:'Checked in today',
    lbl_onchain_cum:'from on-chain actions', lbl_received:'USDC received', top20:'Top 20',
    badge_no_fork:'forks excluded',
    rail_chain:'On-chain', rail_network:'Network', val_mainnet:'Arc Mainnet',
    rail_scoreboard:'Leaderboard', rail_tipboard:'Tip Leaderboard', rail_recent:'Latest Tips',
    oauth_gh:'Continue with GitHub', oauth_x:'Continue with X',
    id_desc:'Username: 3-20 chars, lowercase letters, digits and underscores only —',
    id_desc2:'. Binding uses one-click OAuth, no manual typing. Both show on your posts.',
    score_rule_line:'Post +10 · Reply +5 · Reply received +2 · Tip +20 · Tip received +30 · Bind account +50 · Username +50',

    val_chain:'chainId 5042 · gas in USDC', rail_indexed:'Indexed posts',
    hint_immutable:'Permanent, immutable', rail_cost:'Post cost', val_cost:'~$0.0014',
    val_cost_hint:'200 chars · 20 gwei', rail_contract:'Contract ↗',
    footer_note:'Posts permanent on-chain · tips non-custodial',
    stat_posts:'Posts', stat_users:'Participants', stat_tips:'Total tipped',
    stat_my_score:'My score', stat_streak:'Check-in streak',
    acct_not_connected:'Not connected', acct_click_connect:'Click to connect',
    id_title:'Identity', id_badge:'On-chain unique · set once', id_username:'Username',
    id_bind:'Linked accounts', id_warn:'cannot be changed once set',
    ph_connect_first:'Connect wallet to view', score_rules:'Scoring rules',
    score_rules_note:'(all from on-chain actions, verifiable)', score_title:'My Score',
    about_title:'What is TipJar',
    feat1_t:'Posts are permanent',
    feat1_d:'Content is written into Arc event logs. No server can delete or alter it. ~$0.0014 per post.',
    feat2_t:'Zero-custody tipping',
    feat2_d:'USDC goes straight from your wallet to the author. The contract holds nothing and takes no cut.',
    feat3_t:'On-chain identity',
    feat3_d:'Usernames are globally unique, first-come-first-served. One-click OAuth binding, forks auto-excluded.',
    feat4_t:'Points & achievements',
    feat4_d:'Posting, replying and tipping earn points. 20 achievements unlock automatically from on-chain facts.',
    about_contract:'View contract ↗', loading:'Loading…', ph_bind_gh:'Bind GitHub to view',
    compose_ph:"What's new?",
    compose_hint:'Written on-chain permanently · ~$0.0014',
    empty_title:'No posts on-chain yet',
    empty_desc:'Your first post will be written into the Arc blockchain forever. No server can delete it, no one can alter it.',
    empty_cta:'Write the first one',
    indexer_down:'Cannot reach indexer', indexer_down_hint:'Start the worker on port 8788 for local dev',
    indexer_down_short:'Cannot reach indexer',
    act_tip:'Tip', act_reply:'Reply',
    tip_amount:'How much USDC to tip?', tip_note:'Note (optional)',
    reply_ph:'Say something…', reply_send:'Reply',
    cmt_loading:'Loading comments…', cmt_empty:'No comments yet', cmt_fail:'Failed to load',
    no_posts_yet:'No posts yet', load_failed:'Failed to load',
    wallet_missing:'No wallet detected. Install MetaMask / OKX Wallet / Rabby.',
    connect_failed:'Connect failed: ', connect_to_view:'Connect wallet to view',
    name_ph:'yourname', name_taken:'Already taken', name_ok:'Available ✓',
    name_format:'3-20 lowercase letters/digits/_', name_checking:'Checking…',
    name_yours:'This is your current name', name_locked:'Already changed, cannot change again',
    name_change_once:'You can change it only once',
    name_set_ok:'Set ✓', name_change_ok:'Changed ✓', name_set_failed:'Set failed: ',
    name_already_set:'Already set, cannot change',
    copied:'Copied ✓', copy_addr:'Copy address', view_explorer:'View in explorer', disconnect:'Disconnect',
    signing:'Waiting for signature…', onchain:'Sending…', posted_ok:'Written on-chain ✓',
    post_failed:'Failed: ', tip_failed:'Tip failed: ', reply_failed:'Reply failed: ',
    board_empty:'Nobody has received a tip yet. Tipping sends USDC straight to the author — the platform never holds it.',
    recent_empty:'No tips yet. Tipping is non-custodial: USDC goes from your wallet directly to the author.',
    score_empty:'Nobody has scored yet. Publish a post for +10, claim a username for +50.',
    no_activity:'No on-chain activity yet', rank:'Rank', rank_of:'Rank #',
    score_detail_posts:'Posts', score_detail_replies:'Replies', score_detail_got:'Replies received',
    score_detail_tips:'Tips sent', score_detail_earned:'Earned',
    score_board_empty:'Nobody has scored yet',
    you:'you', ach_progress:'unlocked', score_pts:'pts',
    checkin_ok:'Checked in!', checkin_already:'Already checked in today',
    checkin_need_wallet:'Connect your wallet to check in',
    checkin_streak_days:'day streak', checkin_days_total:'days total',
    gh_not_bound:'GitHub not bound yet — go to Profile → Identity to bind it',
    repo_loading:'Loading…', repo_none:'No original repos', repo_failed:'Failed: ',
    repo_filtered:'auto-filtered forks', repo_updated:'Updated',
    tips_count:'tips', reply_count:'replies', post_count:'posts', tips_unit:'tips',
    post_unit:'posts',
    unbound:'Not bound', bind_after_connect:'Connect wallet to bind',
    btn_identity_settings:'Identity settings', name_check_failed:'Check failed',
    name_confirm_change:'Confirm change', name_changed_label:'Changed',
    name_change_btn:'Change username', name_failed:'Failed', collapse:'Collapse',
    bind_authorized:'Authorized: ', bind_binding:'Binding…',
    bind_ok:'Bound ✓', bind_failed:'Bind failed: ',
    bind_confirm_q:'\n\nBind to your wallet? (one on-chain tx, ~$0.001)',
    bind_via:'Authorized via ',
    oauth_not_cfg:'OAuth not configured for ',
    oauth_go:'Create an OAuth App at ',
    oauth_fill:' and put client_id / client_secret into worker/wrangler.toml.',
  },
  zh: {
    page_title: 'TipJar — 链上推特',
    nav_home:'首页', nav_profile:'个人资料', nav_posts:'我的帖子', nav_score:'我的积分',
    nav_ach:'成就', nav_repos:'GitHub 项目',
    btn_post:'发帖', btn_set:'设置', btn_connect:'连接钱包', btn_set_identity:'设置身份',
    btn_checkin:'每日签到 +15', btn_checkin_done:'今天已签到',
    lbl_onchain_cum:'链上行为累计', lbl_received:'收到的 USDC', top20:'全站前 20',
    badge_no_fork:'已排除 fork',
    rail_chain:'链上动态', rail_network:'网络', val_mainnet:'Arc 主网',
    rail_scoreboard:'积分榜', rail_tipboard:'打赏榜', rail_recent:'最新打赏',
    oauth_gh:'用 GitHub 登录', oauth_x:'用 X 登录',
    id_desc:'用户名 3-20 位，只能用小写字母、数字、下划线，',
    id_desc2:'。绑定账号用一键授权，不用手填。两者都会显示在你的帖子上。',
    score_rule_line:'发帖 +10 · 回复 +5 · 被回复 +2 · 打赏 +20 · 收到打赏 +30 · 绑定账号 +50 · 设置用户名 +50',

    val_chain:'chainId 5042 · gas 用 USDC', rail_indexed:'已索引帖子',
    hint_immutable:'永久保存，不可删改', rail_cost:'发帖成本', val_cost:'约 $0.0014',
    val_cost_hint:'200 字 · 20 gwei', rail_contract:'合约地址 ↗',
    footer_note:'帖子永久上链 · 打赏零托管零抽成',
    stat_posts:'链上帖子', stat_users:'参与者', stat_tips:'打赏总额',
    stat_my_score:'我的积分', stat_streak:'连续签到',
    acct_not_connected:'未连接', acct_click_connect:'点击连接钱包',
    id_title:'身份', id_badge:'链上唯一 · 只能设置一次', id_username:'用户名',
    id_bind:'绑定账号', id_warn:'设置后不可修改',
    ph_connect_first:'连接钱包后显示', score_rules:'计分规则',
    score_rules_note:'（全部来自链上行为，可复算）', score_title:'我的积分',
    about_title:'TipJar 是什么',
    feat1_t:'帖子永久上链',
    feat1_d:'内容写进 Arc 的事件日志，没有服务器能删除或篡改。发一条约 $0.0014。',
    feat2_t:'打赏零托管',
    feat2_d:'USDC 从你的钱包直接转给作者，合约不留一分钱，也不抽成。',
    feat3_t:'身份链上唯一',
    feat3_d:'用户名全局唯一、先到先得；OAuth 一键绑定社交账号，自动排除 fork 项目。',
    feat4_t:'积分与成就',
    feat4_d:'发帖、回复、打赏都累积积分，20 个成就全部由链上事实自动解锁。',
    about_contract:'查看合约 ↗', loading:'加载中…', ph_bind_gh:'绑定 GitHub 后显示',
    compose_ph:'有什么新鲜事？',
    compose_hint:'永久写入链上 · 约 $0.0014',
    empty_title:'链上还没有帖子',
    empty_desc:'你的第一条帖子会永久写入 Arc 区块链。没有服务器能删除它，也没有人能篡改它。',
    empty_cta:'发第一条',
    indexer_down:'连不上索引器', indexer_down_hint:'本地开发需先启动 worker（8788 端口）',
    indexer_down_short:'连不上索引器',
    act_tip:'打赏', act_reply:'回复',
    tip_amount:'打赏多少 USDC？', tip_note:'附言（可留空）',
    reply_ph:'说点什么…', reply_send:'回复',
    cmt_loading:'加载评论…', cmt_empty:'还没有评论', cmt_fail:'加载失败',
    no_posts_yet:'还没有发过帖子', load_failed:'加载失败',
    wallet_missing:'没检测到钱包。请安装 MetaMask / OKX Wallet / Rabby。',
    connect_failed:'连接失败：', connect_to_view:'连接钱包后查看',
    name_ph:'yourname', name_taken:'已被占用', name_ok:'可用 ✓',
    name_format:'3-20 位小写字母/数字/_', name_checking:'检查中…',
    name_yours:'这是你现在的名字', name_locked:'已修改过，不可再改',
    name_change_once:'只能修改一次',
    name_set_ok:'已设置 ✓', name_change_ok:'修改成功 ✓', name_set_failed:'设置失败：',
    name_already_set:'已设置，不可修改',
    copied:'已复制 ✓', copy_addr:'复制地址', view_explorer:'在区块浏览器查看', disconnect:'断开连接',
    signing:'等待签名…', onchain:'上链中…', posted_ok:'已永久写入 ✓',
    post_failed:'失败：', tip_failed:'打赏失败：', reply_failed:'回复失败：',
    board_empty:'还没有人收到打赏。帖子里点打赏送出的 USDC 会直接进作者钱包，不走平台。',
    recent_empty:'还没有打赏记录。打赏是零托管的：USDC 从你的钱包直达作者。',
    score_empty:'还没有人得分。发一条帖子就能拿到 +10 分，设置用户名再 +50。',
    no_activity:'还没有链上行为', rank:'排名', rank_of:'全站第',
    score_detail_posts:'发帖', score_detail_replies:'回复', score_detail_got:'被回复',
    score_detail_tips:'打赏次数', score_detail_earned:'收到打赏',
    score_board_empty:'还没有人得分',
    you:'你', ach_progress:'已解锁', score_pts:'分',
    checkin_ok:'签到成功！', checkin_already:'今天已经签过了',
    checkin_need_wallet:'连接钱包后签到',
    checkin_streak_days:'天连续', checkin_days_total:'天累计',
    gh_not_bound:'还没有绑定 GitHub —— 去「个人资料 → 身份」绑定后显示',
    repo_loading:'拉取中…', repo_none:'没有原创项目', repo_failed:'拉取失败：',
    repo_filtered:'已自动过滤 fork 仓库', repo_updated:'更新',
    tips_count:'笔打赏', reply_count:'回复', post_count:'帖', tips_unit:'笔打赏',
    post_unit:'条',
    unbound:'未绑定身份', bind_after_connect:'连接钱包后绑定',
    btn_identity_settings:'身份设置', name_check_failed:'查询失败',
    name_confirm_change:'确认修改', name_changed_label:'已修改',
    name_change_btn:'修改用户名', name_failed:'失败', collapse:'收起',
    bind_authorized:'已授权：', bind_binding:'绑定中…',
    bind_ok:'绑定成功 ✓', bind_failed:'绑定失败：',
    bind_confirm_q:'\n\n绑定到你的钱包？（一次链上交易，约 $0.001）',
    bind_via:'已通过 ',
    oauth_not_cfg:'还没配置 OAuth：',
    oauth_go:'去 ',
    oauth_fill:' 创建一个 OAuth App，把 client_id / client_secret 填进 worker/wrangler.toml。',
  },
};

let LANG = localStorage.getItem('tipjar.lang') || 'en';
const t = (k) => (I18N[LANG] && I18N[LANG][k]) || I18N.en[k] || k;

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPh);
  });
  document.documentElement.lang = LANG === 'zh' ? 'zh-CN' : 'en';
  document.title = t('page_title');
  document.querySelectorAll('.langsw button').forEach((b) =>
    b.classList.toggle('on', b.dataset.lang === LANG));
}

function setLang(lang) {
  LANG = lang;
  localStorage.setItem('tipjar.lang', lang);
  applyI18n();
  refreshMe();          // 账户条/身份徽章是动态渲染的，要跟着语言重刷
  loadFeed();
  loadMyScore();
  loadMyAch();
  loadStats();
  loadCheckin();
  if (account) lockNameIfSet();
}

document.querySelectorAll('.langsw button').forEach((b) =>
  b.onclick = () => setLang(b.dataset.lang));

// ---------------------------------------------------------------- 配置
const CONTRACT = '0x005a5a60054e56d082ed0de3ccc6cb72c2a3350e';
const ARC_CHAIN_ID = 5042;
const MIN_GWEI = 20n;

const LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const API_BASE = LOCAL ? 'http://localhost:8788' : '';

const arc = defineChain({
  id: ARC_CHAIN_ID, name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
  blockExplorers: { default: { name: 'Arcscan', url: 'https://explorer.arc.io' } },
});

const ABI = [
  { type:'function', name:'post', stateMutability:'nonpayable',
    inputs:[{name:'content',type:'string'}], outputs:[{type:'uint256'}] },
  { type:'function', name:'reply', stateMutability:'nonpayable',
    inputs:[{name:'parent',type:'uint256'},{name:'content',type:'string'}], outputs:[{type:'uint256'}] },
  { type:'function', name:'bind', stateMutability:'nonpayable',
    inputs:[{name:'platform',type:'string'},{name:'username',type:'string'}], outputs:[] },
  { type:'function', name:'setUsername', stateMutability:'nonpayable',
    inputs:[{name:'name',type:'string'}], outputs:[] },
  { type:'function', name:'usernameOf', stateMutability:'view',
    inputs:[{name:'',type:'address'}], outputs:[{type:'string'}] },
  { type:'function', name:'ownerOfName', stateMutability:'view',
    inputs:[{name:'',type:'bytes32'}], outputs:[{type:'address'}] },
  { type:'function', name:'isNameTaken', stateMutability:'view',
    inputs:[{name:'name',type:'string'}], outputs:[{type:'bool'}] },
  { type:'function', name:'tipPost', stateMutability:'payable',
    inputs:[{name:'postId',type:'uint256'},{name:'note',type:'string'}], outputs:[] },
];

const publicClient = createPublicClient({ chain: arc, transport: http() });

// ---------------------------------------------------------------- 工具
const $ = (s) => document.querySelector(s);
const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '—');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const initials = (s) => (s || '?').replace(/^0x/, '').slice(0, 2).toUpperCase();
const ago = (ts) => {
  if (!ts) return '';
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return `${Math.max(d, 1)}${LANG==='zh'?'秒':'s'}`;
  if (d < 3600) return `${Math.floor(d / 60)}${LANG==='zh'?'分钟':'m'}`;
  if (d < 86400) return `${Math.floor(d / 3600)}${LANG==='zh'?'小时':'h'}`;
  return new Date(ts * 1000).toLocaleDateString('zh-CN', { month:'short', day:'numeric' });
};
const VER = `<svg class="ver" viewBox="0 0 24 24" fill="currentColor"><path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81C14.67 2.63 13.43 1.75 12 1.75s-2.67.88-3.34 2.19c-1.39-.46-2.9-.2-3.91.81s-1.27 2.52-.81 3.91C2.63 9.33 1.75 10.57 1.75 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.27 3.91.81c.67 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.34-2.19c1.39.46 2.9.2 3.91-.81s1.27-2.52.81-3.91c1.31-.67 2.19-1.91 2.19-3.34zm-11.71 4.2L6.8 12.46l1.41-1.42 2.26 2.26 4.8-5.23 1.47 1.36-6.2 6.77z"/></svg>`;

async function api(path) {
  const r = await fetch(API_BASE + path);
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

/** 主动触发一次索引（本地 dev 的 Cron 不会自动跑，线上也会让新帖更快出现） */
async function kickIndex() {
  try { await fetch(API_BASE + '/api/index'); } catch {}
}

// ---------------------------------------------------------------- 状态
const LS_KEY = 'tipjar.wallet';
let walletClient = null, account = null, balance = null;
let IDENT = {};

async function loadIdentities() {
  try { IDENT = (await api('/api/identities')).items || {}; } catch { IDENT = {}; }
}
const identOf = (a) => IDENT[(a || '').toLowerCase()] || {};
/** 显示名优先级：链上唯一用户名 > GitHub > X > 地址缩写 */
const nameOf = (a) => { const i = identOf(a); return i.username || i.github || i.x || null; };

function refreshMe() {
  const i = account ? identOf(account) : {};
  const n = nameOf(account) || (account ? short(account) : t('acct_not_connected'));
  const connected = !!account;

  $('#acctName').innerHTML = connected
    ? esc(n) + (i.github ? ' ' + VER : '')
    : t('acct_not_connected');
  $('#acctAddr').textContent = connected ? short(account) : t('acct_click_connect');
  $('#acctBal').textContent = connected && balance !== null
    ? `${Number(balance).toFixed(4)} USDC` : '';
  $('#acctAv').className = 'av' + (connected ? '' : ' ghost');
  $('#acctAv').textContent = initials(n);
  $('#myAv').className = 'av' + (connected ? '' : ' ghost');
  $('#myAv').textContent = initials(n);

  $('#meName').innerHTML = esc(n) + (i.github ? ' ' + VER : '');
  $('#meAddr').textContent = account || '—';
  $('#meAv').className = 'av lg' + (connected ? '' : ' ghost');
  $('#meAv').textContent = initials(n);
  $('#meBadges').innerHTML = [
    i.github ? `<span class="chip">GitHub · ${esc(i.github)}</span>` : '',
    i.x ? `<span class="chip">X · ${esc(i.x)}</span>` : '',
  ].join('') || (connected
    ? `<span style="font-size:12.5px;color:var(--dim)">${t('unbound')}</span>`
    : `<span style="font-size:12.5px;color:var(--dim)">${t('bind_after_connect')}</span>`);
  $('#connectBtn2').style.display = connected ? 'none' : '';

  // 身份按钮文案随状态变化（卡片收起时）
  const card = $('#identityCard'), tt = $('#identityToggleText');
  if (card && tt && card.style.display === 'none') {
    tt.textContent = (i.username || i.github) ? t('btn_identity_settings') : t('btn_set_identity');
  }
}

async function refreshBalance() {
  if (!account) { balance = null; return; }
  try {
    const b = await publicClient.getBalance({ address: account });
    balance = Number(formatUnits(b, 18));   // Arc 原生 USDC 是 18 位
  } catch { balance = null; }
  $('#acctBal').textContent = balance !== null ? `${balance.toFixed(4)} USDC` : '';
}

// ---------------------------------------------------------------- 钱包
async function fee() {
  const gp = await publicClient.getGasPrice();
  return gp > MIN_GWEI ? gp : MIN_GWEI;
}

async function connect() {
  if (!window.ethereum) { alert(t('wallet_missing')); return null; }
  const [addr] = await window.ethereum.request({ method: 'eth_requestAccounts' });
  const hex = '0x' + ARC_CHAIN_ID.toString(16);
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
  } catch (e) {
    if (e.code === 4902 || e.code === -32603) {
      await window.ethereum.request({ method: 'wallet_addEthereumChain', params: [{
        chainId: hex, chainName: 'Arc',
        nativeCurrency: { name:'USDC', symbol:'USDC', decimals:18 },
        rpcUrls: ['https://rpc.mainnet.arc.io'],
        blockExplorerUrls: ['https://explorer.arc.io'],
      }]});
    } else throw e;
  }
  account = getAddress(addr);
  walletClient = createWalletClient({ account, chain: arc, transport: custom(window.ethereum) });
  localStorage.setItem(LS_KEY, account);
  await Promise.all([loadIdentities(), refreshBalance()]);
  refreshMe();
  loadCheckin();
  loadStats();
  return account;
}

/** 断开：清空本地状态。钱包扩展本身的授权需要用户在扩展里撤销，前端只能清自己的会话。 */
function disconnect() {
  account = null; walletClient = null; balance = null;
  localStorage.removeItem(LS_KEY);
  refreshMe();
  CHECKIN = null;
  loadCheckin();
  loadStats();
  $('#acctMenu').classList.remove('on');
  showView('home');
}

// 自动重连（如果之前连过且钱包已授权）
async function tryReconnect() {
  const saved = localStorage.getItem(LS_KEY);
  if (!saved || !window.ethereum) return;
  try {
    const accts = await window.ethereum.request({ method: 'eth_accounts' });
    if (accts && accts.length && getAddress(accts[0]) === saved) {
      account = getAddress(accts[0]);
      walletClient = createWalletClient({ account, chain: arc, transport: custom(window.ethereum) });
      await Promise.all([loadIdentities(), refreshBalance()]);
      refreshMe();
      loadCheckin();
    } else {
      localStorage.removeItem(LS_KEY);
    }
  } catch {}
}

// 账户条：点击弹菜单
$('#acctBox').onclick = async (e) => {
  e.stopPropagation();
  if (!account) {
    try { await connect(); } catch (err) { alert(t('connect_failed') + (err.message || err)); }
    return;
  }
  $('#acctMenu').classList.toggle('on');
};
document.addEventListener('click', () => $('#acctMenu').classList.remove('on'));

$('#mCopy').onclick = async (e) => {
  e.stopPropagation();
  try {
    await navigator.clipboard.writeText(account);
    $('#mCopy').lastChild.textContent = t('copied');
    setTimeout(() => { $('#mCopy').lastChild.textContent = t('copy_addr'); }, 1500);
  } catch { alert(account); }
  $('#acctMenu').classList.remove('on');
};
$('#mExplorer').onclick = (e) => {
  e.stopPropagation();
  window.open(`https://explorer.arc.io/address/${account}`, '_blank');
  $('#acctMenu').classList.remove('on');
};
$('#mDisconnect').onclick = (e) => { e.stopPropagation(); disconnect(); };

$('#connectBtn2').onclick = async () => {
  try { await connect(); } catch (e) { alert(t('connect_failed') + (e.message || e)); }
};

// ---------------------------------------------------------------- 渲染
function tweetHtml(p) {
  const nm = nameOf(p.author);
  const handle = nm ? `@${esc(nm)}` : short(p.author);
  return `<article class="tweet" data-id="${p.id}">
    <div class="av clickable" data-user="${p.author}" title="${esc(handle)}">${esc(initials(nm || p.author))}</div>
    <div class="tbody">
      <div class="thead">
        <span class="n clickable" data-user="${p.author}">${esc(nm || short(p.author))}</span>${nm ? VER : ''}
        <span class="h clickable" data-user="${p.author}">${esc(handle)}</span><span class="dot">·</span>
        <span class="t">${ago(p.timestamp)}</span>
      </div>
      <div class="tcontent">${esc(p.content)}</div>
      <div class="tact">
        <span class="act cmt" data-cmt="${p.id}" title=t('act_reply')>
          <svg viewBox="0 0 24 24"><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"/></svg>
          <span data-cnt="${p.id}">${p.replies ? p.replies : ''}</span>
        </span>
        <span class="act tip" data-tip="${p.id}" title="${t('act_tip')}">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5H10.9v1.69c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.04c.1 1.7 1.36 2.66 2.86 2.97V19h2.34v-1.67c1.52-.29 2.72-1.16 2.73-2.77-.01-2.2-1.9-2.96-3.66-3.42z"/></svg>
          <span>${t('act_tip')}</span>
        </span>
        <span class="tipsum" data-info="${p.id}"></span>
        <a class="act" href="https://explorer.arc.io/tx/${p.txHash}" target="_blank" rel="noopener" title="在区块浏览器查看">
          <svg viewBox="0 0 24 24"><path d="M18.36 5.64c-1.95-1.96-5.11-1.96-7.07 0L9.88 7.05 8.46 5.64l1.42-1.42c2.73-2.73 7.16-2.73 9.9 0 2.73 2.74 2.73 7.17 0 9.9l-1.42 1.42-1.41-1.42 1.41-1.41c1.96-1.96 1.96-5.12 0-7.07zm-2.12 3.53l-7.07 7.07-1.41-1.41 7.07-7.07 1.41 1.41zm-12.02.71l1.42-1.42 1.41 1.42-1.41 1.41c-1.96 1.96-1.96 5.12 0 7.07 1.95 1.96 5.11 1.96 7.07 0l1.41-1.41 1.42 1.41-1.42 1.42c-2.73 2.73-7.16 2.73-9.9 0-2.73-2.74-2.73-7.17 0-9.9z"/></svg>
        </a>
      </div>
      <div class="cbox" data-cbox="${p.id}" style="display:none"></div>
    </div>
  </article>`;
}

/** 一条评论 */
function replyHtml(r) {
  const nm = nameOf(r.author);
  return `<div class="reply">
    <div class="av xs clickable" data-user="${r.author}">${esc(initials(nm || r.author))}</div>
    <div style="flex:1;min-width:0">
      <div class="rhead">
        <span class="rn clickable" data-user="${r.author}">${esc(nm || short(r.author))}</span>${nm ? VER : ''}
        <span class="rh">${esc(nm ? '@' + nm : short(r.author))}</span>
        <span class="rd">·</span><span class="rt">${ago(r.timestamp)}</span>
      </div>
      <div class="rbody">${esc(r.content)}</div>
    </div>
  </div>`;
}

/** 展开/收起评论区 */
async function toggleComments(postId) {
  const boxEl = document.querySelector(`[data-cbox="${postId}"]`);
  if (!boxEl) return;
  if (boxEl.style.display !== 'none') { boxEl.style.display = 'none'; return; }

  boxEl.style.display = '';
  boxEl.innerHTML = `<div class="cload">${t('cmt_loading')}</div>`;
  try {
    const r = await api('/api/replies/' + postId);
    const items = r.items || [];
    boxEl.innerHTML = `
      <div class="clist">${items.length ? items.map(replyHtml).join('') : `<div class="cempty">${t('cmt_empty')}</div>`}</div>
      <div class="cinput">
        <div class="av xs ghost" id="cav${postId}">${esc(initials(nameOf(account) || account || '?'))}</div>
        <input placeholder=t('reply_ph') data-cin="${postId}" />
        <button class="csend" data-csend="${postId}">${t('reply_send')}</button>
      </div>`;
    const inp = document.querySelector(`[data-cin="${postId}"]`);
    inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendReply(postId); });
  } catch (e) {
    boxEl.innerHTML = `<div class="cload">${t('load_failed')}: ${esc(e.message)}</div>`;
  }
}

/** 发评论 = 调合约 reply(parent, content) */
async function sendReply(postId) {
  const inp = document.querySelector(`[data-cin="${postId}"]`);
  const btn = document.querySelector(`[data-csend="${postId}"]`);
  const content = (inp?.value || '').trim();
  if (!content) return;
  try {
    if (!walletClient) await connect();
    btn.disabled = true;
    btn.textContent = t('signing');
    const hash = await walletClient.writeContract({
      address: CONTRACT, abi: ABI, functionName: 'reply',
      args: [BigInt(postId), content],
      maxFeePerGas: await fee(),
    });
    btn.textContent = t('onchain');
    await publicClient.waitForTransactionReceipt({ hash });
    inp.value = '';
    btn.textContent = t('act_reply');
    btn.disabled = false;
    refreshBalance();
    kickedOnce = false;
    await kickIndex();
    await toggleComments(postId);   // 重新打开刷新列表
    await toggleComments(postId);
    const cnt = document.querySelector(`[data-cnt="${postId}"]`);
    if (cnt) cnt.textContent = (Number(cnt.textContent) || 0) + 1;
  } catch (e) {
    btn.disabled = false;
    btn.textContent = t('act_reply');
    alert(t('reply_failed') + (e.shortMessage || e.message || e));
  }
}

const EMPTY_HTML = `<div class="empty">
  <svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c-3.6 0-6.5 2.9-6.5 6.5 0 1.3.4 2.5 1 3.5L5 21.5l5.2-1.7c.6.1 1.2.2 1.8.2 3.6 0 6.5-2.9 6.5-6.5S15.6 2.5 12 2.5zm0 11.5c-.5 0-1-.1-1.5-.2l-.4-.1-3.1 1 .8-3-.2-.4c-.5-.8-.8-1.7-.8-2.6 0-2.8 2.3-5 5.2-5s5.2 2.2 5.2 5-2.3 5.3-5.2 5.3z"/></svg>
  <h3>${t('empty_title')}</h3>
  <p>${t('empty_desc')}</p>
  <button class="cta" id="emptyCta">${t('empty_cta')}</button>
</div>`;

let FEED = [];
let kickedOnce = false;

/** 只在首次加载时触发一次索引，避免反复扫描把本地 worker 拖死 */
async function maybeKick() {
  if (kickedOnce) return;
  kickedOnce = true;
  await kickIndex();
}

async function loadFeed() {
  const box = $('#feed');
  try {
    await maybeKick();
    await loadIdentities();
    const feed = await api('/api/feed?limit=50');
    FEED = feed.items || [];
    $('#statPosts').textContent = FEED.length;
    if (!FEED.length) {
      box.innerHTML = EMPTY_HTML;
      $('#emptyCta')?.addEventListener('click', () => {
        showView('home');
        $('#composeBox').focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    } else {
      box.innerHTML = FEED.map(tweetHtml).join('');
      FEED.forEach((p) => loadTips(p.id));
    }
    loadBoard();
    loadScores();
    loadRecent();
    loadStats();
  } catch (e) {
    box.innerHTML = `<div class="empty"><h3>${t('indexer_down')}</h3><p>${esc(e.message)}<br>${t('indexer_down_hint')}</p></div>`;
  }
}

async function loadTips(id) {
  try {
    const r = await api('/api/post/' + id);
    const el = document.querySelector(`[data-info="${id}"]`);
    if (el && r.tips && r.tips.count > 0) el.textContent = `${r.tips.total} USDC`;
  } catch {}
}

async function loadBoard() {
  const box = $('#boardBox');
  try {
    const { items } = await api('/api/leaderboard');
    if (!items || !items.length) {
      box.innerHTML = `<div class="cph">${t('board_empty')}</div>`;
      return;
    }
    box.innerHTML = items.slice(0, 5).map((x, i) => {
      const nm = nameOf(x.to);
      const me = account && x.to.toLowerCase() === account.toLowerCase();
      return `<div class="row click ${me ? 'merow' : ''}" data-goto="${x.to}"><div class="rk">
        <span class="idx">${i + 1}</span>
        <div class="av sm">${esc(initials(nm || x.to))}</div>
        <div class="info">
          <div class="l2" style="font-size:14px">${esc(nm || short(x.to))}</div>
          <div class="l1">${x.count} ${t('tips_unit')}</div>
        </div>
        <span class="amt">${x.total} USDC</span>
      </div></div>`;
    }).join('');
  } catch (e) {
    box.innerHTML = `<div class="cph">${t('indexer_down_short')}</div>`;
  }
}

// 最新打赏动态
async function loadRecent() {
  const box = $('#recentBox');
  if (!box) return;
  try {
    const { items } = await api('/api/tips');
    const list = (items || []).slice(0, 6);
    if (!list.length) {
      box.innerHTML = `<div class="cph">${t('recent_empty')}</div>`;
      return;
    }
    box.innerHTML = list.map((t) => {
      const from = nameOf(t.from) || short(t.from);
      const to = nameOf(t.to) || short(t.to);
      const note = t.note ? `<div class="l1" style="margin-top:3px">"${esc(t.note)}"</div>` : '';
      return `<div class="row">
        <div class="rk" style="align-items:flex-start">
          <div class="av sm">${esc(initials(to))}</div>
          <div class="info">
            <div class="l2" style="font-size:13.5px">
              <span style="color:var(--dim)">${esc(from)}</span>
              <span style="color:var(--dim2)"> → </span>${esc(to)}
            </div>
            <div class="l1">${Number(t.amount).toFixed(4)} USDC</div>${note}
          </div>
        </div>
      </div>`;
    }).join('');
  } catch {
    box.innerHTML = `<div class="cph">${t('indexer_down_short')}</div>`;
  }
}

// 左栏平台数据
async function loadStats() {
  try {
    const [feed, scores, tips] = await Promise.all([
      api('/api/feed?limit=500').catch(() => ({ items: [] })),
      api('/api/scores?limit=200').catch(() => ({ items: [] })),
      api('/api/tips').catch(() => ({ items: [] })),
    ]);
    const posts = (feed.items || []).length;
    const users = (scores.items || []).length;
    const total = (tips.items || []).reduce((s, t) => s + Number(t.amount || 0), 0);
    $('#sPosts').textContent = posts;
    $('#sUsers').textContent = users;
    $('#sTips').textContent = total > 0 ? `${total.toFixed(4)} USDC` : '0 USDC';
    if (account) {
      const me = (scores.items || []).find((x) => x.addr.toLowerCase() === account.toLowerCase());
      $('#sMyScore').textContent = me ? me.score : '0';
    } else {
      $('#sMyScore').textContent = '—';
    }
  } catch {}
}

// ---------------------------------------------------------------- 积分 / 成就
// 成就定义从索引器拉（带中英双语名称 + 解锁积分），前端不硬编码
let ACH_DEFS = [];

async function loadAchDefs() {
  if (ACH_DEFS.length) return ACH_DEFS;
  try {
    const r = await api('/api/achievements');
    ACH_DEFS = r.defs || [];
  } catch { ACH_DEFS = []; }
  return ACH_DEFS;
}

async function loadScores() {
  try {
    const { items } = await api('/api/scores?limit=5');
    if (!items || !items.length) {
      $('#scoreBox').innerHTML = `<div class="cph">${t('score_empty')}</div>`;
    }
    else {
      $('#scoreCard').style.display = '';
      $('#scoreBox').innerHTML = items.map((x, i) => {
        const nm = nameOf(x.addr);
        return `<div class="row click" data-goto="${x.addr}"><div class="rk">
          <span class="idx">${i + 1}</span>
          <div class="av sm">${esc(initials(nm || x.addr))}</div>
          <div class="info">
            <div class="l2" style="font-size:14px">${esc(nm || short(x.addr))}</div>
            <div class="l1">${x.posts} ${t('post_count')} · ${x.replies} ${t('reply_count')}${x.tipsIn ? ` · ${x.tipsIn} ${t('tips_unit')}` : ''}</div>
          </div>
          <span class="amt" style="color:var(--gold)">${x.score}</span>
        </div></div>`;
      }).join('');
    }

    // 完整榜（我的积分页）
    const full = await api('/api/scores?limit=20');
    const box = $('#scoreBoardFull');
    if (box) {
      const arr = full.items || [];
      box.innerHTML = arr.length ? arr.map((x, i) => {
        const nm = nameOf(x.addr);
        const me = account && x.addr.toLowerCase() === account.toLowerCase();
        return `<div class="row click ${me ? 'merow' : ''}" data-goto="${x.addr}"><div class="rk">
          <span class="idx">${i + 1}</span>
          <div class="av sm">${esc(initials(nm || x.addr))}</div>
          <div class="info">
            <div class="l2" style="font-size:14px">${esc(nm || short(x.addr))}${me ? ` <span style="font-size:11px;color:var(--gold)">${t('you')}</span>` : ''}</div>
            <div class="l1">${x.posts} ${t('post_count')} · ${x.replies} ${t('reply_count')} · ${x.tipsIn} ${t('tips_unit')} · ${x.amountIn} USDC</div>
          </div>
          <span class="amt" style="color:var(--gold);font-size:15px">${x.score}</span>
        </div></div>`;
      }).join('') : `<div style="color:var(--dim);font-size:14px;padding:8px 0">${t('score_board_empty')}</div>`;
    }
  } catch {}
}

async function loadMyScore() {
  const big = $('#myScore');
  if (!big) return;
  if (!account) {
    big.textContent = '—';
    $('#myRank').textContent = t('connect_to_view');
    $('#myScoreDetail').innerHTML = '';
    renderAchievements([]);
    return;
  }
  try {
    const r = await api('/api/score/' + account);
    const s = r.score;
    if (!s) {
      big.textContent = '0';
      $('#myRank').textContent = t('no_activity');
      $('#myScoreDetail').innerHTML = [
        [t('score_detail_posts'), 0], [t('act_reply'), 0], [t('score_detail_got'), 0], [t('score_detail_tips'), 0], [t('score_detail_earned'), '0 USDC'],
      ].map(([k, v]) => `<span>${k} <b style="color:var(--fg)">${v}</b></span>`).join('');
    } else {
      big.textContent = s.score;
      $('#myRank').innerHTML = `${t('rank_of')} <b style="color:var(--gold)">${s.rank}</b>`;
      $('#myScoreDetail').innerHTML = [
        [t('score_detail_posts'), s.posts], [t('act_reply'), s.replies], [t('score_detail_got'), s.gotReplies],
        [t('score_detail_tips'), s.tipsOut], [t('score_detail_earned'), `${s.amountIn} USDC`],
      ].map(([k, v]) => `<span>${k} <b style="color:var(--fg)">${v}</b></span>`).join('');
    }
    renderAchievements(r.achievements || []);
  } catch {
    big.textContent = '—';
    renderAchievements([]);
  }
}

/** 把成就渲染到指定容器（我的成就页 / 用户主页共用） */
function renderAchInto(sel, earnedIds) {
  const box = $(sel);
  if (!box) return;
  const set = new Set(earnedIds);
  box.innerHTML = ACH_DEFS.map((a) => {
    const got = set.has(a.id);
    const nm = LANG === 'zh' ? a.name : a.en;
    const ds = LANG === 'zh' ? a.desc : a.enDesc;
    return `<div class="ach ${got ? 'got' : ''}" title="${esc(ds)}">
      <span class="aico">${a.icon}</span>
      <div style="min-width:0;flex:1">
        <div class="aname">${esc(nm)}</div>
        <div class="adesc">${esc(ds)}</div>
      </div>
      <span class="apts">${got ? '+' : ''}${a.points}</span>
    </div>`;
  }).join('');
}

function renderAchievements(earnedIds) {
  const box = $('#achGrid');
  if (!box) return;
  const set = new Set(earnedIds);
  const totalPts = ACH_DEFS.filter((a) => set.has(a.id)).reduce((s, a) => s + (a.points || 0), 0);
  $('#achCount').textContent =
    `${set.size} / ${ACH_DEFS.length} ${t('ach_progress')} · ${totalPts} ${t('score_pts')}`;
  renderAchInto('#achGrid', earnedIds);
}

// ---------------------------------------------------------------- 发帖
const box = $('#composeBox');
box.addEventListener('input', () => {
  $('#postBtn').disabled = !box.value.trim();
  box.style.height = 'auto';
  box.style.height = Math.min(box.scrollHeight, 420) + 'px';
});
$('#sidePost').onclick = () => {
  showView('home');
  box.focus();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
$('#postBtn').onclick = async () => {
  const content = box.value.trim();
  const st = $('#postStatus');
  if (!content) return;
  try {
    if (!walletClient) await connect();
    st.textContent = t('signing');
    const hash = await walletClient.writeContract({
      address: CONTRACT, abi: ABI, functionName: 'post',
      args: [content], maxFeePerGas: await fee(),
    });
    st.textContent = t('onchain');
    await publicClient.waitForTransactionReceipt({ hash });
    st.textContent = t('posted_ok');
    box.value = ''; box.style.height = 'auto';
    $('#postBtn').disabled = true;
    refreshBalance();
    setTimeout(async () => {
      st.textContent = '';
      kickedOnce = false;   // 强制重新索引，让新帖立刻出现
      await loadFeed();
    }, 1800);
  } catch (e) {
    st.textContent = t('post_failed') + (e.shortMessage || e.message || e).slice(0, 50);
  }
};

// ---------------------------------------------------------------- 打赏
document.addEventListener('click', async (e) => {
  // 点头像 / 用户名 → 打开他的主页
  const u = e.target.closest('[data-user]');
  if (u) { e.stopPropagation(); openProfile(u.dataset.user); return; }

  // 点排行榜的行 → 同样打开主页
  const g = e.target.closest('[data-goto]');
  if (g) { e.stopPropagation(); openProfile(g.dataset.goto); return; }

  // 评论：展开/收起
  const cmt = e.target.closest('[data-cmt]');
  if (cmt) { e.stopPropagation(); await toggleComments(Number(cmt.dataset.cmt)); return; }

  // 评论：发送
  const csend = e.target.closest('[data-csend]');
  if (csend) { e.stopPropagation(); await sendReply(Number(csend.dataset.csend)); return; }

  const el = e.target.closest('[data-tip]');
  if (!el) return;
  e.stopPropagation();
  const postId = Number(el.dataset.tip);
  const amt = prompt(t('tip_amount'), '0.1');
  if (!amt || Number(amt) <= 0) return;
  const note = prompt(t('tip_note'), '') ?? '';
  try {
    if (!walletClient) await connect();
    el.classList.add('done');
    const hash = await walletClient.writeContract({
      address: CONTRACT, abi: ABI, functionName: 'tipPost',
      args: [BigInt(postId), note],
      value: parseUnits(amt, 18),
      maxFeePerGas: await fee(),
    });
    await publicClient.waitForTransactionReceipt({ hash });
    refreshBalance();
    setTimeout(() => loadTips(postId), 3000);
  } catch (err) {
    el.classList.remove('done');
    alert(t('tip_failed') + (err.shortMessage || err.message || err));
  }
});

// ---------------------------------------------------------------- OAuth
const OAUTH_WHERE = {
  github: 'github.com/settings/developers',
  twitter: 'developer.x.com/en/portal/dashboard',
  google: 'console.cloud.google.com',
};

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** X (Twitter) OAuth 2.0 强制要求 PKCE */
async function makePkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(digest) };
}

document.querySelectorAll('.oauthbtn').forEach((b) =>
  b.onclick = async () => {
    const provider = b.dataset.p;
    const cfg = await api('/api/oauth/config').catch(() => null);
    if (!cfg || !cfg[provider]) {
      return alert(
        `${t('oauth_not_cfg')}${provider}.\n\n` +
        `${t('oauth_go')}${OAUTH_WHERE[provider] || provider}${t('oauth_fill')}`
      );
    }
    const redirect = `${API_BASE || location.origin}/api/oauth/${provider}/callback?return=${encodeURIComponent(location.href)}`;

    if (provider === 'github') {
      location.href = `https://github.com/login/oauth/authorize?client_id=${cfg.github}` +
        `&redirect_uri=${encodeURIComponent(redirect)}&scope=read:user`;
      return;
    }
    if (provider === 'twitter') {
      const { verifier, challenge } = await makePkce();
      sessionStorage.setItem('tipjar.pkce', verifier);
      const state = b64url(crypto.getRandomValues(new Uint8Array(12)));
      sessionStorage.setItem('tipjar.state', state);
      location.href = `https://twitter.com/i/oauth2/authorize?response_type=code` +
        `&client_id=${encodeURIComponent(cfg.twitter)}` +
        `&redirect_uri=${encodeURIComponent(redirect)}` +
        `&scope=${encodeURIComponent('tweet.read users.read')}` +
        `&state=${state}` +
        `&code_challenge=${challenge}&code_challenge_method=S256`;
      return;
    }
    location.href = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${cfg.google}` +
      `&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&scope=openid%20email%20profile`;
  }
);

async function handleOAuthReturn() {
  const q = new URLSearchParams(location.search);
  const provider = q.get('oauth');
  const username = q.get('username');
  if (!provider || !username) return;
  history.replaceState({}, '', location.pathname);
  showView('me');
  $('#bindStatus').textContent = `${t('bind_authorized')}${username}`;
  if (!confirm(`${t('bind_via')}${provider} ${username}${t('bind_confirm_q')}`)) return;
  try {
    if (!walletClient) await connect();
    $('#bindStatus').textContent = t('bind_binding');
    const hash = await walletClient.writeContract({
      address: CONTRACT, abi: ABI, functionName: 'bind',
      args: [provider, username], maxFeePerGas: await fee(),
    });
    await publicClient.waitForTransactionReceipt({ hash });
    $('#bindStatus').textContent = t('bind_ok');
    refreshBalance();
    setTimeout(async () => { await loadIdentities(); refreshMe(); loadFeed(); loadRepos(username); }, 2500);
  } catch (e) {
    $('#bindStatus').textContent = t('bind_failed') + (e.shortMessage || e.message || e);
  }
}

// ---------------------------------------------------------------- 用户名
const NAME_RE = /^[a-z0-9_]{3,20}$/;
let nameLocked = false;

function nameHint(msg, color) {
  const h = $('#nameHint');
  if (!h) return;
  h.textContent = msg;
  h.style.color = color || 'var(--dim)';
}

/** 链上只能设置一次 + 允许修改一次：
 *  未设置        → 输入框可编辑，按钮「设置」
 *  已设置未改过  → 输入框锁定，按钮「修改用户名」；点它解锁，按钮变「确认修改」
 *  已修改过      → 全部锁死，按钮「已修改」
 */
async function lockNameIfSet() {
  if (!account) { nameLocked = false; return false; }
  const changedKey = 'tipjar.nameChanged.' + account.toLowerCase();
  const alreadyChanged = localStorage.getItem(changedKey) === '1';
  try {
    const mine = await publicClient.readContract({
      address: CONTRACT, abi: ABI, functionName: 'usernameOf', args: [account],
    });
    const inp = $('#nameInput'), btn = $('#setNameBtn'), wrap = $('#nameWrap');
    if (mine) {
      inp.value = mine;
      inp.disabled = true;
      wrap.style.opacity = '.65';
      if (alreadyChanged) {
        btn.disabled = true; btn.textContent = t('name_changed_label');
        btn.style.opacity = '.4'; btn.style.cursor = 'not-allowed';
        nameHint(t('name_locked'), 'var(--dim)');
        nameLocked = true;
      } else {
        btn.disabled = false; btn.textContent = t('name_change_btn');
        btn.style.opacity = ''; btn.style.cursor = '';
        btn.dataset.mode = 'edit';
        nameHint('', '');
        nameLocked = true;          // 需要先点「修改用户名」才解锁
      }
      return true;
    }
  } catch {}
  nameLocked = false;
  return false;
}

/** 点「修改用户名」→ 解锁输入框 */
function unlockNameForEdit() {
  const inp = $('#nameInput'), btn = $('#setNameBtn'), wrap = $('#nameWrap');
  inp.disabled = false;
  inp.focus();
  inp.select();
  wrap.style.opacity = '';
  btn.textContent = t('name_confirm_change');
  btn.dataset.mode = 'confirm';
  nameLocked = false;              // 允许本次编辑
  nameHint(t('name_change_once'), 'var(--gold)');
}

/** 实时查重：格式合法 + 链上未被占用才能提交 */
async function checkName() {
  const wrap = $('#nameWrap'), btn = $('#setNameBtn');
  if (!wrap || !btn) return;
  if (nameLocked) return;                       // 已设置过，不再允许查询/提交
  const name = ($('#nameInput').value || '').trim().toLowerCase();

  if (!name) {
    nameHint('');
    wrap.style.borderColor = 'var(--line)';
    btn.disabled = true;
    return;
  }
  if (!NAME_RE.test(name)) {
    nameHint(t('name_format'), 'var(--red)');
    wrap.style.borderColor = 'rgba(239,68,68,.55)';
    btn.disabled = true;
    return;
  }

  btn.disabled = true;
  nameHint(t('name_checking'));
  wrap.style.borderColor = 'var(--line)';
  try {
    const taken = await publicClient.readContract({
      address: CONTRACT, abi: ABI, functionName: 'isNameTaken', args: [name],
    });
    if (!taken) {
      nameHint(t('name_ok'), 'var(--green)');
      wrap.style.borderColor = 'rgba(46,230,168,.5)';
      btn.disabled = false;
      return;
    }
    // 已被占用——看看是不是自己现在的名字
    const owner = await publicClient.readContract({
      address: CONTRACT, abi: ABI, functionName: 'ownerOfName',
      args: [keccak256(toBytes(name))],
    });
    if (account && owner.toLowerCase() === account.toLowerCase()) {
      nameHint(t('name_yours'), 'var(--dim)');
      wrap.style.borderColor = 'var(--line)';
      btn.disabled = true;
    } else {
      nameHint(t('name_taken'), 'var(--red)');
      wrap.style.borderColor = 'rgba(239,68,68,.55)';
      btn.disabled = true;
    }
  } catch {
    nameHint(t('name_check_failed'), 'var(--red)');
    btn.disabled = true;
  }
}

async function submitName() {
  const btn = $('#setNameBtn');
  if (nameLocked) { nameHint(t('name_already_set'), 'var(--dim)'); return; }
  const name = ($('#nameInput').value || '').trim().toLowerCase();
  if (!NAME_RE.test(name)) return;
  try {
    if (!walletClient) await connect();
    btn.disabled = true;
    btn.textContent = t('signing');
    const hash = await walletClient.writeContract({
      address: CONTRACT, abi: ABI, functionName: 'setUsername',
      args: [name], maxFeePerGas: await fee(),
    });
    btn.textContent = t('onchain');
    await publicClient.waitForTransactionReceipt({ hash });
    btn.textContent = t('name_set_ok');
    refreshBalance();
    kickedOnce = false;
    await kickIndex();
    await loadIdentities();
    refreshMe();
    localStorage.setItem('tipjar.nameChanged.' + account.toLowerCase(), '1');
    nameHint(t('name_change_ok'), 'var(--green)');
    nameLocked = true;
    setTimeout(() => { lockNameIfSet(); }, 2200);
  } catch (e) {
    btn.disabled = false;
    btn.textContent = t('btn_set');
    const m = (e.shortMessage || e.message || String(e));
    if (m.includes('already set')) {
      nameHint(t('name_already_set'), 'var(--dim)');
      lockNameIfSet();
    } else if (m.includes('taken')) {
      nameHint(t('name_taken'), 'var(--red)');
    } else {
      nameHint(t('name_failed'), 'var(--red)');
      alert(t('name_set_failed') + m);
    }
  }
}

$('#nameInput')?.addEventListener('input', () => {
  const el = $('#nameInput');
  const lower = el.value.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (el.value !== lower) el.value = lower;   // 自动纠正：只允许小写字母数字下划线
  clearTimeout(window.__nameT);
  window.__nameT = setTimeout(checkName, 420);
});
$('#setNameBtn')?.addEventListener('click', () => {
  const btn = $('#setNameBtn');
  if (btn.dataset.mode === 'edit') return unlockNameForEdit();
  submitName();
});

// 身份卡片：默认收起，点按钮才展开
$('#identityToggle')?.addEventListener('click', async () => {
  const card = $('#identityCard'), btn = $('#identityToggle'), txt = $('#identityToggleText');
  const isOpen = card.style.display !== 'none';
  card.style.display = isOpen ? 'none' : '';
  btn.classList.toggle('open', !isOpen);
  if (isOpen) {
    txt.textContent = t('btn_set_identity');
  } else {
    txt.textContent = t('collapse');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    if (account) await lockNameIfSet();
  }
});

// ---------------------------------------------------------------- GitHub 项目
async function loadRepos(username) {
  const box = $('#repoList');
  box.innerHTML = `<div style="color:var(--dim);font-size:14px">${t('repo_loading')}</div>`;
  try {
    const r = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`);
    if (!r.ok) throw new Error('GitHub API ' + r.status);
    const all = await r.json();
    const own = all.filter((x) => !x.fork);       // ← 排除 fork
    const forked = all.length - own.length;
    if (!own.length) { box.innerHTML = `<div style="color:var(--dim);font-size:14px">${t('repo_none')}</div>`; return; }
    box.innerHTML = own
      .sort((a, b) => b.stargazers_count - a.stargazers_count)
      .slice(0, 12)
      .map((x) => `<div class="repo">
        <h4><a href="${esc(x.html_url)}" target="_blank" rel="noopener">${esc(x.name)}</a></h4>
        ${x.description ? `<p>${esc(x.description)}</p>` : ''}
        <div class="meta">
          ${x.language ? `<span>${esc(x.language)}</span>` : ''}
          <span>★ ${x.stargazers_count}</span>
          <span>fork ${x.forks_count}</span>
          <span>${t('repo_updated')} ${(x.updated_at || '').slice(0, 10)}</span>
        </div>
      </div>`).join('')
      + (forked ? `<div style="color:var(--dim2);font-size:12.5px;margin-top:10px">${t('repo_filtered')} ${forked}</div>` : '');
  } catch (e) {
    box.innerHTML = `<div style="color:var(--dim);font-size:14px">${t('repo_failed')}${esc(e.message)}</div>`;
  }
}

// ---------------------------------------------------------------- 每日签到
// 签到 = 发一条 #checkin 帖子。不用改合约：链上时间戳 + 作者地址天然防作弊。
let CHECKIN = null;

async function loadCheckin() {
  const btn = $('#checkinBtn'), txt = $('#checkinText'), st = $('#sStreak');
  if (!btn) return;
  if (!account) {
    btn.disabled = false;
    btn.classList.remove('done');
    txt.textContent = t('btn_checkin');
    if (st) st.textContent = '—';
    return;
  }
  try {
    CHECKIN = await api('/api/checkin/' + account);
    const unit = LANG === 'zh' ? '天' : 'd';
    if (CHECKIN.today) {
      btn.classList.add('done');
      btn.disabled = true;
      txt.textContent = `${t('btn_checkin_done')} · ${CHECKIN.streak}${unit}`;
    } else {
      btn.classList.remove('done');
      btn.disabled = false;
      txt.textContent = t('btn_checkin');
    }
    if (st) st.textContent = CHECKIN.streak ? `${CHECKIN.streak}${unit}` : '0';
  } catch {}
}

async function doCheckin() {
  const btn = $('#checkinBtn'), txt = $('#checkinText');
  if (!account) {
    try { await connect(); } catch (e) { return alert(t('connect_failed') + (e.message || e)); }
  }
  if (CHECKIN && CHECKIN.today) return alert(t('checkin_already'));
  try {
    if (!walletClient) await connect();
    btn.disabled = true;
    txt.textContent = t('signing');
    const hash = await walletClient.writeContract({
      address: CONTRACT, abi: ABI, functionName: 'post',
      args: ['#checkin'], maxFeePerGas: await fee(),
    });
    txt.textContent = t('onchain');
    await publicClient.waitForTransactionReceipt({ hash });
    txt.textContent = t('checkin_ok');
    refreshBalance();
    kickedOnce = false;
    await kickIndex();
    setTimeout(async () => { await loadCheckin(); await loadStats(); loadMyScore(); }, 1500);
  } catch (e) {
    txt.textContent = t('post_failed') + (e.shortMessage || e.message || e);
    btn.disabled = false;
  }
}

$('#checkinBtn')?.addEventListener('click', doCheckin);

// ---------------------------------------------------------------- 视图
const VIEWS = ['home', 'me', 'posts', 'score', 'ach', 'repos', 'user'];
const TITLES = { home:'nav_home', me:'nav_profile', posts:'nav_posts',
                 score:'nav_score', ach:'nav_ach', repos:'nav_repos', user:'nav_profile' };

let VIEWING = null;   // 当前正在查看的用户地址（用户主页用）

function showView(v) {
  VIEWS.forEach((x) => {
    const el = $('#view-' + x);
    if (el) el.style.display = x === v ? '' : 'none';
  });
  $('#pageTitle').textContent = t(TITLES[v] || 'nav_home');
  document.querySelectorAll('.nitem').forEach((a) => a.classList.toggle('on', a.dataset.nav === v));

  if (v === 'me') loadMe();
  else if (v === 'posts') loadMyPosts();
  else if (v === 'score') loadMyScore();
  else if (v === 'ach') loadMyAch();
  else if (v === 'repos') loadMyRepos();
  else if (v === 'user' && VIEWING) loadUserProfile(VIEWING);
}

/** 打开某个地址的主页 */
function openProfile(addr) {
  if (!addr) return;
  const a = getAddress(addr);
  if (account && a.toLowerCase() === account.toLowerCase()) { showView('me'); return; }
  VIEWING = a;
  showView('user');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/** 加载用户主页 */
async function loadUserProfile(addr) {
  await Promise.all([loadIdentities(), loadAchDefs()]);
  const i = identOf(addr);
  const nm = nameOf(addr) || short(addr);

  $('#uName').innerHTML = esc(nm) + (i.github || i.username ? ' ' + VER : '');
  $('#uAddr').textContent = addr;
  $('#uAv').textContent = initials(nm);
  $('#uBadges').innerHTML = [
    i.username ? `<span class="chip">@${esc(i.username)}</span>` : '',
    i.github ? `<span class="chip">GitHub · ${esc(i.github)}</span>` : '',
    i.x ? `<span class="chip">X · ${esc(i.x)}</span>` : '',
  ].join('') || `<span style="font-size:12.5px;color:var(--dim)">${t('unbound')}</span>`;

  // 积分 + 成就
  try {
    const r = await api('/api/score/' + addr);
    const s = r.score;
    if (s) {
      $('#uScore').textContent = s.score;
      $('#uRank').textContent = `${t('rank_of')} ${s.rank}`;
      $('#uStats').innerHTML = [
        [t('score_detail_posts'), s.posts], [t('score_detail_replies'), s.replies],
        [t('score_detail_got'), s.gotReplies], [t('score_detail_tips'), s.tipsOut],
        [t('score_detail_earned'), `${s.amountIn} USDC`],
      ].map(([k, v]) => `<span>${k} <b style="color:var(--fg)">${v}</b></span>`).join('');
    } else {
      $('#uScore').textContent = '0';
      $('#uRank').textContent = t('no_activity');
      $('#uStats').innerHTML = '';
    }
    renderAchInto('#uAchGrid', r.achievements || []);
  } catch {
    $('#uScore').textContent = '—';
    $('#uStats').innerHTML = '';
    renderAchInto('#uAchGrid', []);
  }

  // 帖子
  const box = $('#uPosts');
  try {
    const r = await api('/api/user/' + addr);
    const items = r.items || [];
    $('#uPostsCount').textContent = `${items.length}`;
    box.innerHTML = items.length
      ? items.map(tweetHtml).join('')
      : `<div style="color:var(--dim);font-size:14px">${t('no_posts_yet')}</div>`;
    items.forEach((p) => loadTips(p.id));
  } catch {
    box.innerHTML = `<div style="color:var(--dim);font-size:14px">${t('load_failed')}</div>`;
  }
}
document.querySelectorAll('.nitem').forEach((a) =>
  a.onclick = (e) => { e.preventDefault(); showView(a.dataset.nav); }
);
$('#logoBtn').onclick = (e) => { e.preventDefault(); showView('home'); };

async function loadMe() {
  await loadIdentities();
  refreshMe();
  if (!account) return;
  await lockNameIfSet();
}

// 我的帖子
async function loadMyPosts() {
  const box = $('#myPosts');
  if (!box) return;
  if (!account) { box.innerHTML = `<div style="color:var(--dim);font-size:14px">${t('ph_connect_first')}</div>`; return; }
  box.innerHTML = `<div style="color:var(--dim);font-size:14px">${t('loading')}</div>`;
  try {
    const r = await api('/api/user/' + account);
    const items = r.items || [];
    $('#myPostsCount').textContent = `${items.length}`;
    box.innerHTML = items.length
      ? items.map(tweetHtml).join('')
      : `<div style="color:var(--dim);font-size:14px">${t('no_posts_yet')}</div>`;
    items.forEach((p) => loadTips(p.id));
  } catch {
    box.innerHTML = `<div style="color:var(--dim);font-size:14px">${t('load_failed')}</div>`;
  }
}

// 成就
async function loadMyAch() {
  await loadAchDefs();
  if (!account) { renderAchievements([]); return; }
  try {
    const r = await api('/api/score/' + account);
    renderAchievements(r.achievements || []);
  } catch { renderAchievements([]); }
}

// GitHub 项目
async function loadMyRepos() {
  const box = $('#repoList');
  if (!box) return;
  if (!account) { box.innerHTML = `<div style="color:var(--dim);font-size:14px">${t('ph_connect_first')}</div>`; return; }
  await loadIdentities();
  const gh = identOf(account).github;
  if (!gh) {
    box.innerHTML = `<div style="color:var(--dim);font-size:14px">${t('gh_not_bound')}</div>`;
    return;
  }
  loadRepos(gh);
}

// ---------------------------------------------------------------- 启动
(async () => {
  applyI18n();
  await tryReconnect();
  showView('home');     // 设置 pageTitle
  refreshMe();          // 设置账户条（未连接时也走 i18n 文案）
  loadFeed();
  loadCheckin();
  handleOAuthReturn();
})();

// 后台静默刷新：只读 feed，不触发索引（避免把本地 worker 拖死）
setInterval(async () => {
  if (document.hidden || $('#view-home').style.display === 'none') return;
  try {
    const feed = await api('/api/feed?limit=50');
    if ((feed.items || []).length !== FEED.length) { loadFeed(); return; }
  } catch {}
}, 60000);
