// Ponto de entrada: com sessão vai para o painel, sem sessão vai para o login
(function () {
    var destino = '/assets/pages/login.html';
    try { if (localStorage.getItem('ns_token')) destino = '/assets/pages/dashboard.html'; } catch (e) {}
    location.replace(destino);
})();
