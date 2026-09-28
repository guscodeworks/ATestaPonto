/* Carrega os módulos administrativos na ordem em que compartilham estado. */
(async function carregarModulosAdmin() {
  'use strict';

  const modules = [
    '00-state.js', '01-helpers.js', '02-ui-core.js', '03-dashboard.js',
    '04-employees.js', '05-points.js', '06-reports.js', '07-register.js',
    '08-settings-login.js', '09-init.js', 'mobile-check.js', 'settings.js',
  ];

  for (const module of ['/assets/js/shared/loading.js', ...modules]) {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = module.startsWith('/') ? module : `/assets/js/admin/modules/${module}`;
      script.async = false;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Não foi possível carregar ${module}.`));
      document.head.appendChild(script);
    });
  }
})().catch((error) => console.error(error));
