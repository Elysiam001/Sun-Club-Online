const socket = io(); // Tự động kết nối với host hiện tại (Render, Railway, v.v.)
const currentUser = sessionStorage.getItem('casino_currentUser') || 'Khách';
const myHandEl = document.getElementById('my-hand');

let myHand = [];
let currentTurn = 0;
let lastPlay = null;
let timeLeft = 30;
let turnTimer = null;

document.addEventListener('DOMContentLoaded', () => {
    initGame();
    // In multiplayer, we join a table from cardgames.html
    // For now, let's auto-join Table 105 for testing
    const tableId = "105"; 
    socket.emit('login', { username: currentUser, balance: 1000000 });
    socket.emit('joinTable', tableId);
});

function initGame() {
    document.getElementById('my-name').textContent = currentUser;
    // Balance will come from server later, for now keep local
    const balances = JSON.parse(localStorage.getItem('casino_balances')) || {};
    const balance = balances[currentUser] || 0;
    document.getElementById('my-balance').textContent = balance.toLocaleString() + ' VNĐ';
}

socket.on('deal', (hand) => {
    myHand = hand;
    renderMyHand();
    showGameNotify("BÀI ĐÃ CHIA!");
});

socket.on('gameStarted', (data) => {
    showGameNotify("TRẬN ĐẤU BẮT ĐẦU!");
    updateTurnStatus(data.currentTurn, data.turnUsername);
});

socket.on('turnUpdate', (data) => {
    updateTurnStatus(data.currentTurn, data.turnUsername);
});

socket.on('cardsPlayed', (data) => {
    const playArea = document.getElementById('played-cards');
    playArea.innerHTML = '';
    data.cards.forEach(c => {
        const cEl = createCardUI(c);
        cEl.style.margin = '0 5px';
        playArea.appendChild(cEl);
    });
    showGameNotify(data.username + " đã đánh!");
});

socket.on('playerSkipped', (data) => {
    showGameNotify(data.username + " bỏ lượt.");
});

socket.on('newRound', () => {
    showGameNotify("VÒNG MỚI!");
    const playArea = document.getElementById('played-cards');
    playArea.innerHTML = '';
});

socket.on('tableUpdate', (data) => {
    // Update other players' UI
    // For now, let's just log it
    console.log("Table Update:", data);
});

socket.on('gameError', (msg) => {
    showGameNotify(msg);
});

function updateTurnStatus(turnIdx, username) {
    currentTurn = turnIdx;
    startTimer();
    document.querySelectorAll('.avatar-box').forEach(b => b.classList.remove('active-turn'));
    
    // Logic to find which UI box matches the username
    // Simple for now: if username is me, highlight self
    if (username === currentUser) {
        document.querySelector('.avatar-box.self').classList.add('active-turn');
        showGameNotify("Đến lượt bạn!");
    } else {
        // Highlight bots/other players (need better mapping in production)
        showGameNotify("Lượt của " + username);
    }
}

function renderMyHand() {
    myHandEl.innerHTML = '';
    myHand.forEach((c, idx) => {
        const cardEl = createCardUI(c);
        cardEl.style.zIndex = idx;
        cardEl.onclick = () => cardEl.classList.toggle('selected');
        myHandEl.appendChild(cardEl);
    });
}

function createCardUI(c) {
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.dataset.vidx = c.vIdx;
    cardEl.dataset.sidx = c.sIdx;
    
    const vDiv = document.createElement('div');
    vDiv.className = 'card-val ' + c.suit.class;
    vDiv.textContent = c.val;
    
    const sDiv = document.createElement('div');
    sDiv.className = 'card-suit ' + c.suit.class;
    sDiv.textContent = c.suit.symbol;

    const bDiv = document.createElement('div');
    bDiv.className = 'card-suit-big ' + c.suit.class;
    bDiv.textContent = c.suit.symbol;
    
    cardEl.appendChild(vDiv);
    cardEl.appendChild(sDiv);
    cardEl.appendChild(bDiv);
    return cardEl;
}

function playCards() {
    const selectedEls = document.querySelectorAll('.card.selected');
    if (selectedEls.length === 0) return;
    
    const selectedIndices = Array.from(selectedEls).map(el => {
        const v = parseInt(el.dataset.vidx);
        const s = parseInt(el.dataset.sidx);
        return myHand.findIndex(c => c.vIdx === v && c.sIdx === s);
    });

    socket.emit('playCards', selectedIndices);
}

function skipTurn() {
    socket.emit('skipTurn');
}

function sortCards() {
    myHand.sort((a, b) => a.vIdx !== b.vIdx ? a.vIdx - b.vIdx : a.sIdx - b.sIdx);
    renderMyHand();
}

function startTimer() {
    clearInterval(turnTimer);
    timeLeft = 30;
    const timerText = document.querySelector('.active-turn .timer-text');
    if (timerText) timerText.textContent = timeLeft;

    turnTimer = setInterval(() => {
        timeLeft--;
        const activeTimer = document.querySelector('.active-turn .timer-text');
        if (activeTimer) activeTimer.textContent = timeLeft;
        if (timeLeft <= 0) clearInterval(turnTimer);
    }, 1000);
}

function showGameNotify(text) {
    const notify = document.getElementById('game-notify');
    if (!notify) return;
    notify.textContent = text;
    notify.classList.remove('hidden');
    setTimeout(() => notify.classList.add('hidden'), 2000);
}
