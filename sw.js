// Service worker ShopFood.
// - Trang chính: ưu tiên mạng nhưng chỉ chờ tối đa 2,5 giây, chậm hơn thì mở ngay bản đã lưu (mạng yếu vẫn vào nhanh); bản mới vẫn được tải ngầm để lần sau.
// - Thư viện bên ngoài (Tailwind, Supabase, phông chữ): dùng bản đã lưu ngay, cập nhật ngầm, nên lần mở sau không phải tải lại.
// - Không đụng tới dữ liệu Supabase nên đơn hàng luôn là dữ liệu mới nhất.
const CACHE = 'shopfood-v3';
const LIBS = 'shopfood-libs-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
const LIB_HOSTS = ['cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== LIBS).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (LIB_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(LIBS).then(async c => {
      const hit = await c.match(req);
      const net = fetch(req).then(res => { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  if (url.origin !== location.origin) return; // bỏ qua Supabase và các nguồn khác

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; });
    const hit = await cache.match(req);
    if (!hit) return net.catch(() => caches.match('./index.html'));
    // Có bản đã lưu: chờ mạng tối đa 2,5 giây, quá thì dùng bản đã lưu
    return Promise.race([net.catch(() => hit), new Promise(r => setTimeout(() => r(hit), 2500))]);
  })());
});

// Bấm vào thông báo đơn mới thì mở lại app (hoặc đưa app lên trước)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    })
  );
});
