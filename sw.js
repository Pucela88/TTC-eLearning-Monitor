/* TTC de la Salle Byumba – service worker
   • The page itself: network first (so new versions appear as soon as you are online), saved copy when offline / slow.
   • Libraries (React, Firebase SDK, fonts): saved after first load, so the app starts fast and opens with a weak connection.
   • Live data (Firebase database, email, uploads) is never touched here.
   Change VERSION whenever you want every device to refresh its saved files. */
const VERSION = 'v1';
const SHELL = 'ttc-shell-' + VERSION;
const LIBS = 'ttc-libs-' + VERSION;
const SHELL_URLS = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
const LIB_HOSTS = ['cdn.jsdelivr.net', 'www.gstatic.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) {
      return Promise.all(SHELL_URLS.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== SHELL && k !== LIBS; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function timeoutFetch(req, ms) {
  return new Promise(function (resolve, reject) {
    var t = setTimeout(function () { reject(new Error('slow')); }, ms);
    fetch(req).then(function (r) { clearTimeout(t); resolve(r); }, function (er) { clearTimeout(t); reject(er); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || req.headers.has('range')) return;
  var url = new URL(req.url);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return;

  /* 1) the page itself */
  if (req.mode === 'navigate') {
    e.respondWith(
      timeoutFetch(req, 5000).then(function (res) {
        if (res && res.ok) { var copy = res.clone(); caches.open(SHELL).then(function (c) { c.put('./index.html', copy); }); }
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (m) { return m || caches.match('./') || fetch(req); });
      })
    );
    return;
  }

  /* 2) our own static files: show the saved copy, refresh it in the background */
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.open(SHELL).then(function (c) {
        return c.match(req).then(function (hit) {
          var net = fetch(req).then(function (res) { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(function () { return hit; });
          return hit || net;
        });
      })
    );
    return;
  }

  /* 3) libraries and fonts: saved copy first */
  if (LIB_HOSTS.indexOf(url.hostname) > -1 && (url.hostname !== 'www.gstatic.com' || url.pathname.indexOf('/firebasejs/') === 0)) {
    e.respondWith(
      caches.open(LIBS).then(function (c) {
        return c.match(req).then(function (hit) {
          if (hit) return hit;
          return fetch(req).then(function (res) { if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; });
        });
      })
    );
  }
  /* everything else (Firebase data, email, uploads…) goes straight to the network */
});
