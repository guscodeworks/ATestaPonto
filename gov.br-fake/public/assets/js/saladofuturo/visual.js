const gerenciarCard = document.getElementById("gerenciarCard");

function continueToPontoEscolar() {
    window.location.href = "/views/admin/dashboard.html";
}

gerenciarCard?.addEventListener("click", continueToPontoEscolar);
gerenciarCard?.addEventListener("keydown", (event) => {
    if (event.target === gerenciarCard && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        continueToPontoEscolar();
    }
});
