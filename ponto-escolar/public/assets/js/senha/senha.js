(function () {
  "use strict";

  const tokenTrocaSenha = sessionStorage.getItem("funcionario_token_troca_senha");
  const form = document.getElementById("form-senha");
  const novaSenhaInput = document.getElementById("nova-senha");
  const confirmaSenhaInput = document.getElementById("confirma-senha");
  const confirmaSenhaGroup = document.getElementById("confirma-senha-group");
  const senhaError = document.getElementById("senha-error");
  const btnSalvar = document.getElementById("btn-salvar");

  function goToStep(step) {
    document.querySelectorAll(".step").forEach((element) => {
      element.setAttribute("data-step", "inactive");
    });
    step.setAttribute("data-step", "active");
  }

  function setLoading(loading) {
    btnSalvar.disabled = loading;
    btnSalvar.classList.toggle("is-loading", loading);
    form.setAttribute("aria-busy", String(loading));
  }

  function showError(message) {
    senhaError.textContent = message;
    senhaError.classList.add("has-error-visible");
    confirmaSenhaGroup.classList.add("has-error");
  }

  function clearError() {
    senhaError.textContent = "";
    senhaError.classList.remove("has-error-visible");
    confirmaSenhaGroup.classList.remove("has-error");
  }

  document.querySelectorAll(".toggle-visibility").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.target);
      const visible = input.type === "password";
      input.type = visible ? "text" : "password";
      button.textContent = visible ? "Ocultar" : "Mostrar";
      button.setAttribute("aria-label", visible ? "Ocultar senha" : "Mostrar senha");
    });
  });

  [novaSenhaInput, confirmaSenhaInput].forEach((input) => {
    input.addEventListener("input", clearError);
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const novaSenha = novaSenhaInput.value;
    const confirmaSenha = confirmaSenhaInput.value;

    clearError();
    if (novaSenha.length < 8) {
      showError("A senha deve ter ao menos 8 caracteres.");
      novaSenhaInput.focus();
      return;
    }
    if (novaSenha !== confirmaSenha) {
      showError("As senhas nao coincidem.");
      confirmaSenhaInput.focus();
      return;
    }
    if (!tokenTrocaSenha) {
      showError("Entre novamente com sua senha temporaria.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/pontos/alterar-senha", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenTrocaSenha}`,
        },
        body: JSON.stringify({ nova_senha: novaSenha }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(payload?.error?.message || "Nao foi possivel atualizar a senha.");
      }

      sessionStorage.removeItem("funcionario_token_troca_senha");
      goToStep(document.getElementById("step-sucesso"));
    } catch (error) {
      showError(error.message || "Nao foi possivel atualizar a senha.");
    } finally {
      setLoading(false);
    }
  });
})();
