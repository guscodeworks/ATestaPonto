(function () {
  'use strict';

  const form = document.getElementById('first-access-form');
  const novaSenhaInput = document.getElementById('nova-senha');
  const confirmaSenhaInput = document.getElementById('confirma-senha');
  const novaSenhaError = document.getElementById('nova-senha-error');
  const confirmaSenhaError = document.getElementById('confirma-senha-error');
  const toggleNovaSenha = document.getElementById('toggle-nova-senha');
  const toggleConfirmaSenha = document.getElementById('toggle-confirma-senha');
  const btnSalvar = document.getElementById('btn-salvar');
  const toastStack = document.getElementById('toast-stack');
  const msgContainer = document.getElementById('msg-container');
  const loginLink = document.getElementById('login-link');

  if (
    !form || !novaSenhaInput || !confirmaSenhaInput || !novaSenhaError || !confirmaSenhaError ||
    !toggleNovaSenha || !toggleConfirmaSenha || !btnSalvar || !toastStack || !msgContainer || !loginLink
  ) {
    return;
  }

  let isSubmitting = false;
  let loadingHandle = null;

  function toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = '<span class="toast-icon" aria-hidden="true"></span><span class="toast-msg"></span>';
    el.querySelector('.toast-msg').textContent = message;
    toastStack.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  function showMessage(message, isError = false) {
    msgContainer.textContent = message;
    msgContainer.className = 'msg-container ' + (isError ? 'error' : 'success');
    msgContainer.hidden = false;
  }

  function hideMessage() {
    msgContainer.hidden = true;
    msgContainer.textContent = '';
    msgContainer.className = 'msg-container';
  }

  async function apiRequest(path, options = {}) {
    const token = sessionStorage.getItem('funcionario_primeiro_acesso_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`/api${path}`, {
      method: options.method || 'POST',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.success === false) {
      const error = new Error(payload.message || 'Não foi possível concluir a operação. Tente novamente.');
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  }

  function setFieldError(input, errorElement, message) {
    errorElement.textContent = message;
    errorElement.classList.add('visible');
    input.classList.add('has-error');
    input.setAttribute('aria-invalid', 'true');
    input.closest('.input-group')?.classList.add('has-error');
  }

  function clearFieldError(input, errorElement) {
    errorElement.classList.remove('visible');
    input.classList.remove('has-error');
    input.removeAttribute('aria-invalid');
    input.closest('.input-group')?.classList.remove('has-error');
  }

  async function setLoading(loading) {
    isSubmitting = loading;
    if (loading) {
      loadingHandle = window.iniciarCarregamento(btnSalvar, {
        tamanho: 'sm',
        mensagem: 'Salvando...',
        mostrarMensagem: true,
      });
      novaSenhaInput.disabled = true;
      confirmaSenhaInput.disabled = true;
      toggleNovaSenha.disabled = true;
      toggleConfirmaSenha.disabled = true;
      form.setAttribute('aria-busy', 'true');
    } else {
      if (loadingHandle) {
        await window.finalizarCarregamento(loadingHandle);
        loadingHandle = null;
      }
      novaSenhaInput.disabled = false;
      confirmaSenhaInput.disabled = false;
      toggleNovaSenha.disabled = false;
      toggleConfirmaSenha.disabled = false;
      form.removeAttribute('aria-busy');
    }
  }

  novaSenhaInput.addEventListener('input', function () {
    clearFieldError(novaSenhaInput, novaSenhaError);
    if (confirmaSenhaInput.value) {
      clearFieldError(confirmaSenhaInput, confirmaSenhaError);
    }
  });

  confirmaSenhaInput.addEventListener('input', function () {
    clearFieldError(confirmaSenhaInput, confirmaSenhaError);
  });

  toggleNovaSenha.addEventListener('click', function () {
    const shouldShow = novaSenhaInput.type === 'password';
    novaSenhaInput.type = shouldShow ? 'text' : 'password';
    this.textContent = shouldShow ? 'Ocultar' : 'Mostrar';
    this.setAttribute('aria-label', shouldShow ? 'Ocultar senha' : 'Mostrar senha');
  });

  toggleConfirmaSenha.addEventListener('click', function () {
    const shouldShow = confirmaSenhaInput.type === 'password';
    confirmaSenhaInput.type = shouldShow ? 'text' : 'password';
    this.textContent = shouldShow ? 'Ocultar' : 'Mostrar';
    this.setAttribute('aria-label', shouldShow ? 'Ocultar senha' : 'Mostrar senha');
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const novaSenha = novaSenhaInput.value;
    const confirmaSenha = confirmaSenhaInput.value;
    let firstInvalidField = null;

    clearFieldError(novaSenhaInput, novaSenhaError);
    clearFieldError(confirmaSenhaInput, confirmaSenhaError);
    hideMessage();

    if (novaSenha.length < 8 || novaSenha.length > 72) {
      setFieldError(novaSenhaInput, novaSenhaError, 'A senha deve ter entre 8 e 72 caracteres.');
      firstInvalidField = novaSenhaInput;
    }

    if (novaSenha !== confirmaSenha) {
      setFieldError(confirmaSenhaInput, confirmaSenhaError, 'As senhas não coincidem.');
      firstInvalidField ||= confirmaSenhaInput;
    }

    if (firstInvalidField) {
      firstInvalidField.focus();
      return;
    }

    if (!navigator.onLine) {
      toast('Sem internet. Verifique sua conexão e tente novamente.', 'error');
      return;
    }

    setLoading(true);

    try {
      const result = await apiRequest('/pontos/primeiro-acesso/trocar-senha', {
        method: 'POST',
        body: {
          novaSenha
        }
      });

      // Sucesso: backend retorna { primeiro_acesso: false, message: "..." }
      sessionStorage.removeItem('funcionario_primeiro_acesso_token');
      sessionStorage.removeItem('funcionario_primeiro_acesso_expira_em');

      showMessage(result.message || 'Senha alterada com sucesso! Faça login novamente com a nova senha.', false);
      toast('Senha alterada com sucesso!', 'success');

      // Esconde o formulário e mostra link para login
      form.hidden = true;
      loginLink.hidden = false;

    } catch (error) {
      if (error instanceof TypeError) {
        toast('Não foi possível conectar ao servidor. Tente novamente.', 'error');
        showMessage('Erro de conexão. Tente novamente.', true);
      } else if (error.status === 401 || error.status === 403) {
        const msg = error.payload?.message || 'Token inválido ou expirado. Faça login novamente.';
        toast(msg, 'error');
        showMessage(msg, true);
        // Limpa token inválido
        sessionStorage.removeItem('funcionario_primeiro_acesso_token');
        sessionStorage.removeItem('funcionario_primeiro_acesso_expira_em');
      } else if (error.status === 409) {
        const msg = error.payload?.message || 'Primeiro acesso já foi concluído. Faça login normalmente.';
        toast(msg, 'error');
        showMessage(msg, true);
        sessionStorage.removeItem('funcionario_primeiro_acesso_token');
        sessionStorage.removeItem('funcionario_primeiro_acesso_expira_em');
      } else {
        const msg = error.payload?.message || 'Erro ao alterar senha. Tente novamente.';
        toast(msg, 'error');
        showMessage(msg, true);
      }
    } finally {
      await setLoading(false);
    }
  });

  // Verifica se há token de primeiro acesso ao carregar a página
  const token = sessionStorage.getItem('funcionario_primeiro_acesso_token');
  if (!token) {
    showMessage('Nenhum token de primeiro acesso encontrado. Faça login primeiro.', true);
    form.hidden = true;
    loginLink.hidden = false;
  }
})();