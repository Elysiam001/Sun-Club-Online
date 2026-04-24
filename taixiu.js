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
socket.emit('taixiuJoin');

let lastPhase = ''; // Thêm biến để theo dõi sự thay đổi giai đoạn

socket.on('taixiuTick', (data) => {
    if (data.phase === 'betting') {
        currentPhase = 'betting';
        timerDisplay.classList.remove('hidden');
        timerDisplay.textContent = data.timer;
        
        // CHỈ RESET KHI BẮT ĐẦU VÁN MỚI (CHUYỂN TỪ RESULT SANG BETTING)
        if (lastPhase !== 'betting') {
            diceScene.classList.add('hidden');
            bowl.classList.add('hidden');
            document.getElementById('side-tai').classList.remove('winner-blink');
            document.getElementById('side-xiu').classList.remove('winner-blink');
            document.getElementById('side-tai').classList.remove('selected');
            document.getElementById('side-xiu').classList.remove('selected');
            
            pendingBetTai = 0;
            pendingBetXiu = 0;
            confirmedBetTai = 0;
            confirmedBetXiu = 0;
            updateDisplay();
        }
        
        // Cập nhật số người và Pool (Giữ nguyên icon và bố cục của sếp)
        document.getElementById('tai-total-pool').textContent = data.totalPool.tai.toLocaleString('vi-VN');
        document.getElementById('xiu-total-pool').textContent = data.totalPool.xiu.toLocaleString('vi-VN');
        document.getElementById('users-tai').innerHTML = `<i class="fa-solid fa-users"></i> ${data.totalUsers.tai.toLocaleString('vi-VN')}`;
        document.getElementById('users-xiu').innerHTML = `<i class="fa-solid fa-users"></i> ${data.totalUsers.xiu.toLocaleString('vi-VN')}`;
    } else {
        timerDisplay.classList.add('hidden');
    }
    
    lastPhase = data.phase; // Quan trọng: Cập nhật lại giai đoạn để không bị reset liên tục
});

socket.on('taixiuResult', (data) => {
    if (currentPhase !== 'betting') return; // Tránh chạy lại nếu đã đang hiện kết quả
    currentPhase = 'result';
    
    currentResultTotal = data.total;
    diceScene.classList.remove('hidden');
    
    // Chạy hiệu ứng quay xúc xắc với kết quả từ Server
    startRealisticRoll(data.dices);
});

socket.on('taixiuReset', () => {
    resetGameUI();
});

socket.on('taixiuBetSuccess', ({ side, amount }) => {
    if (side === 'tai') confirmedBetTai += amount;
    else confirmedBetXiu += amount;
    
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

socket.on('taixiuError', (msg) => {
    showCustomAlert(msg, 'LỖI');
});

socket.on('taixiuPoolUpdate', (pool) => {
    document.getElementById('tai-total-pool').textContent = pool.tai.toLocaleString('vi-VN');
    document.getElementById('xiu-total-pool').textContent = pool.xiu.toLocaleString('vi-VN');
});

// Loại bỏ vòng lặp cũ
// function gameTick() { ... }
// setInterval(gameTick, 200);

// Chỉnh sửa lại startRealisticRoll để nhận mảng xúc xắc từ Server
function startRealisticRoll(dices) {
    isRollingAnimation = true;
    
    dice1.style.transition = 'none'; dice2.style.transition = 'none'; dice3.style.transition = 'none';
    dice1.style.transform = 'rotateX(0deg) rotateY(0deg)';
    dice2.style.transform = 'rotateX(0deg) rotateY(0deg)';
    dice3.style.transform = 'rotateX(0deg) rotateY(0deg)';

    setTimeout(() => {
        dice1.style.transition = 'transform 1.5s cubic-bezier(0.1, 0.8, 0.2, 1)';
        dice2.style.transition = 'transform 1.8s cubic-bezier(0.1, 0.8, 0.2, 1)';
        dice3.style.transition = 'transform 2.1s cubic-bezier(0.1, 0.8, 0.2, 1)';
        
        dice1.style.transform = getTransform(dices[0]);
        dice2.style.transform = getTransform(dices[1]);
        dice3.style.transform = getTransform(dices[2]);
    }, 50);
    
    // Bát úp xuống
    setTimeout(() => {
        bowl.style.transition = 'none';
        bowl.style.transform = 'translate(0px, -400px)';
        bowl.style.opacity = '1';
        bowl.classList.remove('hidden');
        
        setTimeout(() => {
            bowl.style.transition = 'transform 0.2s cubic-bezier(0.5, 0, 1, 1)';
            bowl.style.transform = 'translate(0px, 0px)';
        }, 50);
    }, 1100);

    setTimeout(() => {
        isRollingAnimation = false;
        currentPhase = 'revealing';
    }, 2500);
}

// Chỉnh sửa finalizeResult (Chỉ diễn ra hiệu ứng, tiền do Server lo)
function finalizeResult() {
    if (currentPhase === 'resolving') return;
    currentPhase = 'resolving';
    
    bowl.style.transition = 'transform 0.5s ease, opacity 0.5s ease';
    bowl.style.transform = `translate(0px, -200px)`;
    bowl.style.opacity = '0';
    
    setTimeout(() => {
        bowl.classList.add('hidden');
        
        let isTai = currentResultTotal >= 11;
        let isXiu = currentResultTotal <= 10;
        
        if (isTai) document.getElementById('side-tai').classList.add('winner-blink');
        if (isXiu) document.getElementById('side-xiu').classList.add('winner-blink');
        
        updateHistoryDotsOnClient();
    }, 500);
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
    bowl.style.transition = 'none';
}

function handleDragMove(e) {
    if (!isDragging || currentPhase !== 'revealing') return;
    e.preventDefault();
    let clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let clientY = e.touches ? e.touches[0].clientY : e.clientY;
    currentX = clientX - startX;
    currentY = clientY - startY;
    bowl.style.transform = `translate(${currentX}px, ${currentY}px)`;
}

function handleDragEnd() {
    if (!isDragging || currentPhase !== 'revealing') return;
    isDragging = false;
    let distance = Math.sqrt(currentX * currentX + currentY * currentY);
    if (distance > 100) {
        finalizeResult();
    } else {
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

function updateHistoryDotsOnClient() {
    // Phần này sếp có thể cập nhật từ Server gửi về cho chuẩn hơn
}

// Chỉnh sửa Đặt cược để gửi lên Server
document.getElementById('btn-confirm').addEventListener('click', () => {
    if (currentPhase !== 'betting') return;
    
    if (pendingBetTai > 0) {
        socket.emit('taixiuBet', { username: currentUser, side: 'tai', amount: pendingBetTai });
        pendingBetTai = 0; // Xóa ngay sau khi bấm để tránh bấm nhầm lần 2
    }
    if (pendingBetXiu > 0) {
        socket.emit('taixiuBet', { username: currentUser, side: 'xiu', amount: pendingBetXiu });
        pendingBetXiu = 0; // Xóa ngay sau khi bấm
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
