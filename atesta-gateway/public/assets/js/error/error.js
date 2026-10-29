(function () {
  "use strict";

  var HOME_URL = "/login";

  var btnVoltar = document.getElementById("btn-voltar");

  if (btnVoltar) {
    btnVoltar.addEventListener("click", function () {
      window.location.href = HOME_URL;
    });
  }

})();