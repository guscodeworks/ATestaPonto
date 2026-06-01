(function loadAdminBundle() {
  if (window.__ADMIN_BUNDLE_LOADED__) {
    return;
  }
  window.__ADMIN_BUNDLE_LOADED__ = true;

  var scripts = [
    '/assets/js/admin/00-state.js',
    '/assets/js/admin/01-helpers.js',
    '/assets/js/admin/02-ui-core.js',
    '/assets/js/admin/03-dashboard.js',
    '/assets/js/admin/04-employees.js',
    '/assets/js/admin/05-points.js',
    '/assets/js/admin/06-reports.js',
    '/assets/js/admin/07-register.js',
    '/assets/js/admin/08-settings-login.js',
    '/assets/js/admin/09-bootstrap.js'
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
