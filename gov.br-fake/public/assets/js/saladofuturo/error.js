document.addEventListener("DOMContentLoaded", () => {
    const backButton = document.querySelector(".back-button");

    if (backButton) {
        backButton.addEventListener("click", (event) => {
            event.preventDefault();

            // Altere a rota abaixo para a página inicial do seu projeto
            window.location.href = "../index.html";
        });
    }
});