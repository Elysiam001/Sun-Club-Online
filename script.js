// --- UI Logic & Form Switching ---
const loginBox = document.querySelector('.login-box');
const registerBox = document.querySelector('.register-box');
const goRegisterBtn = document.getElementById('go-to-register');
const goLoginBtn = document.getElementById('go-to-login');
const notification = document.getElementById('notification');

function showNotification(msg, isError = false) {
    notification.textContent = msg;
    if (isError) {
        notification.classList.add('error');
    } else {
        notification.classList.remove('error');
    }
    notification.classList.remove('hidden');
    
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 3000);
}

goRegisterBtn.addEventListener('click', (e) => {
    e.preventDefault();
    loginBox.classList.add('hidden');
    setTimeout(() => {
        registerBox.classList.remove('hidden');
    }, 500);
});

goLoginBtn.addEventListener('click', (e) => {
    e.preventDefault();
    registerBox.classList.add('hidden');
    setTimeout(() => {
        loginBox.classList.remove('hidden');
    }, 500);
});

// --- Authentication Logic (Socket.io) ---
const socket = io(); // Kết nối tới Server
const registerForm = document.getElementById('register-form');
const loginForm = document.getElementById('login-form');

// --- Lắng nghe kết quả từ Server ---
socket.on('register_result', (data) => {
    if (data.success) {
        showNotification(data.message);
        registerForm.reset();
        setTimeout(() => {
            goLoginBtn.click();
        }, 1000);
    } else {
        showNotification(data.message, true);
    }
});

socket.on('login_result', (data) => {
    if (data.success) {
        showNotification(`Đăng nhập thành công. Chào mừng ${data.username}!`);
        setTimeout(() => {
            sessionStorage.setItem('casino_currentUser', data.username);
            sessionStorage.setItem('casino_role', 'user');
            window.location.href = 'lobby.html';
        }, 1500);
    } else {
        showNotification(data.message, true);
    }
});

// Đăng ký
registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const username = document.getElementById('reg-username').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;

    if (password !== confirmPassword) {
        showNotification('Mật khẩu xác nhận không khớp.', true);
        return;
    }

    if (username.length < 3 || password.length < 5) {
        showNotification('Tên (>=3) và Mật khẩu (>=5) ký tự.', true);
        return;
    }

    if (username.toLowerCase() === 'admin') {
        showNotification('Không thể đăng ký tên tài khoản này.', true);
        return;
    }

    // Gửi yêu cầu đăng ký lên Server
    socket.emit('register', { username, password });
});

// Đăng nhập
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;

    // Check Admin (Tạm thời để cứng hoặc sếp có thể đổi trên Server)
    if (username === 'admin' && password === 'admin') {
        showNotification(`Đăng nhập quản trị viên thành công. Đang chuyển hướng...`);
        setTimeout(() => {
            sessionStorage.setItem('casino_currentUser', 'admin');
            sessionStorage.setItem('casino_role', 'admin');
            window.location.href = 'admin.html';
        }, 1500);
        return;
    }

    // Gửi yêu cầu kiểm tra đăng nhập lên Server
    socket.emit('login_check', { username, password });
});
