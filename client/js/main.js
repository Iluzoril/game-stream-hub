// Главная страница
document.addEventListener('DOMContentLoaded', function() {
    const hostBtn = document.getElementById('hostBtn');
    const clientBtn = document.getElementById('clientBtn');
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');

    hostBtn.addEventListener('click', () => {
        window.location.href = 'host.html';
    });

    clientBtn.addEventListener('click', () => {
        window.location.href = 'client.html';
    });

    loginBtn.addEventListener('click', () => {
        alert('Функция входа будет реализована в будущем');
    });

    registerBtn.addEventListener('click', () => {
        alert('Функция регистрации будет реализована в будущем');
    });
});