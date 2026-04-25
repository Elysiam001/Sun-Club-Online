/**
 * TÀI XỈU RUBY - SUN CLUB
 * High-End Implementation
 */

const socket = io();
const currentUser = sessionStorage.getItem('casino_currentUser');

if (!currentUser) {
    window.location.href = 'index.html';
}

// State Management
let currentPhase = 'betting'; // betting, result, revealing, resolving
let lastPhase = '';
let serverBalance = 0;
let pendingBetTai = 0;
let pendingBetXiu = 0;
let confirmedBetTai = 0;
let confirmedBetXiu = 0;
let selectedChipVal = 10000;
let selectedSide = null;
let currentResultDices = [1, 2, 3];
let currentResultTotal = 6;
let isRollingAnimation = false;

// DOM Cache
const dom = {
    balance: null, pTai: null, pXiu: null, mTai: null, mXiu: null,
    uT: null, uX: null, poolT: null, poolX: null,
    timer: null, diceScene: null, bowl: null,
    dice1: null, dice2: null, dice3: null,
    roundId: null, chatContainer: null, historyContainer: null
};

function initDOMCache() {
    dom.balance = document.getElementById('current-balance');
    dom.pTai = document.getElementById('pending-bet-tai'); // Use same IDs but in new structure
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
    dom.roundId = document.getElementById('round-id-display');
    dom.chatContainer = document.getElementById('chat-container');
    dom.historyContainer = document.getElementById('history-dots-container');
}

// --- INITIALIZATION ---
window.addEventListener('load', () => {
    initDOMCache();
    socket.emit('getTaixiuState');
    
    // Đồng bộ tiền với sảnh ngoài
    syncBalanceWithLobby();
    
    // Tự động đồng bộ mỗi 2 giây nếu tiền bằng 0 (đề phòng cache)
    setInterval(() => {
        if (serverBalance === 0) syncBalanceWithLobby();
    }, 2000);
});

function syncBalanceWithLobby() {
    try {
        let balance = 0;
        
        // 1. Kiểm tra localStorage
        try {
            const balances = JSON.parse(localStorage.getItem('casino_balances')) || {};
            if (balances[currentUser] !== undefined) balance = balances[currentUser];
            else {
                const keys = Object.keys(balances);
                if (keys.length > 0) balance = balances[keys[0]];
            }
        } catch(e) { console.error("Lỗi đọc localStorage:", e); }
        
        // 2. Nếu không thấy, kiểm tra sessionStorage
        if (!balance) {
            try {
                const sessionBalances = JSON.parse(sessionStorage.getItem('casino_balances')) || {};
                if (sessionBalances[currentUser] !== undefined) balance = sessionBalances[currentUser];
                else {
                    const keys = Object.keys(sessionBalances);
                    if (keys.length > 0) balance = sessionBalances[keys[0]];
                }
            } catch(e) { console.error("Lỗi đọc sessionStorage:", e); }
        }

        // 3. Dự phòng cuối cùng: Cho 50M
        serverBalance = parseInt(balance) || 50000000;
        console.log("Đã đồng bộ tiền từ sảnh:", serverBalance);
        
        // CẬP NHẬT TRỰC TIẾP LÊN DOM ĐỂ CHẮC CHẮN NÓ CHẠY
        if (dom.balance) dom.balance.innerHTML = `<span style="color:#00ff00">${serverBalance.toLocaleString('vi-VN')}</span>`;
        updateDisplay();
    } catch (e) {
        console.error("Lỗi đồng bộ tiền:", e);
        serverBalance = 99999999; // Báo lỗi thì cho 99 củ
        if (dom.balance) dom.balance.textContent = serverBalance.toLocaleString('vi-VN');
    }
}

// --- SOCKET EVENTS ---
socket.on('balanceUpdate', (data) => {
    if (data && data.newBalance !== undefined) {
        serverBalance = data.newBalance;
        updateDisplay();
    } else if (typeof data === 'number') {
        serverBalance = data;
        updateDisplay();
    }
});

socket.on('taixiuTick', (data) => {
    if (!data) return;
    
    // Update Timer
    if (dom.timer) {
        dom.timer.textContent = data.timer !== undefined ? data.timer : '--';
        if (data.phase === 'betting') {
            dom.timer.classList.remove('hidden');
        }
    }

    // Update Round ID
    if (dom.roundId && data.sessionId) dom.roundId.textContent = `#${data.sessionId}`;

    // Update History
    if (data.history && dom.historyContainer) {
        dom.historyContainer.innerHTML = data.history.map(h => 
            `<div class="dot-${h.result}"></div>`
        ).join('');
    }

    // Update Stats (Simplified for clean UI)
    if (dom.uT) dom.uT.textContent = ((data.fakeTai?.users || 0) + (data.totalUsers?.tai || 0)).toLocaleString();
    if (dom.uX) dom.uX.textContent = ((data.fakeXiu?.users || 0) + (data.totalUsers?.xiu || 0)).toLocaleString();
    if (dom.poolT) dom.poolT.textContent = ((data.fakeTai?.pool || 0) + (data.totalPool?.tai || 0)).toLocaleString();
    if (dom.poolX) dom.poolX.textContent = ((data.fakeXiu?.pool || 0) + (data.totalPool?.xiu || 0)).toLocaleString();

    // Phase Transitions
    if (data.phase && data.phase !== lastPhase) {
        lastPhase = data.phase;
        handlePhaseChange(data.phase, data.dices);
    }
});

function handlePhaseChange(phase, dices) {
    if (phase === 'betting') {
        currentPhase = 'betting';
        if (dom.timer) dom.timer.classList.remove('hidden');
        if (dom.diceScene) dom.diceScene.classList.add('hidden');
        if (dom.bowl) dom.bowl.classList.add('hidden');
        document.querySelectorAll('.bet-panel').forEach(p => p.classList.remove('winner-blink', 'active'));
        resetBets();
    } else if (phase === 'result') {
        currentPhase = 'result';
        currentResultDices = dices || [1, 2, 3];
        currentResultTotal = currentResultDices.reduce((a,b) => a+b, 0);
        startRealisticRoll(currentResultDices);
    }
}

socket.on('taixiuBetSuccess', (data) => {
    if (data.side === 'tai') { confirmedBetTai += data.amount; pendingBetTai = 0; }
    else { confirmedBetXiu += data.amount; pendingBetXiu = 0; }
    updateDisplay();
});

// --- UI DISPLAY ---
function updateDisplay() {
    if (dom.balance) dom.balance.textContent = serverBalance.toLocaleString('vi-VN');
    if (dom.mTai) dom.mTai.textContent = confirmedBetTai.toLocaleString('vi-VN');
    if (dom.mXiu) dom.mXiu.textContent = confirmedBetXiu.toLocaleString('vi-VN');
}

function resetBets() {
    pendingBetTai = 0; pendingBetXiu = 0; confirmedBetTai = 0; confirmedBetXiu = 0;
    selectedSide = null;
    updateDisplay();
}

// --- ANIMATION LOGIC ---
function startRealisticRoll(dices) {
    isRollingAnimation = true;
    if (dom.timer) dom.timer.classList.add('hidden'); // Ẩn khi đang quay
    if (dom.diceScene) dom.diceScene.classList.remove('hidden');
    
    [dom.dice1, dom.dice2, dom.dice3].forEach(d => { if (d) d.style.transition = 'none'; });
    
    setTimeout(() => {
        if (dom.dice1) { dom.dice1.style.transition = 'transform 1.8s cubic-bezier(0.15, 0.9, 0.25, 1)'; dom.dice1.style.transform = getDiceTransform(dices[0]); }
        if (dom.dice2) { dom.dice2.style.transition = 'transform 2.0s cubic-bezier(0.15, 0.9, 0.25, 1)'; dom.dice2.style.transform = getDiceTransform(dices[1]); }
        if (dom.dice3) { dom.dice3.style.transition = 'transform 2.2s cubic-bezier(0.15, 0.9, 0.25, 1)'; dom.dice3.style.transform = getDiceTransform(dices[2]); }
    }, 100);

    setTimeout(() => {
        if (dom.bowl) {
            dom.bowl.style.transition = 'none';
            dom.bowl.style.transform = 'translate(0, -400px)';
            dom.bowl.style.opacity = '1';
            dom.bowl.classList.remove('hidden');
            setTimeout(() => {
                dom.bowl.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
                dom.bowl.style.transform = 'translate(0,0)';
                // HIỆN LẠI ĐỒNG HỒ 10 GIÂY ĐỂ SẾP BIẾT ĐƯỜNG NẶN
                if (dom.timer) dom.timer.classList.remove('hidden');
            }, 50);
        }
    }, 1100);

    setTimeout(() => { isRollingAnimation = false; currentPhase = 'revealing'; }, 2500);
}

function getDiceTransform(val) {
    const rots = { 
        1: 'rotateX(0deg) rotateY(0deg)', 2: 'rotateX(0deg) rotateY(-90deg)', 
        3: 'rotateX(-90deg) rotateY(0deg)', 4: 'rotateX(90deg) rotateY(0deg)', 
        5: 'rotateX(0deg) rotateY(90deg)', 6: 'rotateX(0deg) rotateY(180deg)' 
    };
    const extraX = (Math.floor(Math.random() * 6) + 6) * 360;
    const extraY = (Math.floor(Math.random() * 6) + 6) * 360;
    return rots[val] + ` rotateX(${extraX}deg) rotateY(${extraY}deg)`;
}

function finalizeResult() {
    if (currentPhase === 'resolving') return;
    currentPhase = 'resolving';
    if (dom.bowl) {
        dom.bowl.style.transition = 'transform 0.8s ease-in, opacity 0.5s ease';
        dom.bowl.style.transform = 'translate(150px, -150px) rotate(20deg)';
        dom.bowl.style.opacity = '0';
    }
    let isTai = currentResultTotal >= 11;
    setTimeout(() => {
        if (dom.bowl) dom.bowl.classList.add('hidden');
        const side = isTai ? 'tai' : 'xiu';
        const el = document.getElementById(`side-${side}`);
        if (el) el.classList.add('winner-blink');
    }, 500);
}

// --- USER INTERACTIONS ---

// Side Selection
document.getElementById('side-tai').addEventListener('click', () => {
    if (currentPhase !== 'betting') return;
    selectedSide = 'tai';
    document.getElementById('side-tai').classList.add('active');
    document.getElementById('side-xiu').classList.remove('active');
});

document.getElementById('side-xiu').addEventListener('click', () => {
    if (currentPhase !== 'betting') return;
    selectedSide = 'xiu';
    document.getElementById('side-xiu').classList.add('active');
    document.getElementById('side-tai').classList.remove('active');
});

// Chip Selection
document.querySelectorAll('.ruby-chip').forEach(c => c.addEventListener('click', () => {
    document.querySelectorAll('.ruby-chip').forEach(x => x.classList.remove('active'));
    c.classList.add('active');
    selectedChipVal = parseInt(c.dataset.val);
    
    // Quick bet if side is selected
    if (selectedSide && currentPhase === 'betting') {
        if (selectedSide === 'tai') pendingBetTai += selectedChipVal;
        else pendingBetXiu += selectedChipVal;
        
        // Show pending in side
        const pTai = document.getElementById('pending-bet-tai-txt'); // I'll add this to HTML or reuse
        // For simplicity, just update confirmed display in real time for "feeling"
    }
}));

// Action Buttons
document.getElementById('btn-confirm').addEventListener('click', () => {
    if (currentPhase !== 'betting') return;
    if (pendingBetTai > 0) socket.emit('taixiuBet', { username: currentUser, side: 'tai', amount: pendingBetTai });
    if (pendingBetXiu > 0) socket.emit('taixiuBet', { username: currentUser, side: 'xiu', amount: pendingBetXiu });
});

document.getElementById('btn-cancel').addEventListener('click', () => {
    pendingBetTai = 0; pendingBetXiu = 0;
    updateDisplay();
});

document.getElementById('btn-allin').addEventListener('click', () => {
    if (currentPhase !== 'betting' || !selectedSide) return;
    let rem = serverBalance - (confirmedBetTai + confirmedBetXiu);
    if (rem > 0) {
        if (selectedSide === 'tai') pendingBetTai = rem;
        else pendingBetXiu = rem;
    }
});

// Bowl Drag
let isDragging = false, startX = 0, startY = 0, currX = 0, currY = 0;
document.getElementById('bowl-cover').addEventListener('mousedown', onStart);
document.getElementById('bowl-cover').addEventListener('touchstart', onStart);
window.addEventListener('mousemove', onMove);
window.addEventListener('touchmove', onMove);
window.addEventListener('mouseup', onEnd);
window.addEventListener('touchend', onEnd);

function onStart(e) { if (currentPhase !== 'revealing') return; isDragging = true; let c = e.touches ? e.touches[0] : e; startX = c.clientX - currX; startY = c.clientY - currY; if (dom.bowl) dom.bowl.style.transition = 'none'; }
function onMove(e) { if (!isDragging) return; e.preventDefault(); let c = e.touches ? e.touches[0] : e; currX = c.clientX - startX; currY = c.clientY - startY; if (dom.bowl) dom.bowl.style.transform = `translate(${currX}px, ${currY}px)`; }
function onEnd() { if (!isDragging) return; isDragging = false; if (Math.sqrt(currX*currX + currY*currY) > 80) finalizeResult(); else if (dom.bowl) { dom.bowl.style.transition = 'transform 0.3s ease'; currX = 0; currY = 0; dom.bowl.style.transform = 'translate(0,0)'; } }

// --- CHAT SYSTEM ---
function toggleChat() {
    document.getElementById('chat-container').classList.toggle('active');
}
window.toggleChat = toggleChat;

function addMsg(user, msg, isSystem = false) {
    const a = document.getElementById('chat-messages');
    if (!a) return;
    const chatClass = isSystem ? 'system' : (user === currentUser ? 'me' : '');
    a.insertAdjacentHTML('beforeend', `<div class="chat-item ${chatClass}"><span class="username">${user}:</span> ${msg}</div>`);
    a.scrollTop = a.scrollHeight;
}

document.getElementById('btn-send-chat').addEventListener('click', () => {
    const i = document.getElementById('chat-input');
    if (i && i.value.trim()) { 
        socket.emit('chatMessage', { username: currentUser, message: i.value.trim() });
        i.value = ''; 
    }
});

socket.on('chatMessage', (data) => addMsg(data.username, data.message));

// Modals
document.getElementById('btn-bxh').addEventListener('click', () => { 
    document.getElementById('modal-bxh').classList.remove('hidden'); 
    socket.emit('getLeaderboard'); 
});
document.getElementById('btn-close-bxh').addEventListener('click', () => document.getElementById('modal-bxh').classList.add('hidden'));

socket.on('leaderboardData', (data) => {
    const container = document.getElementById('rank-list-container');
    if (container) container.innerHTML = data.map((r, i) => `<div class="rank-item"><span>#${i+1}</span><span>${r.name}</span><span class="money">${r.money.toLocaleString()}</span></div>`).join('');
});
