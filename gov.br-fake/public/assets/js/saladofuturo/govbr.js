const btn = document.getElementById("continuar");

btn.addEventListener("click", async () => {

    const cpf = document.getElementById("cpf").value.trim();

    if (cpf === "") {
        alert("Digite seu CPF.");
        return;
    }

    // Desabilita o botao durante a requisicao para evitar duplo clique/duplo envio.
    btn.disabled = true;

    try {
        // Endpoint "fake-govbr": simula o login do Gov.br apenas para ambiente
        // de desenvolvimento/teste, sem depender da integracao OAuth real.
        const response = await fetch("/fake-govbr/login", {
            method: "POST",
            credentials: "same-origin",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ cpf })
        });

        if (!response.ok) {
            throw new Error("Falha no login fake.");
        }

        alert("Login realizado com sucesso!");

        // Redireciona para visual.html
        window.location.href = "/visual.html";

    } catch (error) {
        alert(error.message || "Falha no login fake.");
        // Reabilita o botao apenas em caso de erro, permitindo nova tentativa.
        btn.disabled = false;
    }
});