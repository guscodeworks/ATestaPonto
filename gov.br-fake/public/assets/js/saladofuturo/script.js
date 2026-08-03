const serverBtn = document.getElementById("serverBtn");
const loginBox = document.querySelector(".login-box");
const greeting = loginBox ? loginBox.querySelector("h2") : null;
const description = loginBox ? loginBox.querySelector("p:not(.panel-label)") : null;
const buttonSpan = serverBtn ? serverBtn.querySelector("span") : null;
const buttonTitle = serverBtn ? serverBtn.querySelector("h3") : null;

let authenticatedUser = null;

// Consulta a sessao do simulador (ambiente de dev/teste), sem lancar erro
// visivel ao usuario caso a chamada falhe — a pagina simplesmente permanece
// no estado "nao autenticado".
async function carregarSessaoFake() {
    try {
        const response = await fetch("/fake-govbr/session", {
            credentials: "same-origin",
            headers: {
                "Accept": "application/json"
            }
        });

        if (!response.ok) {
            return null;
        }

        return await response.json();
    } catch (_error) {
        return null;
    }
}

// Atualiza a tela (saudacao, descricao e texto do botao) para refletir que o
// usuario ja esta autenticado, sem recarregar a pagina.
function aplicarSessao(session) {
    if (!session || !session.authenticated || !session.user) {
        return;
    }

    authenticatedUser = session.user;

    if (greeting) {
        greeting.textContent = "A simulação já está autenticada";
    }

    if (description) {
        description.textContent = "Continue com a identidade fictícia ativa ou encerre a sessão para escolher outra.";
    }

    if (buttonSpan) {
        buttonSpan.textContent = "Acessar";
    }

    if (buttonTitle) {
        buttonTitle.textContent = "Continuar demonstração";
    }
}

serverBtn?.addEventListener("click", () => {
    if (authenticatedUser) {
        // Redireciona para o dashboard após login
        window.location.href = "/visual.html";
        return;
    }

    // Redireciona para a escolha de identidade fictícia.
    window.location.href = "/govbr.html";
});

carregarSessaoFake().then(aplicarSessao);
