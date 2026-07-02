(function loadLegacyAppBundle() {
  // Guarda contra carregamento duplicado: evita que os scripts sejam
  // injetados novamente caso este arquivo seja incluído mais de uma vez
  // na mesma página.
  if (window.__LEGACY_APP_BUNDLE_LOADED__) {
    return;
  }
  window.__LEGACY_APP_BUNDLE_LOADED__ = true;

  // Ordem importa: os arquivos dependem uns dos outros (core, depois
  // rede/auth, depois helpers de UI, depois as telas específicas, e o
  // bootstrap por último, já que assume que tudo acima já foi definido).
  var scripts = [
    '/assets/js/app/00-core.js',
    '/assets/js/app/01-network-auth.js',
    '/assets/js/app/02-ui-helpers.js',
    '/assets/js/app/03-dashboard.js',
    '/assets/js/app/04-employees.js',
    '/assets/js/app/05-points-reports.js',
    '/assets/js/app/06-bootstrap.js'
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