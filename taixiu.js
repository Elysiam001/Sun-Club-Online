// Authentication & Setup (Socket.io Sync)
const socket = io();
const currentUser = sessionStorage.getItem('casino_currentUser');
if (!currentUser) {
    window.location.href = 'index.html';
}

let serverBalance = 0; // Số dư thực từ Server

// Kết nối và lấy dữ liệu
socket.emit('login', { username: currentUser });

socket.on('loginSuccess', (data) => {
    if (data.username === currentUser) {
        serverBalance = data.balance;
        updateDisplay();
        console.log("Synced Balance from Server:", serverBalance);
    }
});

socket.on('balanceUpdate', (data) => {
    if (data.username === currentUser) {
        serverBalance = data.newBalance;
        updateDisplay();
    }
});

function getBalance() {
    return serverBalance;
}

// Global Variables
let currentPhase = 'betting'; // 'betting', 'rolling', 'revealing'
let timer = 25;

// Betting state
let selectedChipVal = 0;
let pendingBetTai = 0;
let pendingBetXiu = 0;
let confirmedBetTai = 0;
let confirmedBetXiu = 0;
let selectedSide = null;

// --- 3D DICE CONFIG ---
const faceRotations = {
    1: 'rotateX(0deg) rotateY(0deg)',
    2: 'rotateX(0deg) rotateY(-90deg)',
    3: 'rotateX(-90deg) rotateY(0deg)',
    4: 'rotateX(90deg) rotateY(0deg)',
    5: 'rotateX(0deg) rotateY(90deg)',
    6: 'rotateX(0deg) rotateY(180deg)'
};

function getTransform(faceValue) {
    const spinsX = (Math.floor(Math.random() * 4) + 4) * 360; 
    const spinsY = (Math.floor(Math.random() * 4) + 4) * 360;
    let base = faceRotations[faceValue];
    let matchX = base.match(/rotateX\(([-0-9]+)deg\)/);
    let matchY = base.match(/rotateY\(([-0-9]+)deg\)/);
    let finalX = parseInt(matchX[1]) + spinsX;
    let finalY = parseInt(matchY[1]) + spinsY;
    return `rotateX(${finalX}deg) rotateY(${finalY}deg)`;
}

function getFakeStats() {
    let hour = new Date().getHours();
    let baseUsers, basePool;
    if (hour >= 20 || hour <= 1) { // 20h - 01h (Cao điểm)
        baseUsers = 8000; basePool = 20000000000; // Vài chục tỷ
    } else if (hour >= 2 && hour <= 7) { // Đêm sáng
        baseUsers = 500; basePool = 500000000;
    } else { // Ban ngày
        baseUsers = 3000; basePool = 5000000000;
    }
    
    let uT = baseUsers + Math.floor(Math.random() * baseUsers * 0.5);
    let uX = baseUsers + Math.floor(Math.random() * baseUsers * 0.5);
    let pT = basePool + Math.floor(Math.random() * basePool * 0.5);
    let pX = basePool + Math.floor(Math.random() * basePool * 0.5);
    return { uT, uX, pT, pX };
}

let initialStats = getFakeStats();

// Fake Server State
let fakeTotalTai = initialStats.pT;
let fakeTotalXiu = initialStats.pX;
let usersTai = initialStats.uT;
let usersXiu = initialStats.uX;

// DOM Elements (Dùng dom cache bên dưới)
const notification = document.getElementById('notification');

// Roll Result State
let currentResultTotal = 0;
let currentRoundId = 0;
let isRollingAnimation = false;

function loadSavedBets(roundId) {
    let saved = JSON.parse(localStorage.getItem('casino_current_bets')) || {};
    if (saved.roundId === roundId) {
        confirmedBetTai = saved.tai || 0;
        confirmedBetXiu = saved.xiu || 0;
    } else {
        confirmedBetTai = 0;
        confirmedBetXiu = 0;
    }
}

function saveBets() {
    localStorage.setItem('casino_current_bets', JSON.stringify({
        roundId: currentRoundId,
        tai: confirmedBetTai,
        xiu: confirmedBetXiu
    }));
}

function getRoundResult(roundId) {
    let results = JSON.parse(localStorage.getItem('casino_round_results')) || {};
    if (!results[roundId]) {
        results[roundId] = {
            d1: Math.floor(Math.random() * 6) + 1,
            d2: Math.floor(Math.random() * 6) + 1,
            d3: Math.floor(Math.random() * 6) + 1
        };
        localStorage.setItem('casino_round_results', JSON.stringify(results));
    }
    return results[roundId];
}

// DOM Elements Cache (Siêu tốc & Chính xác)
const dom = {
    balance: null,
    pTai: null, pXiu: null, mTai: null, mXiu: null,
    uT: null, uX: null, poolT: null, poolX: null,
    timer: null,
    diceScene: null,
    bowl: null,
    dice1: null, dice2: null, dice3: null,
    centerCircle: null
};

function initDOMCache() {
    dom.balance = document.getElementById('current-balance') || document.getElementById('player-balance');
    dom.pTai = document.getElementById('pending-bet-tai');
    dom.pXiu = document.getElementById('pending-bet-xiu');
    dom.mTai = document.getElementById('my-bet-tai');
    dom.mXiu = document.getElementById('my-bet-xiu');
    dom.uT = document.getElementById('users-tai');
    dom.uX = document.getElementById('users-xiu');
    dom.poolT = document.getElementById('tai-total-pool');
    dom.poolX = document.getElementById('xiu-total-pool');
    dom.timer = document.getElementById('countdown-timer');
    dom.diceScene = document.getElementById('dice-scene');
    dom.bowl = document.getElementById('bowl-cover');
    dom.dice1 = document.getElementById('dice-1');
    dom.dice2 = document.getElementById('dice-2');
    dom.dice3 = document.getElementById('dice-3');
    dom.centerCircle = document.querySelector('.center-circle');
}

// Khởi tạo ngay lập tức
document.addEventListener('DOMContentLoaded', initDOMCache);
initDOMCache();

// Cập nhật hiển thị (Sử dụng dom cache đã khởi tạo)
function updateDisplay() {
    if (dom.balance) dom.balance.textContent = getBalance().toLocaleString('vi-VN');
    if (dom.pTai) dom.pTai.textContent = pendingBetTai.toLocaleString('vi-VN');
    if (dom.pXiu) dom.pXiu.textContent = pendingBetXiu.toLocaleString('vi-VN');
    if (dom.mTai) dom.mTai.textContent = confirmedBetTai.toLocaleString('vi-VN');
    if (dom.mXiu) dom.mXiu.textContent = confirmedBetXiu.toLocaleString('vi-VN');
}

function showNotification(msg, isError = false) {
    notification.textContent = msg;
    notification.className = `notification ${isError ? 'error' : ''}`;
    setTimeout(() => notification.classList.add('hidden'), 3000);
}

// Quay lại sảnh (Sửa lại ID cho đúng với HTML của sếp)
const btnHome = document.getElementById('btn-back');
if (btnHome) {
    btnHome.addEventListener('click', () => {
        if (window !== window.parent) {
            window.parent.postMessage('closeGame', '*');
        } else {
            window.location.href = 'lobby.html';
        }
    });
}

const btnCloseGame = document.getElementById('btn-close-game');
if (btnCloseGame) {
    btnCloseGame.addEventListener('click', () => {
        if (window !== window.parent) {
            window.parent.postMessage('closeGame', '*');
        } else {
            window.location.href = 'lobby.html';
        }
    });
}

// --- LẮP LẠI LOGIC CHỌN CHÍP VÀ ĐẶT CƯỢC ---
document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedChipVal = parseInt(chip.dataset.val); // Đã sửa từ data-value thành data-val
    });
});

document.getElementById('side-tai').addEventListener('click', () => {
    if (currentPhase !== 'betting') return;
    
    // Hiệu ứng chọn bên
    document.getElementById('side-tai').classList.add('selected');
    document.getElementById('side-xiu').classList.remove('selected');

    // Kiểm tra số dư: Tổng cược (Dự kiến + Đã xác nhận) không được quá số dư
    let totalBetting = pendingBetTai + pendingBetXiu + confirmedBetTai + confirmedBetXiu;
    if (totalBetting + selectedChipVal > getBalance()) {
        showNotification("SỐ DƯ KHÔNG ĐỦ!", true);
        return;
    }

    selectedSide = 'tai'; 
    if (selectedChipVal > 0) {
        pendingBetTai += selectedChipVal;
        updateDisplay();
    }
});

document.getElementById('side-xiu').addEventListener('click', () => {
    if (currentPhase !== 'betting') return;

    // Hiệu ứng chọn bên
    document.getElementById('side-xiu').classList.add('selected');
    document.getElementById('side-tai').classList.remove('selected');

    // Kiểm tra số dư
    let totalBetting = pendingBetTai + pendingBetXiu + confirmedBetTai + confirmedBetXiu;
    if (totalBetting + selectedChipVal > getBalance()) {
        showNotification("SỐ DƯ KHÔNG ĐỦ!", true);
        return;
    }

    selectedSide = 'xiu'; 
    if (selectedChipVal > 0) {
        pendingBetXiu += selectedChipVal;
        updateDisplay();
    }
});

document.getElementById('btn-allin').addEventListener('click', () => {
    if (currentPhase !== 'betting') return;
    let balance = getBalance();
    
    // ALL-IN là lấy hết số tiền còn lại sau khi đã trừ đi số tiền đã cược trước đó
    let remaining = balance - (confirmedBetTai + confirmedBetXiu);
    if (remaining <= 0) return;
    
    if (!selectedSide) selectedSide = 'tai';
    
    if (selectedSide === 'tai') {
        pendingBetTai = remaining;
        pendingBetXiu = 0;
    } else {
        pendingBetXiu = remaining;
        pendingBetTai = 0;
    }
    updateDisplay();
});

document.getElementById('btn-cancel').addEventListener('click', () => {
    pendingBetTai = 0;
    pendingBetXiu = 0;
    updateDisplay();
});

// --- Custom Alert Logic ---
window.showCustomAlert = function(message, title = 'THÔNG BÁO') {
    console.log('Showing alert:', title, message);
    const modal = document.getElementById('custom-alert-modal');
    const titleEl = document.getElementById('alert-title');
    const msgEl = document.getElementById('alert-message');
    if (modal && titleEl && msgEl) {
        titleEl.textContent = title;
        msgEl.textContent = message;
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
    }
};

window.closeAlert = function() {
    console.log('Closing alert button clicked');
    const modal = document.getElementById('custom-alert-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
};

// --- Check Admin Notifications ---
function checkTransactionNotifications() {
    let trans = JSON.parse(localStorage.getItem('casino_transactions')) || [];
    let hasNew = false;

    trans.forEach(t => {
        if (t.user === currentUser && (t.status === 'approved' || t.status === 'rejected') && t.notified === false) {
            t.notified = true;
            hasNew = true;
            
            const typeStr = t.type === 'deposit' ? 'NẠP TIỀN' : 'RÚT TIỀN';
            const statusStr = t.status === 'approved' ? 'THÀNH CÔNG' : 'BỊ TỪ CHỐI';
            
            let message = `Giao dịch ${typeStr} số tiền ${t.amount.toLocaleString()} VNĐ đã ${statusStr}.`;
            if (t.status === 'approved') {
                message += `\nChi tiết: ${t.details}`;
            } else {
                message += `\nVui lòng liên hệ hỗ trợ để biết thêm chi tiết.`;
            }
            
            showCustomAlert(message, `THÔNG BÁO GIAO DỊCH`);
        }
    });

    if (hasNew) {
        localStorage.setItem('casino_transactions', JSON.stringify(trans));
        updateDisplay(); // Cập nhật lại số dư trong bàn game
    }
}
setInterval(checkTransactionNotifications, 5000); // Check mỗi 5 giây

// --- SOCKET.IO GAME SYNC ---
// --- SOCKET.IO GAME SYNC ---
socket.emit('taixiuJoin');

let lastPhase = ''; 
let displayStats = { taiUsers: 0, xiuUsers: 0, taiPool: 0, xiuPool: 0 };
let targetStats = { taiUsers: 0, xiuUsers: 0, taiPool: 0, xiuPool: 0 };

// Hàm nhảy số mượt mà (Siêu tốc - Không lag)
function updateSmoothStats() {
    if (currentPhase !== 'betting') return;
    if (!dom.uT) initDOMCache();

    displayStats.taiUsers = Math.ceil(displayStats.taiUsers + (targetStats.taiUsers - displayStats.taiUsers) * 0.15);
    displayStats.xiuUsers = Math.ceil(displayStats.xiuUsers + (targetStats.xiuUsers - displayStats.xiuUsers) * 0.15);
    displayStats.taiPool = Math.ceil(displayStats.taiPool + (targetStats.taiPool - displayStats.taiPool) * 0.15);
    displayStats.xiuPool = Math.ceil(displayStats.xiuPool + (targetStats.xiuPool - displayStats.xiuPool) * 0.15);

    if (dom.uT) dom.uT.innerHTML = `<i class="fa-solid fa-users"></i> ${displayStats.taiUsers.toLocaleString()}`;
    if (dom.uX) dom.uX.innerHTML = `<i class="fa-solid fa-users"></i> ${displayStats.xiuUsers.toLocaleString()}`;
    if (dom.poolT) dom.poolT.textContent = displayStats.taiPool.toLocaleString();
    if (dom.poolX) dom.poolX.textContent = displayStats.xiuPool.toLocaleString();
}
setInterval(updateSmoothStats, 100);

socket.on('taixiuTick', (data) => {
    if (dom.timer) dom.timer.textContent = data.timer;
    
    if (data.fakeTai && data.fakeXiu && data.totalPool) {
        targetStats.taiUsers = data.fakeTai.users + data.totalUsers.tai;
        targetStats.xiuUsers = data.fakeXiu.users + data.totalUsers.xiu;
        targetStats.taiPool = data.fakeTai.pool + data.totalPool.tai;
        targetStats.xiuPool = data.fakeXiu.pool + data.totalPool.xiu;
    }

    if (data.phase !== lastPhase) {
        lastPhase = data.phase;
        if (data.phase === 'betting') {
            currentPhase = 'betting';
            if (dom.diceScene) dom.diceScene.classList.add('hidden');
            if (dom.bowl) dom.bowl.classList.add('hidden');
            
            // Hiện lại đồng hồ cho ván mới
            const centerCircle = document.querySelector('.center-circle');
            if (centerCircle) centerCircle.classList.remove('hidden');

            document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('winner-blink', 'selected', 'confirmed'));
            resetBets();
            displayStats = { taiUsers: 0, xiuUsers: 0, taiPool: 0, xiuPool: 0 };
        } else if (data.phase === 'result') {
            currentPhase = 'result';
            currentResultDices = data.dices;
            currentResultTotal = data.dices[0] + data.dices[1] + data.dices[2];
            
            // QUAN TRỌNG: Phải hiện khung xúc xắc lên trước khi quay
            if (dom.diceScene) dom.diceScene.classList.remove('hidden');
            
            startRealisticRoll(data.dices);
        }
    }
});

// --- CÁC HÀM HỖ TRỢ VÁN ĐẤU ---
function resetBets() {
    pendingBetTai = 0;
    pendingBetXiu = 0;
    confirmedBetTai = 0;
    confirmedBetXiu = 0;
    selectedSide = null;
    document.querySelectorAll('.side-panel').forEach(p => p.classList.remove('selected', 'confirmed', 'winner-blink'));
    updateDisplay();
}

function startOpeningBowl() {
    if (!dom.bowl) initDOMCache();
    // Tự động úp bát để sếp nặn
    if (dom.bowl) {
        dom.bowl.style.transition = 'none';
        dom.bowl.style.transform = 'translate(0px, 0px)';
        dom.bowl.style.opacity = '1';
        dom.bowl.classList.remove('hidden');
    }
    
    // Hiện xúc xắc ở dưới bát
    if (dom.diceScene) dom.diceScene.classList.remove('hidden');
    if (dom.dice1) dom.dice1.style.transform = getTransform(currentResultDices[0]);
    if (dom.dice2) dom.dice2.style.transform = getTransform(currentResultDices[1]);
    if (dom.dice3) dom.dice3.style.transform = getTransform(currentResultDices[2]);
}

// --- LOGIC KÊNH CHAT ---
function toggleChat() {
    const chat = document.getElementById('chat-container');
    if (!chat) return;
    chat.classList.toggle('active');
    
    if (chat.classList.contains('active')) {
        const msgArea = document.getElementById('chat-messages');
        if (msgArea) msgArea.scrollTop = msgArea.scrollHeight;
    }
}

function addChatMessage(username, message, isSystem = false) {
    const msgArea = document.getElementById('chat-messages');
    if (!msgArea) return;
    
    const html = isSystem 
        ? `<div class="chat-item system">${message}</div>`
        : `<div class="chat-item"><span class="username">${username}:</span> ${message}</div>`;
    
    msgArea.insertAdjacentHTML('beforeend', html);
    msgArea.scrollTop = msgArea.scrollHeight;
    
    if (msgArea.children.length > 30) msgArea.removeChild(msgArea.firstChild);
}

const btnSendChat = document.getElementById('btn-send-chat');
if (btnSendChat) btnSendChat.addEventListener('click', sendMyChat);

const chatInput = document.getElementById('chat-input');
if (chatInput) {
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMyChat();
    });
}

function sendMyChat() {
    const input = document.getElementById('chat-input');
    if (!input) return;
    const msg = input.value.trim();
    if (msg) {
        addChatMessage(currentUser || 'Khách', msg);
        input.value = '';
    }
}

// --- HỆ THỐNG CHIM MỒI (FAKE CHAT) SIÊU CẤP ---
function generateRandomName() {
    const prefixes = ['anh', 'boy', 'ga', 'trum', 'thanh', 'be', 'cong_tu', 'hiep_si', 'sat_thu', 'dai_gia', 'dan_choi', 'co_nang'];
    const names = ['tuan', 'hung', 'linh', 'lan', 'duong', 'vinh', 'nam', 'phong', 'thuy', 'mai', 'kien', 'hoang', 'dung', 'thanh', 'huyen'];
    const suffixes = ['_9x', '_2k', '_pro', '_vip', '_hanoi', '_baby', '_cute', '_bua', '_hack', '_vobo', '_88', '_99', 'dz', 'kkk'];
    const p = prefixes[Math.floor(Math.random() * prefixes.length)];
    const n = names[Math.floor(Math.random() * names.length)];
    const s = suffixes[Math.floor(Math.random() * suffixes.length)];
    const r = Math.floor(Math.random() * 99);
    const type = Math.floor(Math.random() * 3);
    if (type === 0) return (n + s + r).toLowerCase();
    if (type === 1) return (p + '_' + n).toLowerCase();
    return (n + r + s).toLowerCase();
}

const fakeMessages = [
    'Tay này Xỉu đẹp anh em ơi!', 'Tài đi, nãy giờ bệt Xỉu rồi.', 'Húp mạnh thôi!', 'Vừa tất tay Tài 100M, run quá.',
    'Cầu này khó đoán quá.', 'Mới húp 50M, rủ anh em đi nhậu.', 'Cho em xin lộc với ạ!', 'Xỉu chắc rồi, đừng cãi.',
    'ĐM lại ra Tài, ảo thật đấy!', 'Nhận kéo 1-1 về bờ, ai quan tâm inbox.', 'Cầu bệt Xỉu rồi, đừng bẻ anh em ơi.',
    'Sếp ơi cho em xin ít lộc!', 'Thằng kia biết cái gì mà nói, Tài chắc luôn.', 'Hết tiền rồi, ai cho vay ít không?',
    'Cầu này soi chuẩn 99%, Xỉu đi.', 'Nổ hũ đi nào!', 'Lại gãy rồi, đen quá.', 'Admin ơi xem lại cầu này cái.',
    'Húp Xỉu 20M ngon lành!', 'Anh em theo tôi, ván này về Tài.', 'Đừng nghe nó, nó kéo lừa đấy.', 'Xin lộc sếp ơi!'
];

function initFakeChatHistory() {
    for (let i = 0; i < 20; i++) {
        const name = generateRandomName();
        const msg = fakeMessages[Math.floor(Math.random() * fakeMessages.length)];
        addChatMessage(name, msg);
    }
}

function startFakeChat() {
    const delay = Math.floor(Math.random() * 2000) + 1000;
    setTimeout(() => {
        const name = generateRandomName();
        const msg = fakeMessages[Math.floor(Math.random() * fakeMessages.length)];
        addChatMessage(name, msg);
        startFakeChat();
    }, delay);
}

initFakeChatHistory();
startFakeChat();

socket.on('taixiuReset', () => {
    resetBets();
});

socket.on('taixiuBetSuccess', ({ side, amount }) => {
    if (side === 'tai') {
        confirmedBetTai += amount;
        const p = document.getElementById('side-tai');
        if (p) p.classList.add('confirmed');
    } else {
        confirmedBetXiu += amount;
        const p = document.getElementById('side-xiu');
        if (p) p.classList.add('confirmed');
    }
    
    pendingBetTai = 0;
    pendingBetXiu = 0;
    updateDisplay();
    showNotification(`ĐẶT CƯỢC THÀNH CÔNG: ${amount.toLocaleString()} VNĐ`);
});

socket.on('taixiuWin', ({ username, winAmount }) => {
    if (username === currentUser) {
        showNotification(`THẮNG LỚN: ${winAmount.toLocaleString()} VNĐ!`);
        createGoldExplosion();
    }
});

function createGoldExplosion() {
    // Hiệu ứng thắng cược đơn giản nhưng sang trọng
    const explosion = document.createElement('div');
    explosion.style.position = 'fixed';
    explosion.style.top = '50%';
    explosion.style.left = '50%';
    explosion.style.transform = 'translate(-50%, -50%)';
    explosion.style.width = '100vw';
    explosion.style.height = '100vh';
    explosion.style.background = 'radial-gradient(circle, rgba(255,215,0,0.4) 0%, rgba(0,0,0,0) 70%)';
    explosion.style.pointerEvents = 'none';
    explosion.style.zIndex = '9999';
    explosion.style.animation = 'gold-flash 1s ease-out forwards';
    document.body.appendChild(explosion);
    setTimeout(() => explosion.remove(), 1000);
}

// --- LOGIC KÉO MỞ BÁT ---
let isDragging = false;
let startX = 0, startY = 0;
let currentX = 0, currentY = 0;

function handleDragStart(e) {
    if (currentPhase !== 'revealing') return;
    isDragging = true;
    let clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startX = clientX - currentX;
    startY = clientY - currentY;
    if (dom.bowl) dom.bowl.style.transition = 'none';
}

function handleDragMove(e) {
    if (!isDragging || currentPhase !== 'revealing') return;
    e.preventDefault();
    let clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let clientY = e.touches ? e.touches[0].clientY : e.clientY;
    currentX = clientX - startX;
    currentY = clientY - startY;
    if (dom.bowl) dom.bowl.style.transform = `translate(${currentX}px, ${currentY}px)`;
}

function handleDragEnd() {
    if (!isDragging || currentPhase !== 'revealing') return;
    isDragging = false;
    let distance = Math.sqrt(currentX * currentX + currentY * currentY);
    if (distance > 100) {
        finalizeResult();
    } else {
        if (dom.bowl) {
            dom.bowl.style.transition = 'transform 0.3s ease';
            currentX = 0; currentY = 0;
            dom.bowl.style.transform = `translate(0px, 0px)`;
        }
    }
}

// Gán sự kiện mở bát vào dom cache
if (!dom.bowl) initDOMCache();
if (dom.bowl) {
    dom.bowl.addEventListener('mousedown', handleDragStart);
    dom.bowl.addEventListener('touchstart', handleDragStart);
}
document.addEventListener('mousemove', handleDragMove);
document.addEventListener('mouseup', handleDragEnd);
document.addEventListener('touchmove', handleDragMove, {passive: false});
document.addEventListener('touchend', handleDragEnd);

// Chỉnh sửa finalizeResult để an toàn 100%
function finalizeResult() {
    if (currentPhase === 'resolving') return;
    currentPhase = 'resolving';
    
    if (dom.bowl) {
        dom.bowl.style.transition = 'transform 0.5s ease, opacity 0.5s ease';
        dom.bowl.style.transform = `translate(0px, -200px)`;
        dom.bowl.style.opacity = '0';
    }
    
    let isTai = currentResultTotal >= 11;
    let isXiu = currentResultTotal <= 10;
    
    // Hiệu ứng Tiền nhảy
    if (confirmedBetTai > 0) {
        showFloatingResult('tai', confirmedBetTai, isTai);
    }
    if (confirmedBetXiu > 0) {
        showFloatingResult('xiu', confirmedBetXiu, isXiu);
    }

    setTimeout(() => {
        if (dom.bowl) dom.bowl.classList.add('hidden');
        
        if (isTai) {
            const p = document.getElementById('side-tai');
            if (p) p.classList.add('winner-blink');
        }
        if (isXiu) {
            const p = document.getElementById('side-xiu');
            if (p) p.classList.add('winner-blink');
        }
    }, 500);
}

// Chỉnh sửa Đặt cược để gửi lên Server
document.getElementById('btn-confirm').addEventListener('click', () => {
    if (currentPhase !== 'betting') return;
    
    if (pendingBetTai > 0) {
        socket.emit('taixiuBet', { username: currentUser, side: 'tai', amount: pendingBetTai });
    }
    if (pendingBetXiu > 0) {
        socket.emit('taixiuBet', { username: currentUser, side: 'xiu', amount: pendingBetXiu });
    }
    updateDisplay();
});

// ==========================================
// THỐNG KÊ SOI CẦU (CANVAS)
// ==========================================
const modalSoiCau = document.getElementById('modal-soicau');
const btnSoiCau = document.getElementById('btn-soicau');
const btnCloseSoiCau = document.getElementById('btn-close-soicau');

function initHistoryData() {
    let history = JSON.parse(localStorage.getItem('casino_history')) || [];
    if (history.length === 0) {
        for(let i=0; i<20; i++) {
            let d1 = Math.floor(Math.random()*6)+1;
            let d2 = Math.floor(Math.random()*6)+1;
            let d3 = Math.floor(Math.random()*6)+1;
            let total = d1+d2+d3;
            history.push({id: i, d1, d2, d3, total, isTai: total>=11});
        }
        localStorage.setItem('casino_history', JSON.stringify(history));
    }
}
initHistoryData();

function updateHistoryDots() {
    let history = JSON.parse(localStorage.getItem('casino_history')) || [];
    let container = document.getElementById('history-dots-container');
    if (!container) return;
    
    container.innerHTML = '';
    let recent = history.slice(-15);
    recent.forEach(pt => {
        let dot = document.createElement('div');
        dot.className = pt.isTai ? 'dot-tai' : 'dot-xiu';
        container.appendChild(dot);
    });
}
updateHistoryDots();

btnSoiCau.addEventListener('click', () => {
    modalSoiCau.style.display = 'flex';
    modalSoiCau.classList.remove('hidden');
    drawSoiCau();
});

btnCloseSoiCau.addEventListener('click', () => {
    modalSoiCau.style.display = 'none';
    modalSoiCau.classList.add('hidden');
});

function drawSoiCau() {
    let history = JSON.parse(localStorage.getItem('casino_history')) || [];

    const cTong = document.getElementById('canvas-tong');
    const ctxTong = cTong.getContext('2d');
    const cXX = document.getElementById('canvas-xucxac');
    const ctxXX = cXX.getContext('2d');
    
    let w = cTong.width, hTong = cTong.height, hXX = cXX.height;
    let cols = 20;
    let colW = w / cols;
    
    // Xoá nền
    ctxTong.clearRect(0,0,w,hTong);
    ctxXX.clearRect(0,0,w,hXX);
    
    // Hàm vẽ Lưới
    function drawGrid(ctx, h, rows) {
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        let rowH = h / rows;
        ctx.beginPath();
        for(let i=0; i<=cols; i++) { ctx.moveTo(i*colW, 0); ctx.lineTo(i*colW, h); }
        for(let j=0; j<=rows; j++) { ctx.moveTo(0, j*rowH); ctx.lineTo(w, j*rowH); }
        ctx.stroke();
    }
    
    drawGrid(ctxTong, hTong, 15); // 3-18 (15 ô)
    drawGrid(ctxXX, hXX, 5); // 1-6 (5 ô)

    // Vẽ biểu đồ Tổng
    let rowHTong = hTong / 15;
    ctxTong.beginPath();
    ctxTong.strokeStyle = '#00ff00';
    ctxTong.lineWidth = 2;
    for(let i=0; i<history.length; i++) {
        let pt = history[i];
        let x = i*colW + colW/2;
        let y = hTong - ((pt.total - 3) * rowHTong) - rowHTong/2;
        if(i===0) ctxTong.moveTo(x,y);
        else ctxTong.lineTo(x,y);
    }
    ctxTong.stroke();
    
    // Vẽ điểm tròn Tổng
    ctxTong.font = "bold 10px Arial";
    ctxTong.textAlign = "center";
    ctxTong.textBaseline = "middle";
    for(let i=0; i<history.length; i++) {
        let pt = history[i];
        let x = i*colW + colW/2;
        let y = hTong - ((pt.total - 3) * rowHTong) - rowHTong/2;
        
        ctxTong.beginPath();
        ctxTong.arc(x, y, 10, 0, 2*Math.PI);
        ctxTong.fillStyle = pt.isTai ? '#000' : '#fff';
        ctxTong.fill();
        ctxTong.strokeStyle = pt.isTai ? '#ff0000' : '#ff0000';
        ctxTong.lineWidth = 2;
        ctxTong.stroke();
        
        ctxTong.fillStyle = pt.isTai ? '#fff' : '#ff0000';
        ctxTong.fillText(pt.total, x, y);
    }

    // Vẽ biểu đồ Xúc xắc (3 đường)
    let rowHXX = hXX / 5;
    let colors = ['#ffff00', '#00ffff', '#ff00ff']; // Vàng, Xanh lam, Hồng
    
    for(let diceIdx = 1; diceIdx <= 3; diceIdx++) {
        ctxXX.beginPath();
        ctxXX.strokeStyle = colors[diceIdx-1];
        ctxXX.lineWidth = 1.5;
        for(let i=0; i<history.length; i++) {
            let val = history[i][`d${diceIdx}`];
            let x = i*colW + colW/2;
            let y = hXX - ((val - 1) * rowHXX);
            if(i===0) ctxXX.moveTo(x,y);
            else ctxXX.lineTo(x,y);
        }
        ctxXX.stroke();
        
        // Vẽ điểm
        for(let i=0; i<history.length; i++) {
            let val = history[i][`d${diceIdx}`];
            let x = i*colW + colW/2;
            let y = hXX - ((val - 1) * rowHXX);
            ctxXX.beginPath();
            ctxXX.arc(x, y, 4, 0, 2*Math.PI);
            ctxXX.fillStyle = colors[diceIdx-1];
            ctxXX.fill();
        }
    }
}

// ==========================================
// BẢNG XẾP HẠNG THẮNG LỚN
// ==========================================
const modalBxh = document.getElementById('modal-bxh');
const btnBxh = document.getElementById('btn-bxh');
const btnCloseBxh = document.getElementById('btn-close-bxh');

btnBxh.addEventListener('click', () => {
    modalBxh.style.display = 'flex';
    modalBxh.classList.remove('hidden');
    showLeaderboard();
});

btnCloseBxh.addEventListener('click', () => {
    modalBxh.style.display = 'none';
    modalBxh.classList.add('hidden');
});

function showLeaderboard() {
    socket.emit('getLeaderboard');
}

socket.on('leaderboardData', (data) => {
    let container = document.getElementById('rank-list-container');
    if (!container) return;
    
    container.innerHTML = ''; // Xóa danh sách cũ
    
    data.forEach((r, idx) => {
        let div = document.createElement('div');
        div.className = `rank-item rank-${idx+1}`;
        
        let icon = `#${idx+1}`;
        if(idx === 0) icon = '<i class="fa-solid fa-trophy" style="color:#ffd700"></i>';
        if(idx === 1) icon = '<i class="fa-solid fa-medal" style="color:#c0c0c0"></i>';
        if(idx === 2) icon = '<i class="fa-solid fa-award" style="color:#cd7f32"></i>';
        
        let isMe = r.name.includes('***') === false && r.name === currentUser; // Logic kiểm tra (tạm thời)
        let displayName = r.name;
        
        div.innerHTML = `
            <div class="rank-pos">${icon}</div>
            <div class="rank-name ${isMe ? 'gold-text font-bold' : ''}">${displayName}</div>
            <div class="rank-money">${r.money.toLocaleString('vi-VN')}</div>
        `;
        container.appendChild(div);
    });
});
