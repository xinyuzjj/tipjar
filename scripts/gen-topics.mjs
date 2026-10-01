/**
 * 从合约 ABI 生成事件签名 topic，并更新 wrangler.toml
 * 用法: node scripts/gen-topics.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { toEventSelector } from 'viem';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')));
const abiPath = path.join(ROOT, 'build', 'TipJarSocial.abi.json');
const tomlPath = path.join(ROOT, 'worker', 'wrangler.toml');

if (!fs.existsSync(abiPath)) {
  console.error('找不到 build/TipJarSocial.abi.json，先跑 node scripts/compile.mjs');
  process.exit(1);
}

const abi = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
const events = abi.filter((x) => x.type === 'event');

const topics = {};
console.log('事件签名 topic：');
for (const e of events) {
  const sig = `${e.name}(${e.inputs.map((i) => i.type).join(',')})`;
  const sel = toEventSelector(sig);
  topics[e.name] = sel;
  console.log(`  ${e.name.padEnd(14)} ${sel}`);
  console.log(`  ${' '.repeat(14)} ${sig}`);
}

fs.writeFileSync(path.join(ROOT, 'build', 'topics.json'), JSON.stringify(topics, null, 2));

// 更新 wrangler.toml 的 vars
let toml = fs.readFileSync(tomlPath, 'utf8');
const setVar = (key, val) => {
  const re = new RegExp(`^${key} = .*$`, 'm');
  if (re.test(toml)) toml = toml.replace(re, `${key} = "${val}"`);
  else toml = toml.replace(/^\[vars\]$/m, `[vars]\n${key} = "${val}"`);
};

setVar('TOPIC_POST', topics.Post);
setVar('TOPIC_TIPPED', topics.Tipped);
setVar('TOPIC_IDENTITY', topics.IdentityBound);

fs.writeFileSync(tomlPath, toml);
console.log(`\n已写入 build/topics.json 并更新 worker/wrangler.toml`);
