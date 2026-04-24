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

// DOM Elements
const timerDisplay = document.getElementById('countdown-timer');
const diceScene = document.getElementById('dice-scene');
const dice1 = document.getElementById('dice-1');
const dice2 = document.getElementById('dice-2');
const dice3 = document.getElementById('dice-3');
const notification = document.getElementById('notification');
const bowl = document.getElementById('bowl-cover');

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

function updateDisplay() {
    document.getElementById('current-balance').textContent = getBalance().toLocaleString('vi-VN');
    document.getElementById('pending-bet-tai').textContent = pendingBetTai.toLocaleString('vi-VN');
    document.getElementById('pending-bet-xiu').textContent = pendingBetXiu.toLocaleString('vi-VN');
    document.getElementById('my-bet-tai').textContent = confirmedBetTai.toLocaleString('vi-VN');
    document.getElementById('my-bet-xiu').textContent = confirmedBetXiu.toLocaleString('vi-VN');
}
updateDisplay();

function showNotification(msg, isError = false) {
    notification.textContent = msg;
    notification.className = `notification ${isError ? 'error' : ''}`;
    setTimeout(() => notification.classList.add('hidden'), 3000);
}

// Navigation
document.getElementById('btn-back').addEventListener('click', () => { window.location.href = 'lobby.html'; });
document.getElementById('btn-close-game').addEventListener('click', () => { window.location.href = 'lobby.html'; });

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

// Game Loop: Real-time Sync (Chu kỳ 37 giây: 25s cược, 12s mở bát/chờ)
const ROUND_DURATION = 37000;
const BET_DURATION = 25000;

function gameTick() {
    let now = Date.now();
    let roundId = Math.floor(now / ROUND_DURATION);
    let offset = now % ROUND_DURATION;
    
    document.getElementById('round-id-display').textContent = `#${roundId}`;
    
    // Nếu chuyển sang ván mới
    if (currentRoundId !== roundId) {
        currentRoundId = roundId;
        loadSavedBets(roundId);
        resetGameUI();
    }

    if (offset < BET_DURATION) {
        // Giai đoạn đặt cược
        if (currentPhase !== 'betting') {
            currentPhase = 'betting';
            timerDisplay.classList.remove('hidden');
            diceScene.classList.add('hidden');
            bowl.classList.add('hidden');
            updateDisplay(); // Update lại cược nếu vừa vào lại
        }
        
        let secondsLeft = Math.ceil((BET_DURATION - offset) / 1000);
        timerDisplay.textContent = secondsLeft;
        
        // Nhảy tiền ảo
        fakeTotalTai += Math.floor(Math.random() * (fakeTotalTai * 0.01));
        fakeTotalXiu += Math.floor(Math.random() * (fakeTotalXiu * 0.01));
        document.getElementById('tai-total-pool').textContent = fakeTotalTai.toLocaleString('vi-VN');
        document.getElementById('xiu-total-pool').textContent = fakeTotalXiu.toLocaleString('vi-VN');
        
        if (Math.random() > 0.5) usersTai += Math.floor(Math.random() * 5);
        if (Math.random() > 0.5) usersXiu += Math.floor(Math.random() * 5);
        document.getElementById('users-tai').innerHTML = `<i class="fa-solid fa-users"></i> ${usersTai.toLocaleString('vi-VN')}`;
        document.getElementById('users-xiu').innerHTML = `<i class="fa-solid fa-users"></i> ${usersXiu.toLocaleString('vi-VN')}`;

    } else {
        // Giai đoạn tung xúc xắc và nặn
        if (currentPhase === 'betting') {
            currentPhase = 'rolling';
            timerDisplay.classList.add('hidden');
            diceScene.classList.remove('hidden');
            startRealisticRoll(roundId);
        } else if (currentPhase === 'rolling' && !isRollingAnimation) {
            // Nếu người dùng vừa load trang vào lúc xúc xắc đã tung xong (offset > 27.5s)
            if (offset > 27500) {
                // Nhảy thẳng vào bát nặn
                let res = getRoundResult(roundId);
                forceDiceResult(res.d1, res.d2, res.d3);
                currentResultTotal = res.d1 + res.d2 + res.d3;
                
                currentPhase = 'revealing';
                diceScene.classList.remove('hidden');
                bowl.style.transform = 'translate(0px, 0px)';
                bowl.style.opacity = '1';
                bowl.classList.remove('hidden');
            }
        }
        
        // Auto mở bát ở giây thứ 32
        if (currentPhase === 'revealing' && offset > 32000) {
            finalizeResult();
        }
    }
}

// Chạy luôn tick đầu tiên để không bị lag "25s" ở UI
gameTick();
setInterval(gameTick, 200);

// --- 3D DICE LOGIC ---
const faceRotations = {
    1: 'rotateX(0deg) rotateY(0deg)',        // Front
    2: 'rotateX(0deg) rotateY(-90deg)',      // Right
    3: 'rotateX(-90deg) rotateY(0deg)',      // Top
    4: 'rotateX(90deg) rotateY(0deg)',       // Bottom
    5: 'rotateX(0deg) rotateY(90deg)',       // Left
    6: 'rotateX(0deg) rotateY(180deg)'       // Back
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

function forceDiceResult(d1, d2, d3) {
    dice1.style.transition = 'none'; dice2.style.transition = 'none'; dice3.style.transition = 'none';
    dice1.style.transform = faceRotations[d1];
    dice2.style.transform = faceRotations[d2];
    dice3.style.transform = faceRotations[d3];
}

function startRealisticRoll(roundId) {
    isRollingAnimation = true;
    let res = getRoundResult(roundId);
    currentResultTotal = res.d1 + res.d2 + res.d3;

    dice1.style.transition = 'none'; dice2.style.transition = 'none'; dice3.style.transition = 'none';
    dice1.style.transform = 'rotateX(0deg) rotateY(0deg)';
    dice2.style.transform = 'rotateX(0deg) rotateY(0deg)';
    dice3.style.transform = 'rotateX(0deg) rotateY(0deg)';

    setTimeout(() => {
        dice1.style.transition = 'transform 1.5s cubic-bezier(0.1, 0.8, 0.2, 1)';
        dice2.style.transition = 'transform 1.8s cubic-bezier(0.1, 0.8, 0.2, 1)';
        dice3.style.transition = 'transform 2.1s cubic-bezier(0.1, 0.8, 0.2, 1)';
        
        dice1.style.transform = getTransform(res.d1);
        dice2.style.transform = getTransform(res.d2);
        dice3.style.transform = getTransform(res.d3);
    }, 50);
    
    // Ở giây thứ 1.1 (Khi xúc xắc VẪN ĐANG QUAY cực mạnh), cho bát rớt xuống che lại luôn
    setTimeout(() => {
        bowl.style.transition = 'none';
        bowl.style.transform = 'translate(0px, -400px)'; // Bát từ trên trời
        bowl.style.opacity = '1';
        bowl.classList.remove('hidden');
        
        // Giáng bát xuống
        setTimeout(() => {
            bowl.style.transition = 'transform 0.2s cubic-bezier(0.5, 0, 1, 1)';
            bowl.style.transform = 'translate(0px, 0px)';
        }, 50);
    }, 1100);

    // Chờ xúc xắc dừng hẳn bên trong bát (2.5s)
    setTimeout(() => {
        isRollingAnimation = false;
        if (currentPhase === 'rolling') {
            currentPhase = 'revealing';
        }
    }, 2500);
}

// --- DRAG LOGIC (BÁT NẶN) ---
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
    bowl.style.transition = 'none'; // Bỏ transition để kéo mượt
}

function handleDragMove(e) {
    if (!isDragging || currentPhase !== 'revealing') return;
    e.preventDefault(); // Tránh cuộn trang trên mobile
    
    let clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    currentX = clientX - startX;
    currentY = clientY - startY;
    
    bowl.style.transform = `translate(${currentX}px, ${currentY}px)`;
    
    // Cho phép nặn tự do mọi hướng, không tự động mở khi đang giữ chuột/tay
    // Chỉ tự mở bát nếu hết thời gian (offset > 35000)
}

function handleDragEnd() {
    if (!isDragging || currentPhase !== 'revealing') return;
    isDragging = false;
    
    // Khi thả tay/chuột ra, nếu kéo xa bát khỏi trung tâm (>150px) thì mới mở
    let distance = Math.sqrt(currentX * currentX + currentY * currentY);
    if (distance > 150) {
        finalizeResult();
    } else {
        // Nếu chưa kéo đủ xa mà buông ra thì rớt bát về giữa để nặn tiếp
        bowl.style.transition = 'transform 0.3s ease';
        currentX = 0; currentY = 0;
        bowl.style.transform = `translate(0px, 0px)`;
    }
}

bowl.addEventListener('mousedown', handleDragStart);
document.addEventListener('mousemove', handleDragMove);
document.addEventListener('mouseup', handleDragEnd);

bowl.addEventListener('touchstart', handleDragStart);
document.addEventListener('touchmove', handleDragMove, {passive: false});
document.addEventListener('touchend', handleDragEnd);


// --- RESULT LOGIC ---
function finalizeResult() {
    if (currentPhase === 'resolving') return; // Tránh gọi 2 lần
    currentPhase = 'resolving';
    
    // Kiểm tra xem ván này đã trả thưởng chưa (tránh F5 nhận 2 lần)
    let paidRounds = JSON.parse(localStorage.getItem('casino_paid_rounds')) || {};
    if (paidRounds[currentRoundId]) {
        return; // Đã trả rồi thì bỏ qua
    }
    
    // Mở bát mượt mà bay ra khỏi màn hình
    bowl.style.transition = 'transform 0.5s ease, opacity 0.5s ease';
    bowl.style.transform = `translate(0px, -200px)`;
    bowl.style.opacity = '0';
    
    setTimeout(() => {
        bowl.classList.add('hidden');
        
        // Tính tiền
        let winAmount = 0;
        let isTai = currentResultTotal >= 11 && currentResultTotal <= 18;
        let isXiu = currentResultTotal >= 4 && currentResultTotal <= 10;
        let resultLabel = isTai ? 'TÀI' : (isXiu ? 'XỈU' : 'BÃO (1-1-1)');
        let resultStr = `${currentResultTotal} ĐIỂM - ${resultLabel}`;
        
        // Hiệu ứng chớp sáng bên thắng
        if (isTai) document.getElementById('side-tai').classList.add('winner-blink');
        if (isXiu) document.getElementById('side-xiu').classList.add('winner-blink');
        
        if (confirmedBetTai > 0 && isTai) winAmount = confirmedBetTai * 2;
        if (confirmedBetXiu > 0 && isXiu) winAmount = confirmedBetXiu * 2;

        if (winAmount > 0) {
            serverBalance += winAmount;
            socket.emit('updateBalance', { username: currentUser, newBalance: serverBalance });
            showNotification(`THẮNG LỚN: ${winAmount.toLocaleString('vi-VN')} VNĐ!`);
            createGoldExplosion(); // Nổ vàng
        } else if (confirmedBetTai > 0 || confirmedBetXiu > 0) {
            showNotification(`RẤT TIẾC BẠN ĐÃ THUA.`, true);
        } else {
            // Nếu không cược thì hiện thông báo nhỏ
            showNotification(`KẾT QUẢ: ${resultStr}`);
        }
        
        // Đánh dấu đã trả thưởng vòng này để không trả lại nếu F5
        let paidRounds = JSON.parse(localStorage.getItem('casino_paid_rounds')) || {};
        paidRounds[currentRoundId] = true;
        localStorage.setItem('casino_paid_rounds', JSON.stringify(paidRounds));
        
        // --- Lưu Lịch Sử Soi Cầu ---
        let history = JSON.parse(localStorage.getItem('casino_history')) || [];
        let res = getRoundResult(currentRoundId);
        history.push({
            id: currentRoundId,
            d1: res.d1, d2: res.d2, d3: res.d3,
            total: currentResultTotal,
            isTai: isTai
        });
        if (history.length > 20) history.shift(); // Chỉ lưu 20 ván gần nhất
        localStorage.setItem('casino_history', JSON.stringify(history));
        
        // Vẽ lại biểu đồ nếu đang mở
        if (!document.getElementById('modal-soicau').classList.contains('hidden')) {
            drawSoiCau();
        }
        updateHistoryDots(); // Cập nhật hàng bóng soi cầu trên bàn
        
        // Xoá cược đã lưu
        confirmedBetTai = 0;
        confirmedBetXiu = 0;
        saveBets();
        
        updateDisplay();
    }, 500);
}

// Hiệu ứng nổ vàng
function createGoldExplosion() {
    for (let i = 0; i < 60; i++) {
        let coin = document.createElement('div');
        coin.className = 'gold-coin';
        
        let angle = Math.random() * Math.PI * 2;
        let distance = 100 + Math.random() * 400; // Bay xa từ 100 đến 500px
        let tx = Math.cos(angle) * distance + 'px';
        let ty = Math.sin(angle) * distance + 'px';
        
        coin.style.setProperty('--tx', tx);
        coin.style.setProperty('--ty', ty);
        coin.style.animationDuration = (0.8 + Math.random() * 0.7) + 's';
        
        document.body.appendChild(coin);
        
        setTimeout(() => coin.remove(), 1500);
    }
}

function resetGameUI() {
    currentPhase = 'betting';
    
    pendingBetTai = 0; pendingBetXiu = 0;
    selectedSide = null;
    
    document.getElementById('side-tai').classList.remove('selected');
    document.getElementById('side-xiu').classList.remove('selected');
    
    // Tắt chớp sáng
    document.getElementById('side-tai').classList.remove('winner-blink');
    document.getElementById('side-xiu').classList.remove('winner-blink');
    
    updateDisplay();
    
    timerDisplay.classList.remove('hidden');
    diceScene.classList.add('hidden');
    bowl.classList.add('hidden');
}

// --- BETTING LOGIC ---
document.getElementById('side-tai').addEventListener('click', () => {
    if (currentPhase !== 'betting') return;
    selectedSide = 'tai';
    document.getElementById('side-tai').classList.add('selected');
    document.getElementById('side-xiu').classList.remove('selected');
    if (selectedChipVal > 0) addPendingBet();
});

document.getElementById('side-xiu').addEventListener('click', () => {
    if (currentPhase !== 'betting') return;
    selectedSide = 'xiu';
    document.getElementById('side-xiu').classList.add('selected');
    document.getElementById('side-tai').classList.remove('selected');
    if (selectedChipVal > 0) addPendingBet();
});

document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
        e.target.classList.add('selected');
        selectedChipVal = parseInt(e.target.getAttribute('data-val'));
        if (selectedSide) addPendingBet();
    });
});

// Scroll Chips Logic
const chipsContainer = document.getElementById('chips-container');
document.querySelector('.left-arrow').addEventListener('click', () => {
    chipsContainer.scrollBy({ left: -150, behavior: 'smooth' });
});
document.querySelector('.right-arrow').addEventListener('click', () => {
    chipsContainer.scrollBy({ left: 150, behavior: 'smooth' });
});

function addPendingBet() {
    let balance = getBalance();
    // Balance trong localStorage là số dư THẬT (đã trừ phần confirmed).
    // Do đó chỉ cần check xem phần ĐANG CHỜ (pending) cộng thêm chip mới có vượt quá số dư hiện tại không.
    let currentPendingTotal = pendingBetTai + pendingBetXiu;
    
    if (currentPendingTotal + selectedChipVal > balance) {
        showCustomAlert('Số dư không đủ để cược thêm!', 'LỖI');
        return;
    }

    if (selectedSide === 'tai') pendingBetTai += selectedChipVal;
    if (selectedSide === 'xiu') pendingBetXiu += selectedChipVal;
    
    updateDisplay();
}

document.getElementById('btn-cancel').addEventListener('click', () => {
    pendingBetTai = 0;
    pendingBetXiu = 0;
    updateDisplay();
});

document.getElementById('btn-allin').addEventListener('click', () => {
    if (!selectedSide || currentPhase !== 'betting') return;
    let balance = getBalance();
    // Available = số dư hiện tại trừ đi số tiền pending ở cả 2 bên chưa confirm
    let currentPendingTotal = pendingBetTai + pendingBetXiu;
    let available = balance - currentPendingTotal;
    
    if (available > 0) {
        if (selectedSide === 'tai') pendingBetTai += available;
        else pendingBetXiu += available;
        updateDisplay();
    } else {
        showCustomAlert('Số dư không đủ để All-in thêm!', 'LỖI');
    }
});

document.getElementById('btn-confirm').addEventListener('click', () => {
    if (currentPhase !== 'betting') return;
    let totalPending = pendingBetTai + pendingBetXiu;
    if (totalPending <= 0) return;

    let balance = getBalance();
    if (totalPending > balance) {
        showNotification('Lỗi số dư!', true);
        return;
    }

    serverBalance -= totalPending;
    socket.emit('updateBalance', { username: currentUser, newBalance: serverBalance });

    confirmedBetTai += pendingBetTai;
    confirmedBetXiu += pendingBetXiu;
    pendingBetTai = 0;
    pendingBetXiu = 0;
    
    saveBets();

    updateDisplay();
    showCustomAlert('ĐẶT CƯỢC THÀNH CÔNG!', 'HỆ THỐNG');
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
    let container = document.getElementById('rank-list-container');
    container.innerHTML = '';
    
    let baseNames = ['satthu', 'vuataixiu', 'trum', 'thantai', 'phudai', 'taybac', 'anhnong', 'nguoikx', 'an_dem', 'jack', 'typhu', 'daigia', 'thanhbet', 'top_1', 'no_hu'];
    let ranks = [];
    
    // Sinh 150 người chơi ảo để chọn lấy Top 100
    for(let i=0; i<150; i++) {
        let randomBase = baseNames[Math.floor(Math.random() * baseNames.length)];
        let randomSuffix = Math.floor(Math.random() * 10000);
        let randomMoney = Math.floor(Math.pow(Math.random(), 2) * 5000000000) + 5000000; // Phân phối tiền (5M - 5 tỷ)
        
        ranks.push({
            name: randomBase + randomSuffix,
            money: randomMoney
        });
    }
    
    // Chỉ thêm tài khoản của sếp vào BXH nếu có tiền
    const userBalance = getBalance();
    if (userBalance > 0) {
        ranks.push({
            name: currentUser,
            money: userBalance
        });
    }
    
    // Sắp xếp từ cao xuống thấp
    ranks.sort((a,b) => b.money - a.money);
    
    // Lấy Top 100
    let top100 = ranks.slice(0, 100);
    
    top100.forEach((r, idx) => {
        let div = document.createElement('div');
        div.className = `rank-item rank-${idx+1}`;
        
        let icon = `#${idx+1}`;
        if(idx === 0) icon = '<i class="fa-solid fa-trophy" style="color:#ffd700"></i>';
        if(idx === 1) icon = '<i class="fa-solid fa-medal" style="color:#c0c0c0"></i>';
        if(idx === 2) icon = '<i class="fa-solid fa-award" style="color:#cd7f32"></i>';
        
        let displayName = r.name;
        if(r.name === currentUser) {
            displayName = `<span style="color:#ffd700; font-weight:bold;">(Bạn) ${r.name}</span>`;
        } else {
            if (r.name.length > 5) {
                displayName = r.name.substring(0,3) + '***' + r.name.substring(r.name.length-2);
            } else {
                displayName = r.name.substring(0,1) + '***' + r.name.substring(r.name.length-1);
            }
        }
        
        div.innerHTML = `
            <div class="rank-pos">${icon}</div>
            <div class="rank-name">${displayName}</div>
            <div class="rank-money">${r.money.toLocaleString('vi-VN')}</div>
        `;
        container.appendChild(div);
    });
}
