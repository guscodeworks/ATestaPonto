/* Carrega os módulos administrativos na ordem correta, sem bloquear a UI
   inteira durante a inicialização do dashboard. */
(async function carregarModulosAdmin() {
  'use strict';

  const modules = [
    '00-state.js', '01-helpers.js', '02-ui-core.js', '03-dashboard.js',
    '04-employees.js', '05-points.js', '06-reports.js', '07-register.js',
    '08-settings-login.js', '10-schools.js', '09-init.js', 'mobile-check.js', 'settings.js',
  ];

  const urls = ['/assets/js/shared/loading.js', ...modules].map((module) =>
    module.startsWith('/') ? module : `/assets/js/admin/modules/${module}`
  );

  for (const src of urls) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      script.defer = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Não foi possível carregar ${src}.`));
      document.head.appendChild(script);
    }).catch((error) => {
      console.error(error);
      throw error;
    });
  }
})().catch((error) => console.error(error));
