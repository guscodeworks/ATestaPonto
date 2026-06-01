(function loadLegacyAppBundle() {
  if (window.__LEGACY_APP_BUNDLE_LOADED__) {
    return;
  }
  window.__LEGACY_APP_BUNDLE_LOADED__ = true;

  var scripts = [
    '/assets/js/app/00-core.js',
    '/assets/js/app/01-network-auth.js',
    '/assets/js/app/02-ui-helpers.js',
    '/assets/js/app/03-dashboard.js',
    '/assets/js/app/04-employees.js',
    '/assets/js/app/05-points-reports.js',
    '/assets/js/app/06-bootstrap.js'
  ];

  if (document.readyState === 'loading') {
    document.write(scripts.map(function (src) { return '<script src="' + src + '"><\\/script>'; }).join(''));
    return;
  }

  scripts.reduce(function (chain, src) {
    return chain.then(function () {
      return new Promise(function (resolve, reject) {
        var script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
    });
  }, Promise.resolve());
})();
