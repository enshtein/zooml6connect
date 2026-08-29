const CACHE = "zoom-l6-ui-v33";
const SHELL = ["./", "./index.html", "./styles.css", "./app.js", "./src/midi-mappings.js", "./src/midi-service.js", "./src/lfo-engine.js", "./src/audio-service.js", "./manifest.webmanifest", "./assets/icon-192.png", "./assets/icon-512.png", "./assets/apple-touch-icon.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
});

self.addEventListener("fetch", event => {
  event.respondWith(fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
