(function () {
  const cpfInput = document.getElementById('cpf');
  const senhaInput = document.getElementById('senha');
  const togglePw = document.getElementById('toggle-pw');
  const btnLogin = document.getElementById('btn-login');
  const remember = document.getElementById('remember');
  const toastStack = document.getElementById('toast-stack');

  if (!cpfInput || !senhaInput || !togglePw || !btnLogin || !remember || !toastStack) {
    return;
  }

  function toast(msg, tipo = 'info') {
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const el = document.createElement('div');
    el.className = `toast toast-${tipo}`;
    el.innerHTML = `<span class="toast-icon">${icons[tipo] || icons.info}</span><span class="toast-msg">${msg}</span>`;
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
      throw new Error(payload?.error?.message || 'Falha ao comunicar com o servidor.');
    }
    return payload.data;
  }

  function validarCPF(cpf) {
    return cpf.replace(/\D/g, '').length === 11;
  }

  cpfInput.addEventListener('input', function () {
    let v = this.value.replace(/\D/g, '');
    if (v.length > 11) v = v.slice(0, 11);
    v = v.replace(/(\d{3})(\d)/, '$1.$2');
    v = v.replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3');
    v = v.replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
    this.value = v;
  });

  togglePw.addEventListener('click', function () {
    const isHidden = senhaInput.type === 'password';
    senhaInput.type = isHidden ? 'text' : 'password';
    this.textContent = isHidden ? '🙈' : '👁';
    this.setAttribute('aria-label', isHidden ? 'Ocultar senha' : 'Mostrar senha');
  });

  btnLogin.addEventListener('click', async function () {
    const cpf = cpfInput.value;
    const senha = senhaInput.value;
    let ok = true;

    document.getElementById('cpf-error').classList.remove('visible');
    document.getElementById('senha-error').classList.remove('visible');
    cpfInput.classList.remove('has-error');
    senhaInput.classList.remove('has-error');

    if (!navigator.onLine) {
      toast('Sem internet. Verifique sua conexão e tente novamente.', 'error');
      return;
    }

    if (!validarCPF(cpf)) {
      document.getElementById('cpf-error').classList.add('visible');
      cpfInput.classList.add('has-error');
      ok = false;
    }
    if (senha.length < 8) {
      document.getElementById('senha-error').classList.add('visible');
      senhaInput.classList.add('has-error');
      ok = false;
    }

    if (!ok) return;

    btnLogin.classList.add('loading');
    btnLogin.disabled = true;

    try {
      const data = await apiRequest('/pontos/login', {
        method: 'POST',
        body: {
          cpf: cpf.replace(/\D/g, ''),
          senha
        }
      });

      sessionStorage.setItem('funcionario_token', data.token);
      sessionStorage.setItem('funcionario_data', JSON.stringify(data.funcionario));
      sessionStorage.setItem('func_nome', data.funcionario?.nome || '');
      sessionStorage.setItem('func_cpf', cpf);

      if (remember.checked && validarCPF(cpfInput.value)) {
        localStorage.setItem('func_saved_cpf', cpfInput.value);
      }

      window.location.href = '/funcionario';
    } catch (error) {
      toast(error.message || 'Falha no login.', 'error');
    } finally {
      btnLogin.classList.remove('loading');
      btnLogin.disabled = false;
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnLogin.click();
  });

  const saved = localStorage.getItem('func_saved_cpf');
  if (saved) {
    cpfInput.value = saved;
    remember.checked = true;
  }

  remember.addEventListener('change', function () {
    if (!this.checked) localStorage.removeItem('func_saved_cpf');
  });
})();
