(function () {
  'use strict';

  const MOBILE_MAX_WIDTH = 768;
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

      setDisplay(config.desktopSelectors, isMobile ? 'none' : 'block');
      setDisplay(config.mobileSelectors, isMobile ? 'flex' : 'none');
    });
  }

  window.checkMobile = checkMobile;
  window.addEventListener('resize', checkMobile);
  checkMobile();
})();
