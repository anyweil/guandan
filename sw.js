/* 掼蛋 PWA Service Worker —— 预缓存全部资源，离线可玩；改版只需提升 VERSION。 */
const VERSION = 'guandan-v2';
// 相对 SW 所在目录解析，兼容 GitHub Pages 子路径（/仓库名/）
const ASSETS = [
  '.', 'index.html', 'manifest.webmanifest',
  'src/engine/engine.js', 'src/game/game.js', 'src/ai/ai.js', 'src/ui/ui.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png', 'icons/favicon-32.png',
].map(p => new URL(p, self.registration.scope).toString());

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // 单个资源失败不应整体阻塞安装
    await Promise.allSettled(ASSETS.map(u => cache.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') {
        const cache = await caches.open(VERSION);
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      // 离线兜底：导航请求回首页
      if (req.mode === 'navigate') {
        const home = await caches.match(new URL('index.html', self.registration.scope).toString());
        if (home) return home;
      }
      throw err;
    }
  })());
});
