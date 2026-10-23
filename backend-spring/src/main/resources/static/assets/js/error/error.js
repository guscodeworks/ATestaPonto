(function () {
  "use strict";

  // Rota de destino do botão "Voltar ao início".
  // Ajuste este caminho caso a página inicial/login do sistema mude de local.
  var HOME_URL = "../index.html";

  var btnVoltar = document.getElementById("btn-voltar");

  if (btnVoltar) {
    btnVoltar.addEventListener("click", function () {
      window.location.href = HOME_URL;
    });
  }

})();