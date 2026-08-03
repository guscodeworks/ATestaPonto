const loginForm = document.getElementById("demoLoginForm");
const loginInput = document.getElementById("login");
const passwordInput = document.getElementById("password");
const loginButton = document.getElementById("loginButton");
const loginStatus = document.getElementById("loginStatus");

function setSubmitting(isSubmitting) {
    loginButton.disabled = isSubmitting;
    loginButton.setAttribute("aria-busy", String(isSubmitting));
    loginButton.querySelector("span").textContent = isSubmitting
        ? "Verificando credenciais…"
        : "Entrar no ambiente demonstrativo";
}

function showInvalidCredentials() {
    loginStatus.textContent = "Credenciais demonstrativas inválidas.";
    passwordInput.value = "";
    passwordInput.focus();
}

loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    loginStatus.textContent = "";
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
            showInvalidCredentials();
            return;
        }

        const result = await response.json();
        if (!result || typeof result.redirectTo !== "string" || !result.redirectTo.startsWith("/")) {
            throw new Error("Resposta de login inválida.");
        }

        window.location.assign(result.redirectTo);
    } catch (_error) {
        loginStatus.textContent = "Não foi possível concluir o login demonstrativo.";
    } finally {
        setSubmitting(false);
    }
});
