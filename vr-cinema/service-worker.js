const CACHE_NAME = 'vr-cinema-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/main.js',
  './js/scene.js',
  './js/stereo.js',
  './js/controls.js',
  './js/youtube.js',
  './js/search.js',
  './js/gaze.js',
  './js/hud.js',
  './js/vr-browser.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

const EXTERNAL_CDN_ASSETS = [
  'https://unpkg.com/three@0.170.0/build/three.module.js',
  'https://unpkg.com/three@0.170.0/examples/jsm/',
  'https://www.youtube.com/iframe_api',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=Noto+Sans+JP:wght@300;400;700&display=swap'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[Service Worker] Caching app shell');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keyList => {
      return Promise.all(keyList.map(key => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // YouTube プレイヤー動画読み込みなどはネットワーク優先で、キャッシュしない
  if (event.request.url.includes('youtube.com/embed') || event.request.url.includes('pipedapi')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(response => {
      if (response) {
        return response; // キャッシュヒット
      }

      return fetch(event.request).then(fetchResponse => {
        // CDNからのThree.jsなどのライブラリは動的にキャッシュに追加する
        const isCDNAsset = EXTERNAL_CDN_ASSETS.some(url => event.request.url.startsWith(url));
        if (isCDNAsset && fetchResponse.status === 200) {
          const responseToCache = fetchResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return fetchResponse;
      });
    }).catch(() => {
      // オフライン時のフォールバック
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }
    })
  );
});
