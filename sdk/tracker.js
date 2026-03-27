(function () {
  var script = document.currentScript;
  var SITE = script.getAttribute("data-site");
  var PAGE = script.getAttribute("data-page") || "home";
  var API_BASE = script.getAttribute("data-api");

  if (!SITE || !API_BASE) return;

  var enterTime = null;
  var leaveSent = false;

  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  function getSessionId() {
    var id = sessionStorage.getItem("_a_sid");
    if (!id) { id = uuid(); sessionStorage.setItem("_a_sid", id); }
    return id;
  }

  function getVisitorId() {
    var id = localStorage.getItem("_a_vid");
    if (!id) { id = uuid(); localStorage.setItem("_a_vid", id); }
    return id;
  }

  function send(data) {
    var payload = JSON.stringify(
      Object.assign({}, data, {
        site: SITE,
        page: PAGE,
        path: location.pathname + location.search,
        sessionId: getSessionId(),
        visitorId: getVisitorId(),
      })
    );
    if (navigator.sendBeacon) {
      navigator.sendBeacon(API_BASE + "/api/analytics", new Blob([payload], { type: "application/json" }));
    } else {
      fetch(API_BASE + "/api/analytics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(function () {});
    }
  }

  function sendEnter() {
    enterTime = Date.now();
    send({ action: "enter" });
  }

  function sendLeave() {
    if (leaveSent) return;
    leaveSent = true;
    send({ action: "leave", durationMs: enterTime ? Date.now() - enterTime : 0 });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sendEnter);
  } else {
    sendEnter();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") sendLeave();
  });
  window.addEventListener("beforeunload", sendLeave);
})();
