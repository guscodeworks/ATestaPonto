(function () {
  'use strict';

  const MOBILE_MAX_WIDTH = 768;
  // Cada configuração define um par de visões (tabela desktop / cards mobile)
  // e só é aplicada se os elementos correspondentes existirem na página atual,
  // permitindo que o mesmo script sirva telas diferentes (funcionários, pontos).
  const PAGE_CONFIGS = [
    {
      isActive: () => document.getElementById('cards-funcionarios'),
      desktopSelectors: ['.table-desktop'],
      mobileSelectors: ['#cards-funcionarios'],
    },
    {
      isActive: () => document.querySelector('.table-desktop-p, .table-desktop-a'),
      desktopSelectors: ['.table-desktop-p, .table-desktop-a'],
      mobileSelectors: ['.cards-mobile'],
    },
  ];

  function setDisplay(selectors, displayValue) {
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((element) => {
        element.style.display = displayValue;
      });
    });
  }

  function checkMobile() {
    const isMobile = window.innerWidth <= MOBILE_MAX_WIDTH;

    PAGE_CONFIGS.forEach((config) => {
      if (!config.isActive()) {
        return;
      }

      // 'block' para a tabela desktop e 'flex' para os cards mobile:
      // valores escolhidos conforme o layout CSS de cada elemento.
      setDisplay(config.desktopSelectors, isMobile ? 'none' : 'block');
      setDisplay(config.mobileSelectors, isMobile ? 'flex' : 'none');
    });
  }

  // Exposto globalmente para permitir chamada manual (ex.: após uma
  // renderização dinâmica que insira novos elementos na página).
  window.checkMobile = checkMobile;
  window.addEventListener('resize', checkMobile);
  checkMobile();
})();