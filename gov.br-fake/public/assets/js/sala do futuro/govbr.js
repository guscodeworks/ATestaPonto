const btn = document.getElementById("continuar");

btn.addEventListener("click", () => {

    const cpf = document.getElementById("cpf").value.trim();

    if(cpf === ""){
        alert("Digite seu CPF.");
        return;
    }

    alert("Login realizado com sucesso!");

    // Redirecionar para dashboard futuramente
    // window.location.href = "dashboard.html";
});