(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = { cpf: "" };
  let resendTimer = null;

  function maskCpf(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 11)
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }

  function showStep(stepId) {
    document.querySelectorAll(".step").forEach((step) => step.setAttribute("data-step", "inactive"));
    $(stepId).setAttribute("data-step", "active");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setLoading(button, loading) {
    button.classList.toggle("is-loading", loading);
    button.disabled = loading;
  }

  function showError(input, error, message) {
    input.closest(".input-group").classList.add("has-error");
    error.textContent = message;
    error.classList.add("has-error-visible");
  }

  function clearError(input, error) {
    input.closest(".input-group").classList.remove("has-error");
    error.classList.remove("has-error-visible");
  }

  async function request(path, body) {
    const response = await fetch(`/api/pontos/recuperar-senha/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false) {
      throw new Error(payload?.error?.message || "Não foi possível concluir a solicitação.");
    }
    return payload.data || {};
  }

  function startResendCooldown() {
    const button = $("btn-reenviar");
    let seconds = 30;
    button.disabled = true;
    button.textContent = `Reenviar código (${seconds}s)`;
    clearInterval(resendTimer);
    resendTimer = setInterval(() => {
      seconds -= 1;
      if (seconds <= 0) {
        clearInterval(resendTimer);
        button.disabled = false;
        button.textContent = "Reenviar código";
      } else {
        button.textContent = `Reenviar código (${seconds}s)`;
      }
    }, 1000);
  }

  const cpf = $("cpf");
  const cpfError = $("cpf-error");
  cpf.addEventListener("input", () => {
    cpf.value = maskCpf(cpf.value);
    clearError(cpf, cpfError);
  });

  $("form-cpf").addEventListener("submit", async (event) => {
    event.preventDefault();
    const digits = cpf.value.replace(/\D/g, "");
    if (digits.length !== 11) {
      showError(cpf, cpfError, "Informe um CPF válido.");
      cpf.focus();
      return;
    }
    state.cpf = digits;
    const button = $("btn-continuar");
    setLoading(button, true);
    try {
      await request("solicitar", { cpf: digits });
      $("codigo-subtitle").textContent = "Se houver uma conta ativa para este CPF, enviamos um código de 6 dígitos ao e-mail cadastrado.";
      showStep("step-codigo");
      startResendCooldown();
      $("codigo").focus();
    } catch (error) {
      showError(cpf, cpfError, error.message);
    } finally {
      setLoading(button, false);
    }
  });

  const codigo = $("codigo");
  const codigoError = $("codigo-error");
  codigo.addEventListener("input", () => {
    codigo.value = codigo.value.replace(/\D/g, "").slice(0, 6);
    clearError(codigo, codigoError);
  });
  $("btn-voltar-cpf").addEventListener("click", (event) => {
    event.preventDefault();
    showStep("step-cpf");
  });
  $("btn-reenviar").addEventListener("click", async () => {
    const button = $("btn-reenviar");
    if (button.disabled || !state.cpf) return;
    button.disabled = true;
    try {
      await request("solicitar", { cpf: state.cpf });
      startResendCooldown();
    } catch (error) {
      button.disabled = false;
      showError(codigo, codigoError, error.message);
    }
  });
  $("form-codigo").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (codigo.value.length !== 6) {
      showError(codigo, codigoError, "Informe o código de 6 dígitos.");
      codigo.focus();
      return;
    }
    const button = $("btn-validar");
    setLoading(button, true);
    try {
      await request("validar", { codigo: codigo.value });
      clearInterval(resendTimer);
      showStep("step-senha");
      $("nova-senha").focus();
    } catch (error) {
      showError(codigo, codigoError, error.message);
    } finally {
      setLoading(button, false);
    }
  });

  document.querySelectorAll(".toggle-visibility").forEach((button) => {
    button.addEventListener("click", () => {
      const input = $(button.getAttribute("data-target"));
      input.type = input.type === "password" ? "text" : "password";
    });
  });
  const novaSenha = $("nova-senha");
  const confirmaSenha = $("confirma-senha");
  const senhaError = $("senha-error");
  [novaSenha, confirmaSenha].forEach((input) => input.addEventListener("input", () => clearError(confirmaSenha, senhaError)));
  $("form-senha").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (novaSenha.value.length < 8 || novaSenha.value !== confirmaSenha.value) {
      showError(confirmaSenha, senhaError, novaSenha.value.length < 8 ? "A senha deve ter pelo menos 8 caracteres." : "As senhas não coincidem.");
      confirmaSenha.focus();
      return;
    }
    const button = $("btn-salvar");
    setLoading(button, true);
    try {
      await request("redefinir", { novaSenha: novaSenha.value });
      showStep("step-sucesso");
    } catch (error) {
      showError(confirmaSenha, senhaError, error.message);
    } finally {
      setLoading(button, false);
    }
  });
})();
