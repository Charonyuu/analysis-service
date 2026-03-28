(function () {
  var script = document.currentScript;
  var SITE = script.getAttribute("data-site");
  var PAGE = script.getAttribute("data-page") || "home";
  var API_BASE = script.getAttribute("data-api");

  if (!SITE || !API_BASE) return;

  var enterTime = null;
  var leaveSent = false;
  var lastHeartbeat = 0;
  var heartbeatTimer = null;
  var HEARTBEAT_INTERVAL = 15000; // 15 seconds

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
    lastHeartbeat = 0;
    leaveSent = false;
    send({ action: "enter" });
    startHeartbeat();
  }

  function sendHeartbeat() {
    if (!enterTime || leaveSent) return;
    var now = Date.now();
    var delta = now - enterTime - lastHeartbeat;
    lastHeartbeat = now - enterTime;
    send({ action: "heartbeat", durationMs: delta });
  }

  function startHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  }

  function sendLeave() {
    if (leaveSent) return;
    leaveSent = true;
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    var totalDuration = enterTime ? Date.now() - enterTime : 0;
    var remaining = totalDuration - lastHeartbeat;
    send({ action: "leave", durationMs: remaining > 0 ? remaining : 0 });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", sendEnter);
  } else {
    sendEnter();
  }

  // Click tracking: any element with data-track="eventName"
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-track]") : null;
    if (!el) return;
    var eventName = el.getAttribute("data-track");
    if (!eventName) return;
    send({ action: "click", eventName: eventName });
  }, true);

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") sendLeave();
  });
  window.addEventListener("beforeunload", sendLeave);
})();
