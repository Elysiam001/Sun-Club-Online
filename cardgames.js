const currentUser = sessionStorage.getItem('casino_currentUser');
const currentRole = sessionStorage.getItem('casino_role');

if (!currentUser || currentRole !== 'user') {
    window.location.href = 'index.html';
}

const gameType = new URLSearchParams(window.location.search).get('game') || 'tienlen';

document.addEventListener('DOMContentLoaded', () => {
    initLobby();
    generateTables();
});

function initLobby() {
    const titleMap = {
        'tienlen': 'TIẾN LÊN MIỀN NAM',
        'phom': 'PHỎM - TÁ LẢ'
    };
    document.getElementById('game-title').textContent = titleMap[gameType] || 'GAME BÀI';
    document.getElementById('player-name').textContent = currentUser;
    
    updateBalanceDisplay();
}

function updateBalanceDisplay() {
    const balances = JSON.parse(localStorage.getItem('casino_balances')) || {};
    const balance = balances[currentUser] || 0;
    document.getElementById('player-balance').textContent = balance.toLocaleString() + ' VNĐ';
}

let allTables = [];

function generateTables() {
    const container = document.getElementById('tables-container');
    const betLevels = [1000, 5000, 10000, 50000, 100000, 500000, 1000000];
    
    allTables = [];
    for (let i = 1; i <= 30; i++) {
        const bet = betLevels[Math.floor(Math.random() * betLevels.length)];
        const playerCount = Math.floor(Math.random() * 4) + 1;
        
        let level = 'so-cap';
        if (bet >= 500000) level = 'cao-cap';
        else if (bet >= 50000) level = 'trung-cap';

        allTables.push({ id: 100 + i, bet, playerCount, level });
    }
    renderTables(allTables);
}

function renderTables(tables) {
    const container = document.getElementById('tables-container');
    container.innerHTML = '';
    
    tables.forEach(t => {
        const table = document.createElement('div');
        table.className = 'game-table';
        table.onclick = () => joinTable(t.id, t.bet);
        
        table.innerHTML = `
            <div class="table-id">Bàn #${t.id}</div>
            <div class="table-bet">${t.bet.toLocaleString()}</div>
            <div class="table-req">Tối thiểu: ${(t.bet * 10).toLocaleString()}</div>
            
            <div class="table-visual">
                <div class="chair top ${t.playerCount >= 1 ? 'active' : ''}"></div>
                <div class="chair right ${t.playerCount >= 2 ? 'active' : ''}"></div>
                <div class="chair bottom ${t.playerCount >= 3 ? 'active' : ''}"></div>
                <div class="chair left ${t.playerCount >= 4 ? 'active' : ''}"></div>
                <div class="table-players-count">${t.playerCount}/4</div>
            </div>
            
            <button class="btn-join-table">VÀO BÀN</button>
        `;
        container.appendChild(table);
    });
}

function filterTables(level, btn) {
    // Update active button
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    if (level === 'all') {
        renderTables(allTables);
    } else {
        const filtered = allTables.filter(t => t.level === level);
        renderTables(filtered);
    }
}

function quickPlay() {
    const balances = JSON.parse(localStorage.getItem('casino_balances')) || {};
    const balance = balances[currentUser] || 0;
    
    // Find highest bet table user can afford
    const affordable = allTables.filter(t => balance >= t.bet * 10 && t.playerCount < 4);
    if (affordable.length === 0) {
        showCustomAlert("Không tìm thấy bàn chơi phù hợp với số dư của bạn!", "THÔNG BÁO");
        return;
    }
    
    affordable.sort((a,b) => b.bet - a.bet);
    const target = affordable[0];
    joinTable(target.id, target.bet);
}

function joinTable(id, bet) {
    const balances = JSON.parse(localStorage.getItem('casino_balances')) || {};
    const balance = balances[currentUser] || 0;
    
    if (balance < bet * 10) {
        showCustomAlert(`Bạn cần ít nhất ${(bet * 10).toLocaleString()} VNĐ để vào bàn này!`, "SỐ DƯ KHÔNG ĐỦ");
        return;
    }

    showCustomAlert(`Đang kết nối tới bàn #${id}...\nVui lòng chờ trong giây lát.`, "ĐANG KẾT NỐI");
    
    setTimeout(() => {
        window.location.href = `ingame.html?id=${id}&bet=${bet}`;
    }, 1500);
}

// Reuse Alert logic from lobby if needed, or define here
function showCustomAlert(message, title = 'THÔNG BÁO') {
    const modal = document.getElementById('custom-alert-modal');
    const titleEl = document.getElementById('alert-title');
    const msgEl = document.getElementById('alert-message');
    if (modal && titleEl && msgEl) {
        titleEl.textContent = title;
        msgEl.textContent = message;
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
    }
}

function closeAlert() {
    const modal = document.getElementById('custom-alert-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
}
