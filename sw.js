/* ==========================================================================
   sw.js — service worker: lets the app work OFFLINE after one online visit.

   How it works (beginner version):
     1. INSTALL: download every file in APP_FILES into a cache.
     2. FETCH:   try the network first (so your edits show up right away);
                 if there is no connection, use the cached copy instead.
     3. ACTIVATE: delete caches from older versions.

   Only works on http://localhost or https:// (browser security rule),
   NOT when index.html is opened directly as a file.

   WHEN TO EDIT THIS FILE:
     - You added a NEW file (a new .js, .css, icon or data file):
       add its path to APP_FILES and change CACHE_VERSION (e.g. "v2" -> "v3").
     - Editing existing files (like adding questions to questions.json)
       needs NO change here.
   ========================================================================== */

var CACHE_VERSION = "v1";
var CACHE_NAME = "ustet-reviewer-" + CACHE_VERSION;

// Every file the app needs to run offline.
var APP_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/utils.js",
  "./js/storage.js",
  "./js/data-loader.js",
  "./js/router.js",
  "./js/progress.js",
  "./js/lessons.js",
  "./js/flashcards.js",
  "./js/quizzes.js",
  "./js/mock-exam.js",
  "./js/app.js",
  "./data/subjects.json",
  "./data/lessons.json",
  "./data/flashcards.json",
  "./data/questions.json",
  "./data/mock-exam.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/favicon-32.png"
];

// 1. INSTALL: save all app files.
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(APP_FILES); })
      .then(function () { return self.skipWaiting(); }) // use the new version right away
  );
});

// 3. ACTIVATE: remove caches from older versions.
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names.map(function (name) {
          if (name.indexOf("ustet-reviewer-") === 0 && name !== CACHE_NAME) return caches.delete(name);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

// 2. FETCH: network first, cached copy when offline.
self.addEventListener("fetch", function (event) {
  var request = event.request;
  // Only handle simple GET requests for this app's own files.
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then(function (response) {
        // Save a fresh copy for next time we are offline.
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      })
      .catch(function () {
        // Offline: use the saved copy. ignoreSearch lets "index.html?x=1" match "index.html".
        return caches.match(request, { ignoreSearch: true }).then(function (cached) {
          if (cached) return cached;
          // Opening a page while offline: fall back to the main page.
          if (request.mode === "navigate") return caches.match("./index.html");
          return Response.error();
        });
      })
  );
});
