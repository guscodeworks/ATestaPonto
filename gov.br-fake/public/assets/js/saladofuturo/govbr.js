const loginForm = document.getElementById("demoLoginForm");
const loginInput = document.getElementById("login");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("loginButton");
const loginStatus = document.getElementById("loginStatus");
const defaultButtonText = "Entrar como administrador";
let isSubmitting = false;

function setSubmitting(submitting) {
    isSubmitting = submitting;
    loginButton.disabled = submitting;
    loginButton.setAttribute("aria-busy", String(submitting));
    loginButton.textContent = submitting ? "Autenticando..." : defaultButtonText;
}

function showError(message) {
    loginStatus.textContent = message;
    loginStatus.hidden = false;
    passwordInput.value = "";
    passwordInput.focus();
}

loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSubmitting) {
        return;
    }

    loginStatus.textContent = "";
    loginStatus.hidden = true;
    setSubmitting(true);

    try {
        const response = await fetch("/fake-govbr/login", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                login: loginInput.value.trim(),
                password: passwordInput.value
            })
        });

        if (!response.ok) {
            showError("Login ou senha inválidos.");
            setSubmitting(false);
            return;
        }

        window.location.assign("/auth/dashboard");
    } catch (_error) {
        showError("Não foi possível concluir a autenticação.");
        setSubmitting(false);
    }
});
