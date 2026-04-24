// --- TÀI XỈU 3D PREMIUN LOGIC (VERSION 2.0 - FIX ALL) ---
const socket = io();
const currentUser = sessionStorage.getItem('casino_currentUser');
if (!currentUser) window.location.href = 'index.html';

let serverBalance = 0;
let currentPhase = 'betting';
let currentResultDices = [1, 2, 3];
let currentResultTotal = 6;
let lastPhase = '';
let isRollingAnimation = false;

// Betting state
let selectedChipVal = 0;
let pendingBetTai = 0;
let pendingBetXiu = 0;
let confirmedBetTai = 0;
let confirmedBetXiu = 0;
let selectedSide = null;

// DOM Cache
const dom = {
    balance: null, pTai: null, pXiu: null, mTai: null, mXiu: null,
    uT: null, uX: null, poolT: null, poolX: null,
    timer: null, diceScene: null, bowl: null,
    dice1: null, dice2: null, dice3: null, centerCircle: null
};

function initDOMCache() {
    dom.balance = document.getElementById('current-balance');
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
    dom.centerCircle = document.getElementById('center-circle-area');
}

// Initialize on Load
window.addEventListener('load', () => {
    initDOMCache();
    
    // Tự động chọn chip đầu tiên cho sếp
    const chips = document.querySelectorAll('.chip');
    if (chips.length > 0) chips[0].click();

    // Attach drag events
    if (dom.bowl) {
        dom.bowl.addEventListener('mousedown', onStart);
        dom.bowl.addEventListener('touchstart', onStart, {passive: false});
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, {passive: false});
    document.addEventListener('touchend', onEnd);
});

// Socket Events
socket.emit('login', { username: currentUser });
socket.on('loginSuccess', (data) => { if (data.username === currentUser) { serverBalance = data.balance; updateDisplay(); } });
socket.on('balanceUpdate', (data) => { if (data.username === currentUser) { serverBalance = data.newBalance; updateDisplay(); } });

// Stats Management
let targetStats = { taiUsers: 0, xiuUsers: 0, taiPool: 0, xiuPool: 0 };
let displayStats = { taiUsers: 0, xiuUsers: 0, taiPool: 0, xiuPool: 0 };

function updateSmoothStats() {
    const speed = 0.15;
    displayStats.taiUsers = Math.ceil(displayStats.taiUsers + (targetStats.taiUsers - displayStats.taiUsers) * speed);
    displayStats.xiuUsers = Math.ceil(displayStats.xiuUsers + (targetStats.xiuUsers - displayStats.xiuUsers) * speed);
    displayStats.taiPool = Math.ceil(displayStats.taiPool + (targetStats.taiPool - displayStats.taiPool) * speed);
    displayStats.xiuPool = Math.ceil(displayStats.xiuPool + (targetStats.xiuPool - displayStats.xiuPool) * speed);

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
            if (dom.timer) dom.timer.classList.remove('hidden');
            if (dom.diceScene) dom.diceScene.classList.add('hidden');
            if (dom.bowl) dom.bowl.classList.add('hidden');
            document.querySelectorAll('.bet-side').forEach(p => p.classList.remove('winner-blink', 'confirmed', 'selected'));
            resetBets();
        } else if (data.phase === 'result') {
            currentPhase = 'result';
            currentResultDices = data.dices;
            currentResultTotal = data.dices[0] + data.dices[1] + data.dices[2];
            startRealisticRoll(data.dices);
        }
    }
});

socket.on('taixiuBetSuccess', ({ side, amount }) => {
    if (side === 'tai') confirmedBetTai += amount; else confirmedBetXiu += amount;
    const p = document.getElementById(`side-${side}`);
    if (p) p.classList.add('confirmed');
    pendingBetTai = 0; pendingBetXiu = 0;
    updateDisplay();
    showNotification(`ĐẶT CƯỢC THÀNH CÔNG: ${amount.toLocaleString()} VNĐ`);
});

socket.on('taixiuWin', ({ username, winAmount }) => {
    if (username === currentUser) {
        showNotification(`THẮNG LỚN: ${winAmount.toLocaleString()} VNĐ!`);
        createGoldExplosion();
    }
});

// UI Display
function updateDisplay() {
    if (dom.balance) dom.balance.textContent = serverBalance.toLocaleString('vi-VN');
    if (dom.pTai) dom.pTai.textContent = pendingBetTai.toLocaleString('vi-VN');
    if (dom.pXiu) dom.pXiu.textContent = pendingBetXiu.toLocaleString('vi-VN');
    if (dom.mTai) dom.mTai.textContent = confirmedBetTai.toLocaleString('vi-VN');
    if (dom.mXiu) dom.mXiu.textContent = confirmedBetXiu.toLocaleString('vi-VN');
}

function resetBets() {
    pendingBetTai = 0; pendingBetXiu = 0; confirmedBetTai = 0; confirmedBetXiu = 0;
    updateDisplay();
}

// Animation Logic
function startRealisticRoll(dices) {
    isRollingAnimation = true;
    if (dom.timer) dom.timer.classList.add('hidden');
    if (dom.diceScene) dom.diceScene.classList.remove('hidden');
    
    [dom.dice1, dom.dice2, dom.dice3].forEach(d => { if (d) d.style.transition = 'none'; });
    
    setTimeout(() => {
        if (dom.dice1) { dom.dice1.style.transition = 'transform 1.5s cubic-bezier(0.1, 0.8, 0.2, 1)'; dom.dice1.style.transform = getDiceTransform(dices[0]); }
        if (dom.dice2) { dom.dice2.style.transition = 'transform 1.8s cubic-bezier(0.1, 0.8, 0.2, 1)'; dom.dice2.style.transform = getDiceTransform(dices[1]); }
        if (dom.dice3) { dom.dice3.style.transition = 'transform 2.1s cubic-bezier(0.1, 0.8, 0.2, 1)'; dom.dice3.style.transform = getDiceTransform(dices[2]); }
    }, 50);

    setTimeout(() => {
        if (dom.bowl) {
            dom.bowl.style.transition = 'none';
            dom.bowl.style.transform = 'translate(0, -400px)';
            dom.bowl.style.opacity = '1';
            dom.bowl.classList.remove('hidden');
            setTimeout(() => {
                dom.bowl.style.transition = 'transform 0.3s ease-in';
                dom.bowl.style.transform = 'translate(0,0)';
            }, 50);
        }
    }, 1100);

    setTimeout(() => { isRollingAnimation = false; currentPhase = 'revealing'; }, 2500);
}

function getDiceTransform(val) {
    const rots = { 1: 'rotateX(0deg) rotateY(0deg)', 2: 'rotateX(0deg) rotateY(-90deg)', 3: 'rotateX(-90deg) rotateY(0deg)', 4: 'rotateX(90deg) rotateY(0deg)', 5: 'rotateX(0deg) rotateY(90deg)', 6: 'rotateX(0deg) rotateY(180deg)' };
    return rots[val] + ` rotateX(${Math.floor(Math.random()*4+4)*360}deg) rotateY(${Math.floor(Math.random()*4+4)*360}deg)`;
}

function finalizeResult() {
    if (currentPhase === 'resolving') return;
    currentPhase = 'resolving';
    if (dom.bowl) {
        dom.bowl.style.transition = 'transform 0.5s ease, opacity 0.5s ease';
        dom.bowl.style.transform = 'translate(0, -200px)';
        dom.bowl.style.opacity = '0';
    }
    let isTai = currentResultTotal >= 11;
    if (confirmedBetTai > 0) showFloatingResult('tai', confirmedBetTai, isTai);
    if (confirmedBetXiu > 0) showFloatingResult('xiu', confirmedBetXiu, !isTai);
    setTimeout(() => {
        if (dom.bowl) dom.bowl.classList.add('hidden');
        const el = document.getElementById(isTai ? 'side-tai' : 'side-xiu');
        if (el) el.classList.add('winner-blink');
    }, 500);
}

function showFloatingResult(side, amount, isWin) {
    const p = document.getElementById(`side-${side}`);
    if (!p) return;
    const el = document.createElement('div');
    el.className = `floating-result ${isWin ? 'win' : 'lose'}`;
    el.textContent = (isWin ? '+' : '-') + amount.toLocaleString();
    p.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

// Drag logic
let isDragging = false, startX = 0, startY = 0, currX = 0, currY = 0;
function onStart(e) { if (currentPhase !== 'revealing') return; isDragging = true; let c = e.touches ? e.touches[0] : e; startX = c.clientX - currX; startY = c.clientY - currY; if (dom.bowl) dom.bowl.style.transition = 'none'; }
function onMove(e) { if (!isDragging) return; e.preventDefault(); let c = e.touches ? e.touches[0] : e; currX = c.clientX - startX; currY = c.clientY - startY; if (dom.bowl) dom.bowl.style.transform = `translate(${currX}px, ${currY}px)`; }
function onEnd() { if (!isDragging) return; isDragging = false; if (Math.sqrt(currX*currX + currY*currY) > 100) finalizeResult(); else if (dom.bowl) { dom.bowl.style.transition = 'transform 0.3s ease'; currX = 0; currY = 0; dom.bowl.style.transform = 'translate(0,0)'; } }
function startFakeChat() {
    setTimeout(() => {
        const names = ['tuan','hung','linh','be_cute','anh_pro','dai_gia_88','kiet_xu','huyen_my'];
        const msgs = ['Xỉu đẹp!','Tài đi anh em!','Húp rồi, ngon quá!','Đen quá, gãy cầu rồi.','Lên Tài đi nào!','Cầu này bệt Xỉu rồi.'];
        addMsg(names[Math.floor(Math.random()*names.length)], msgs[Math.floor(Math.random()*msgs.length)]);
        startFakeChat();
    }, Math.random()*5000+3000);
}
startFakeChat();

// User Interactions
document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(x => x.classList.remove('selected'));
    c.classList.add('selected');
    selectedChipVal = parseInt(c.dataset.val);
}));

document.getElementById('side-tai').addEventListener('click', () => {
    if (currentPhase !== 'betting') return;
    selectedSide = 'tai';
    document.getElementById('side-tai').classList.add('selected');
    document.getElementById('side-xiu').classList.remove('selected');
    if (selectedChipVal > 0) { pendingBetTai += selectedChipVal; updateDisplay(); }
});

document.getElementById('side-xiu').addEventListener('click', () => {
    if (currentPhase !== 'betting') return;
    selectedSide = 'xiu';
    document.getElementById('side-xiu').classList.add('selected');
    document.getElementById('side-tai').classList.remove('selected');
    if (selectedChipVal > 0) { pendingBetXiu += selectedChipVal; updateDisplay(); }
});

document.getElementById('btn-confirm').addEventListener('click', () => {
    if (currentPhase !== 'betting') return;
    if (pendingBetTai > 0) socket.emit('taixiuBet', { username: currentUser, side: 'tai', amount: pendingBetTai });
    if (pendingBetXiu > 0) socket.emit('taixiuBet', { username: currentUser, side: 'xiu', amount: pendingBetXiu });
    updateDisplay();
});

document.getElementById('btn-cancel').addEventListener('click', () => {
    pendingBetTai = 0; pendingBetXiu = 0;
    document.querySelectorAll('.bet-side').forEach(s => s.classList.remove('selected'));
    updateDisplay();
});

document.getElementById('btn-allin').addEventListener('click', () => {
    if (currentPhase !== 'betting' || !selectedSide) return;
    let rem = serverBalance - (confirmedBetTai + confirmedBetXiu);
    if (rem > 0) { if (selectedSide === 'tai') pendingBetTai = rem; else pendingBetXiu = rem; updateDisplay(); }
});

// Notifications
function showNotification(msg, isErr = false) {
    const el = document.getElementById('notification');
    if (!el) return;
    el.textContent = msg;
    el.className = `notification ${isErr ? 'error' : ''}`;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 3000);
}

function createGoldExplosion() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:100vw;height:100vh;background:radial-gradient(circle,rgba(255,215,0,0.4),transparent 70%);pointer-events:none;z-index:9999;animation:gold-flash 1s forwards;';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

// Chat
function addMsg(user, msg) {
    const a = document.getElementById('chat-messages');
    if (a) {
        a.insertAdjacentHTML('beforeend', `<div class="chat-item"><span class="username">${user}:</span> ${msg}</div>`);
        a.scrollTop = a.scrollHeight;
    }
}
document.getElementById('btn-send-chat').addEventListener('click', () => {
    const i = document.getElementById('chat-input');
    if (i && i.value.trim()) { addMsg(currentUser, i.value.trim()); i.value = ''; }
});

// Modals
const modalBxh = document.getElementById('modal-bxh');
if (document.getElementById('btn-bxh')) document.getElementById('btn-bxh').addEventListener('click', () => { modalBxh.classList.remove('hidden'); socket.emit('getLeaderboard'); });
if (document.getElementById('btn-close-bxh')) document.getElementById('btn-close-bxh').addEventListener('click', () => modalBxh.classList.add('hidden'));

socket.on('leaderboardData', (data) => {
    const container = document.getElementById('rank-list-container');
    if (container) container.innerHTML = data.map((r, i) => `<div class="rank-item"><span>#${i+1}</span><span>${r.name}</span><span class="rank-money">${r.money.toLocaleString()}</span></div>`).join('');
});
