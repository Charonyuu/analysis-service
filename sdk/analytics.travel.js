(function(config) {
  var SITE = config.site;
  var API_BASE = config.apiBase;

  function getSessionId() {
    var id = sessionStorage.getItem('_analytics_sid');
    if (!id) {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
      });
      sessionStorage.setItem('_analytics_sid', id);
    }
    return id;
  }

  function send(endpoint, data) {
    var payload = JSON.stringify(Object.assign({}, data, { site: SITE, sessionId: getSessionId() }));
    if (navigator.sendBeacon) {
      navigator.sendBeacon(API_BASE + endpoint, new Blob([payload], { type: 'application/json' }));
    } else {
      fetch(API_BASE + endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true
      }).catch(function() {});
    }
  }

  function trackPageview() {
    send('/api/pageview', {
      path: location.pathname + location.search,
      referrer: document.referrer || ''
    });
  }

  function trackEvent(eventName, options) {
    options = options || {};
    send('/api/event', {
      eventName: eventName,
      elementId: options.elementId || '',
      path: location.pathname + location.search,
      metadata: options.metadata || {}
    });
  }

  function bindAutoTrack() {
    document.addEventListener('click', function(e) {
      var el = e.target.closest('[data-track]');
      if (!el) return;
      var eventName = el.getAttribute('data-track');
      var elementId = el.id || el.getAttribute('data-track-id') || '';
      var metadata = {};
      try {
        var raw = el.getAttribute('data-track-meta');
        if (raw) metadata = JSON.parse(raw);
      } catch(err) {}
      trackEvent(eventName, { elementId: elementId, metadata: metadata });
    }, true);
  }

  function bindSPATracking() {
    var _push = history.pushState.bind(history);
    var _replace = history.replaceState.bind(history);
    history.pushState = function() { _push.apply(this, arguments); trackPageview(); };
    history.replaceState = function() { _replace.apply(this, arguments); trackPageview(); };
    window.addEventListener('popstate', trackPageview);
    window.addEventListener('hashchange', trackPageview);
  }

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        trackPageview();
        bindAutoTrack();
      });
    } else {
      trackPageview();
      bindAutoTrack();
    }
    bindSPATracking();
  }

  window.Analytics = {
    track: trackEvent,
    site: SITE
  };

  init();

})({ site: 'travel', apiBase: 'http://localhost:3099' });
