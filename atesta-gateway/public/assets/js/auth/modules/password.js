(function () {
  "use strict";

  /* ---------------------------------------------------
     Utilidades
  --------------------------------------------------- */

  function $(id) { return document.getElementById(id); }

  function maskCPF(value) {
    return value
      .replace(/\D/g, "")
      .slice(0, 11)
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  function isValidCPF(cpf) {
    const digits = cpf.replace(/\D/g, "");
    return digits.length === 11;
  }

  function goToStep(stepEl) {
    document.querySelectorAll(".step").forEach(function (s) {
      s.setAttribute("data-step", "inactive");
    });
    stepEl.setAttribute("data-step", "active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setLoading(button, loading) {
    if (loading) {
      button.classList.add("is-loading");
    } else {
      button.classList.remove("is-loading");
    }
  }

  function showFieldError(inputGroup, errorEl, show) {
    if (show) {
      inputGroup.classList.add("has-error");
      errorEl.classList.add("has-error-visible");
    } else {
      inputGroup.classList.remove("has-error");
      errorEl.classList.remove("has-error-visible");
    }
  }

  /* ---------------------------------------------------
     Estado do fluxo
  --------------------------------------------------- */

  const state = {
    cpf: "",
    metodo: "email"
  };

  /* ---------------------------------------------------
     Etapa 1 — CPF + método
  --------------------------------------------------- */

  const cpfInput = $("cpf");
  const cpfGroup = cpfInput.closest(".input-group");
  const cpfError = $("cpf-error");
  const formCpf = $("form-cpf");
  const btnContinuar = $("btn-continuar");

  cpfInput.addEventListener("input", function (e) {
    e.target.value = maskCPF(e.target.value);
    showFieldError(cpfGroup, cpfError, false);
  });

  formCpf.addEventListener("submit", function (e) {
    e.preventDefault();

    if (!isValidCPF(cpfInput.value)) {
      showFieldError(cpfGroup, cpfError, true);
      cpfInput.focus();
      return;
    }

    const metodoSelecionado = formCpf.querySelector('input[name="metodo"]:checked');
    state.cpf = cpfInput.value;
    state.metodo = metodoSelecionado ? metodoSelecionado.value : "email";

    setLoading(btnContinuar, true);

    // Simula envio do código (integração real substituiria esta chamada)
    setTimeout(function () {
      setLoading(btnContinuar, false);

      const destino = state.metodo === "email"
        ? "o e-mail cadastrado"
        : "o telefone cadastrado por SMS";
      $("codigo-subtitle").textContent =
        "Enviamos um código de 6 dígitos para " + destino + ". Digite-o abaixo para continuar.";

      goToStep($("step-codigo"));
      startResendCooldown();
      $("codigo").focus();
    }, 900);
  });

  /* ---------------------------------------------------
     Etapa 2 — Confirmação do código
  --------------------------------------------------- */

  const codigoInput = $("codigo");
  const codigoGroup = codigoInput.closest(".input-group");
  const codigoError = $("codigo-error");
  const formCodigo = $("form-codigo");
  const btnValidar = $("btn-validar");
  const btnReenviar = $("btn-reenviar");
  const btnVoltarCpf = $("btn-voltar-cpf");

  codigoInput.addEventListener("input", function (e) {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 6);
    showFieldError(codigoGroup, codigoError, false);
  });

  btnVoltarCpf.addEventListener("click", function (e) {
    e.preventDefault();
    goToStep($("step-cpf"));
  });

  let resendTimer = null;

  function startResendCooldown() {
    let seconds = 30;
    btnReenviar.disabled = true;
    btnReenviar.textContent = "Reenviar código (" + seconds + "s)";

    clearInterval(resendTimer);
    resendTimer = setInterval(function () {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(resendTimer);
        btnReenviar.disabled = false;
        btnReenviar.textContent = "Reenviar código";
      } else {
        btnReenviar.textContent = "Reenviar código (" + seconds + "s)";
      }
    }, 1000);
  }

  btnReenviar.addEventListener("click", function () {
    if (btnReenviar.disabled) return;
    startResendCooldown();
    // Aqui entraria a chamada real para reenvio do código
  });

  formCodigo.addEventListener("submit", function (e) {
    e.preventDefault();

    if (codigoInput.value.length !== 6) {
      showFieldError(codigoGroup, codigoError, true);
      codigoInput.focus();
      return;
    }

    setLoading(btnValidar, true);

    // Simula validação do código (integração real substituiria esta chamada)
    setTimeout(function () {
      setLoading(btnValidar, false);
      clearInterval(resendTimer);
      goToStep($("step-senha"));
      $("nova-senha").focus();
    }, 900);
  });

  /* ---------------------------------------------------
     Etapa 3 — Nova senha
  --------------------------------------------------- */

  const novaSenhaInput = $("nova-senha");
  const confirmaSenhaInput = $("confirma-senha");
  const senhaError = $("senha-error");
  const confirmaSenhaGroup = confirmaSenhaInput.closest(".input-group");
  const formSenha = $("form-senha");
  const btnSalvar = $("btn-salvar");

  document.querySelectorAll(".toggle-visibility").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const target = $(btn.getAttribute("data-target"));
      target.type = target.type === "password" ? "text" : "password";
    });
  });

  [novaSenhaInput, confirmaSenhaInput].forEach(function (el) {
    el.addEventListener("input", function () {
      showFieldError(confirmaSenhaGroup, senhaError, false);
    });
  });

  formSenha.addEventListener("submit", function (e) {
    e.preventDefault();

    const novaSenha = novaSenhaInput.value;
    const confirmaSenha = confirmaSenhaInput.value;

    if (novaSenha.length < 6 || novaSenha !== confirmaSenha) {
      showFieldError(confirmaSenhaGroup, senhaError, true);
      confirmaSenhaInput.focus();
      return;
    }

    setLoading(btnSalvar, true);

    // Simula atualização segura da senha no backend
    setTimeout(function () {
      setLoading(btnSalvar, false);
      goToStep($("step-sucesso"));
    }, 900);
  });

})();