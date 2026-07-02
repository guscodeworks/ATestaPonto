(function loadAdminBundle() {
  // Guarda contra carregamento duplicado: evita que os scripts sejam
  // injetados novamente caso este arquivo seja incluído mais de uma vez
  // na mesma página.
  if (window.__ADMIN_BUNDLE_LOADED__) {
    return;
  }
  window.__ADMIN_BUNDLE_LOADED__ = true;

  // Ordem importa: os arquivos dependem uns dos outros (estado global,
  // depois helpers, depois UI, depois as telas específicas, e o bootstrap
  // por último, já que ele assume que tudo acima já foi definido).
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

  // Enquanto o HTML ainda está sendo parseado, document.write insere os
  // scripts em ordem síncrona, garantindo que cada um seja executado
  // antes do próximo ser processado pelo parser.
  if (document.readyState === 'loading') {
    document.write(scripts.map(function (src) { return '<script src="' + src + '"><\\/script>'; }).join(''));
    return;
  }

  // Se o documento já terminou de carregar, document.write não pode mais
  // ser usado (sobrescreveria a página). Nesse caso, os scripts são
  // injetados dinamicamente e encadeados via Promise para preservar a
  // mesma ordem sequencial de carregamento e execução.
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