const continueButton = document.getElementById("continueButton");

if (continueButton) {
    let hasRedirected = false;
    let redirectTimeout;

    function continueToPontoEscolar() {
        if (hasRedirected) {
            return;
        }

        hasRedirected = true;
        clearTimeout(redirectTimeout);
        window.location.assign("/auth/continue");
    }

    continueButton.addEventListener("click", continueToPontoEscolar);
    redirectTimeout = window.setTimeout(continueToPontoEscolar, 1500);
}
