/*
 * GENX admin/report overlay JavaScript.
 *
 * Responsibilities:
 * - Sidebar expand/collapse behavior.
 * - Cleanup for realtime report refresh content, which can otherwise inject
 *   a nested legacy nav/topbar inside the modern report card.
 */
(function () {
  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else {
      fn();
    }
  }

  ready(function () {
    document.querySelectorAll('.ui-nav-group-title').forEach(function (btn) {
      var initialGroup = btn.closest('.ui-nav-group');
      btn.setAttribute('aria-expanded', initialGroup && initialGroup.classList.contains('open') ? 'true' : 'false');

      btn.addEventListener('click', function () {
        var group = btn.closest('.ui-nav-group');
        if (group) {
          var shouldOpen = !group.classList.contains('open');

          document.querySelectorAll('.ui-nav-group.open').forEach(function (openGroup) {
            if (openGroup !== group) {
              openGroup.classList.remove('open');
              var openButton = openGroup.querySelector('.ui-nav-group-title');
              if (openButton) {
                openButton.setAttribute('aria-expanded', 'false');
              }
            }
          });

          group.classList.toggle('open', shouldOpen);
          btn.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
        }
      });
    });

    var toggle = document.getElementById('uiSidebarToggle');
    if (toggle) {
      toggle.addEventListener('click', function () {
        document.body.classList.toggle('ui-sidebar-collapsed');
      });
    }
  });
})();

/* Realtime report cleanup
 * VICIdial realtime refreshes can inject a full transformed overlay page into
 * #realtime_content. Keep the refreshed report data, but remove the nested
 * shell/sidebar so navigation remains clickable and the report box stays clean.
 */
(function () {
  function cleanText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function moveChildren(from, to) {
    while (from.firstChild) {
      to.appendChild(from.firstChild);
    }
  }

  function removeLegacyNavTables(scope) {
    Array.prototype.slice.call(scope.querySelectorAll('table')).forEach(function (table) {
      var text = cleanText(table.textContent).toUpperCase();
      var shortEnough = text.length < 1200;
      var mainNav =
        text.indexOf('REPORTS') !== -1 &&
        text.indexOf('USERS') !== -1 &&
        text.indexOf('CAMPAIGNS') !== -1 &&
        text.indexOf('ADMIN') !== -1;
      var topNav =
        text.indexOf('HOME') !== -1 &&
        text.indexOf('TIMECLOCK') !== -1 &&
        text.indexOf('LOGOUT') !== -1;

      if (shortEnough && (mainNav || topNav)) {
        table.remove();
      }
    });
  }

  function removeNestedHeadTags(scope) {
    Array.prototype.slice.call(scope.querySelectorAll('meta, title, link[rel="stylesheet"], style#genx-critical-paint')).forEach(function (node) {
      node.remove();
    });
  }

  function unwrapNestedOverlay(scope) {
    Array.prototype.slice.call(scope.querySelectorAll('.ui-report-wrap .ui-app')).forEach(function (app) {
      var nestedReport = app.querySelector('.ui-report-wrap');
      var replacement = document.createDocumentFragment();

      if (nestedReport) {
        moveChildren(nestedReport, replacement);
      }

      app.replaceWith(replacement);
    });
  }

  function cleanupRealtimeReport() {
    var wrap = document.querySelector('.ui-report-wrap');
    if (!wrap) {
      return;
    }

    removeNestedHeadTags(wrap);
    unwrapNestedOverlay(wrap);
    removeLegacyNavTables(wrap);
  }

  function start() {
    cleanupRealtimeReport();

    var realtime = document.getElementById('realtime_content');
    if (!realtime || !window.MutationObserver) {
      return;
    }

    var scheduled = false;
    var observer = new MutationObserver(function () {
      if (scheduled) {
        return;
      }

      scheduled = true;
      window.setTimeout(function () {
        scheduled = false;
        cleanupRealtimeReport();
      }, 0);
    });

    observer.observe(realtime, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

/* Dark transition overlay for full-page VICIdial navigation */
(function () {
  function ensureLoader() {
    if (document.querySelector('.ui-page-loading')) {
      return;
    }

    var loader = document.createElement('div');
    loader.className = 'ui-page-loading';
    loader.innerHTML =
      '<div class="ui-page-loading-box">' +
        '<span class="ui-page-loading-spinner"></span>' +
        '<span>Loading VICIdial...</span>' +
      '</div>';

    document.body.appendChild(loader);
  }

  function showLoaderSoon() {
    if (document.body && document.body.getAttribute('data-ui-page') === 'realtime') {
      return;
    }

    ensureLoader();

    window.setTimeout(function () {
      document.body.classList.add('ui-is-loading');
    }, 40);
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a');

    if (!link) {
      return;
    }

    var href = link.getAttribute('href') || '';

    if (
      href === '' ||
      href.charAt(0) === '#' ||
      href.indexOf('javascript:') === 0 ||
      link.target === '_blank' ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    showLoaderSoon();
  }, true);

  document.addEventListener('submit', function () {
    showLoaderSoon();
  }, true);

  window.addEventListener('pageshow', function () {
    document.body.classList.remove('ui-is-loading');
  });
})();








