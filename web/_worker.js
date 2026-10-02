/**
 * Pages Advanced Mode worker.
 *
 * 为什么不用 functions/ 目录：
 *   `[[path]].js` 这种带方括号的文件名在 Windows 上会被 shell / 打包器当成 glob，
 *   实测 wrangler pages deploy 会直接忽略它，API 请求就落到 SPA fallback 上。
 *   _worker.js 是单文件入口，没有这个问题。
 *
 * 为什么需要这一层代理：
 *   *.workers.dev 在部分网络会被 DNS 污染（解析到假 IP），*.pages.dev 正常。
 *   把 API 和前端放在同一个 pages.dev 域名下，用户只需要能访问一个域名。
 */

const UPSTREAM = 'https://tipjar-api.1105002234.workers.dev';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // API 走代理
    if (url.pathname.startsWith('/api/')) {
      const headers = new Headers(request.headers);
      headers.delete('host');
      // 把用户实际访问的 origin 透传给上游：
      // Worker 看到的 request.url 是它自己的 workers.dev 域名，
      // 不加这个头的话 OAuth 回跳会把用户带到 workers.dev（而那个域名在很多网络下被 DNS 污染）。
      headers.set('x-forwarded-origin', url.origin);

      const init = { method: request.method, headers, redirect: 'manual' };
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = request.body;
      }

      const resp = await fetch(UPSTREAM + url.pathname + url.search, init);

      const out = new Headers(resp.headers);
      out.set('access-control-allow-origin', '*');
      out.delete('content-encoding');   // fetch 已解压，避免重复声明
      out.delete('content-length');

      return new Response(resp.body, { status: resp.status, headers: out });
    }

    // 其余交给静态资源
    return env.ASSETS.fetch(request);
  },
};
