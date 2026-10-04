/* ==========================================================================
   router.js — decides which screen to show based on the address bar.

   We use "hash" addresses so no server setup is needed:
     #/home
     #/lessons
     #/lessons/english            (params: ["english"])
     #/lessons/english/grammar    (params: ["english", "grammar"])

   The first part is the route NAME; the rest are PARAMS.
   ========================================================================== */

window.App = window.App || {};

App.router = (function () {
  var routes = {};          // route name -> function(params) that draws the screen
  var beforeLeave = null;   // optional function called when leaving a screen

  /** Connect a route name to the function that draws it. */
  function register(name, handler) {
    routes[name] = handler;
  }

  /** Read the current address, e.g. "#/lessons/english" -> { name, params }. */
  function parse() {
    var hash = window.location.hash.replace(/^#\/?/, "");
    var parts = hash.split("/").filter(Boolean).map(decodeURIComponent);
    return {
      name: parts[0] || "home",
      params: parts.slice(1)
    };
  }

  /** Change screens from code, e.g. App.router.go("quiz/science"). */
  function go(path) {
    window.location.hash = "#/" + path;
  }

  /** Mark the matching nav link as the current page (for style + screen readers). */
  function updateNav(name) {
    var links = document.querySelectorAll(".app-nav a[data-route]");
    for (var i = 0; i < links.length; i++) {
      if (links[i].getAttribute("data-route") === name) {
        links[i].setAttribute("aria-current", "page");
      } else {
        links[i].removeAttribute("aria-current");
      }
    }
  }

  /**
   * A screen (like the mock exam timer) can register cleanup work
   * that must run before another screen is drawn.
   */
  function onLeave(fn) {
    beforeLeave = fn;
  }

  /** Draw the screen for the current address. */
  function render() {
    if (beforeLeave) {
      var cleanup = beforeLeave;
      beforeLeave = null;
      cleanup();
    }

    var route = parse();
    var handler = routes[route.name] || routes.notFound;
    updateNav(route.name);
    handler(route.params);

    // Start each new screen at the top and move keyboard focus to it.
    window.scrollTo(0, 0);
    var main = document.getElementById("app");
    if (main) main.focus({ preventScroll: true });
  }

  /** Begin listening for address changes and draw the first screen. */
  function start() {
    window.addEventListener("hashchange", render);
    render();
  }

  return {
    register: register,
    go: go,
    parse: parse,
    onLeave: onLeave,
    render: render,
    start: start
  };
})();
