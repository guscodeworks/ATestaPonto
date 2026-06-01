const serverBtn = document.getElementById("serverBtn");
const loginBox = document.querySelector(".login-box");
const greeting = loginBox ? loginBox.querySelector("h1") : null;
const description = loginBox ? loginBox.querySelector("p") : null;
const buttonSpan = serverBtn ? serverBtn.querySelector("span") : null;
const buttonTitle = serverBtn ? serverBtn.querySelector("h2") : null;

let authenticatedUser = null;

async function carregarSessaoFake() {
    try {
        const response = await fetch("/fake-govbr/session", {
            credentials: "same-origin",
            headers: {
                "Accept": "application/json"
            }
        });

        if(!response.ok){
            return null;
        }

        return response.json();
    } catch (_error) {
        return null;
    }
}

function aplicarSessao(session) {
    if(!session || !session.authenticated || !session.user){
        return;
    }

    authenticatedUser = session.user;

    if(greeting){
        greeting.textContent = "Olá, " + (authenticatedUser.name || "Servidor") + "!";
    }

    if(description){
        description.textContent = "Você está logado no gov.br-fake como " + (authenticatedUser.email || "admin local") + ".";
    }

    if(buttonSpan){
        buttonSpan.textContent = "Acessar";
    }

    if(buttonTitle){
        buttonTitle.textContent = "Gerenciar pontos";
    }
}

serverBtn.addEventListener("click", () => {
    if(authenticatedUser){
        window.location.href = "http://localhost:3000/admin/auth/start";
        return;
    }

    window.location.href = "govbr.html";
});

carregarSessaoFake().then(aplicarSessao);
