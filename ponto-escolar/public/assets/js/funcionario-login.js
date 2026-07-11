(function () {
  'use strict';

  const form = document.getElementById('login-form');
  const cpfInput = document.getElementById('cpf');
  const senhaInput = document.getElementById('senha');
  const cpfError = document.getElementById('cpf-error');
  const senhaError = document.getElementById('senha-error');
  const togglePw = document.getElementById('toggle-pw');
  const btnLogin = document.getElementById('btn-login');
  const remember = document.getElementById('remember');
  const toastStack = document.getElementById('toast-stack');

  if (
    !form || !cpfInput || !senhaInput || !cpfError || !senhaError ||
    !togglePw || !btnLogin || !remember || !toastStack
  ) {
    return;
  }

  let isSubmitting = false;

  function toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = '<span class="toast-icon" aria-hidden="true"></span><span class="toast-msg"></span>';
    el.querySelector('.toast-msg').textContent = message;
    toastStack.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  async function apiRequest(path, options = {}) {
    const response = await fetch(`/api${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload.success === false) {
      const error = new Error('Não foi possível concluir o login. Tente novamente.');
      error.status = response.status;
      throw error;
    }

    return payload.data;
  }

  function onlyDigits(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 11);
  }

  function formatCpf(value) {
    const digits = onlyDigits(value);

    return digits
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }

  function isValidCpf(value) {
    const cpf = onlyDigits(value);

    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) {
      return false;
    }

    const calculateDigit = (length) => {
      let sum = 0;
      for (let index = 0; index < length; index += 1) {
        sum += Number(cpf[index]) * (length + 1 - index);
      }
      const remainder = (sum * 10) % 11;
      return remainder === 10 ? 0 : remainder;
    };

    return calculateDigit(9) === Number(cpf[9]) &&
      calculateDigit(10) === Number(cpf[10]);
  }

  function setFieldError(input, errorElement, message) {
    errorElement.textContent = message;
    errorElement.classList.add('visible');
    input.classList.add('has-error');
    input.setAttribute('aria-invalid', 'true');
  }

  function clearFieldError(input, errorElement) {
    errorElement.classList.remove('visible');
    input.classList.remove('has-error');
    input.removeAttribute('aria-invalid');
  }

  function setLoading(loading) {
    isSubmitting = loading;
    btnLogin.classList.toggle('loading', loading);
    btnLogin.disabled = loading;
    cpfInput.disabled = loading;
    senhaInput.disabled = loading;
    remember.disabled = loading;
    togglePw.disabled = loading;
    form.setAttribute('aria-busy', String(loading));
    if (loading) {
      btnLogin.setAttribute('aria-label', 'Entrando');
    } else {
      btnLogin.removeAttribute('aria-label');
    }
  }

  cpfInput.addEventListener('input', function () {
    this.value = formatCpf(this.value);
    clearFieldError(cpfInput, cpfError);
  });

  senhaInput.addEventListener('input', function () {
    clearFieldError(senhaInput, senhaError);
  });

  togglePw.addEventListener('click', function () {
    const shouldShow = senhaInput.type === 'password';
    senhaInput.type = shouldShow ? 'text' : 'password';
    this.textContent = shouldShow ? 'Ocultar' : 'Mostrar';
    this.setAttribute('aria-label', shouldShow ? 'Ocultar senha' : 'Mostrar senha');
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const cpf = cpfInput.value;
    const senha = senhaInput.value;
    let firstInvalidField = null;

    clearFieldError(cpfInput, cpfError);
    clearFieldError(senhaInput, senhaError);

    if (!isValidCpf(cpf)) {
      setFieldError(cpfInput, cpfError, 'CPF inválido. Verifique e tente novamente.');
      firstInvalidField = cpfInput;
    }

    if (senha.length < 8) {
      setFieldError(senhaInput, senhaError, 'A senha deve ter pelo menos 8 caracteres.');
      firstInvalidField ||= senhaInput;
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
    let loginSucceeded = false;

    try {
      const data = await apiRequest('/pontos/login', {
        method: 'POST',
        body: {
          cpf: onlyDigits(cpf),
          senha
        }
      });

      sessionStorage.setItem('funcionario_token', data.token);
      sessionStorage.setItem('funcionario_data', JSON.stringify(data.funcionario));
      sessionStorage.setItem('func_nome', data.funcionario?.nome || '');
      sessionStorage.setItem('func_cpf', cpf);

      if (remember.checked) {
        localStorage.setItem('func_saved_cpf', formatCpf(cpf));
      } else {
        localStorage.removeItem('func_saved_cpf');
      }

      loginSucceeded = true;
      window.location.href = '/funcionario';
    } catch (error) {
      const message = error instanceof TypeError
        ? 'Não foi possível conectar ao servidor. Tente novamente.'
        : 'CPF ou senha inválidos.';
      toast(message, 'error');
    } finally {
      if (!loginSucceeded) {
        setLoading(false);
        senhaInput.focus();
      }
    }
  });

  const savedCpf = localStorage.getItem('func_saved_cpf');
  if (savedCpf) {
    cpfInput.value = formatCpf(savedCpf);
    remember.checked = true;
  }

  remember.addEventListener('change', function () {
    if (!this.checked) {
      localStorage.removeItem('func_saved_cpf');
    }
  });
})();
