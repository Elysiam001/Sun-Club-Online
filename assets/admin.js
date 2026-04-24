// Check admin session
const currentUser = sessionStorage.getItem('casino_currentUser');
const currentRole = sessionStorage.getItem('casino_role');

if (!currentUser || currentRole !== 'admin') {
    window.location.href = 'index.html';
}

document.getElementById('btn-admin-logout').addEventListener('click', () => {
    sessionStorage.removeItem('casino_currentUser');
    sessionStorage.removeItem('casino_role');
    window.location.href = 'index.html';
});

function loadTransactions() {
    const trans = JSON.parse(localStorage.getItem('casino_transactions')) || [];
    const tbody = document.getElementById('trans-body');
    tbody.innerHTML = '';

    // Lọc ra những giao dịch pending
    const pendingTrans = trans.filter(t => t.status === 'pending');

    if (pendingTrans.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Không có giao dịch nào đang chờ duyệt</td></tr>';
        return;
    }

    pendingTrans.forEach(t => {
        const tr = document.createElement('tr');
        
        const typeBadge = t.type === 'deposit' 
            ? `<span class="badge deposit">NẠP TIỀN</span>` 
            : `<span class="badge withdraw">RÚT TIỀN</span>`;

        tr.innerHTML = `
            <td>${t.time}</td>
            <td><strong>${t.user}</strong></td>
            <td>${typeBadge}</td>
            <td style="color:var(--gold-light); font-weight:bold;">${t.amount.toLocaleString('vi-VN')}</td>
            <td>${t.details}</td>
            <td>
                <button class="action-btn btn-approve" onclick="handleTransaction(${t.id}, 'approve')">DUYỆT</button>
                <button class="action-btn btn-reject" onclick="handleTransaction(${t.id}, 'reject')">TỪ CHỐI</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function handleTransaction(id, action) {
    let trans = JSON.parse(localStorage.getItem('casino_transactions')) || [];
    let balances = JSON.parse(localStorage.getItem('casino_balances')) || {};
    
    let tIndex = trans.findIndex(t => t.id === id);
    if (tIndex === -1) return;

    let t = trans[tIndex];
    let user = t.user;

    if (action === 'approve') {
        if (t.type === 'deposit') {
            // Nạp tiền: Cộng tiền cho user
            balances[user] = (balances[user] || 0) + t.amount;
        } else if (t.type === 'withdraw') {
            // Rút tiền: Tiền đã trừ tạm thời ở Lobby lúc tạo yêu cầu
            // Nếu là rút thẻ cào, sinh mã ngay lúc này
            if (t.details.includes('Rút thẻ cào')) {
                let prefixSeri = '1000';
                let prefixPin = '68';
                
                if (t.details.includes('VIETTEL')) {
                    prefixSeri = '1000'; prefixPin = '86';
                } else if (t.details.includes('MOBIFONE')) {
                    prefixSeri = '0000'; prefixPin = '99';
                } else if (t.details.includes('VIETNAMOBILE')) {
                    prefixSeri = '0001'; prefixPin = '77';
                }

                const serial = prefixSeri + Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
                const pin = prefixPin + Math.floor(Math.random() * 1000000000000).toString().padStart(13, '0');
                t.details += `\n- Seri: ${serial}\n- Mã: ${pin}`;
            }
        }
        t.status = 'approved';
        t.notified = false; // Đánh dấu để client hiện thông báo
        alert('Đã DUYỆT giao dịch thành công!');
    } else if (action === 'reject') {
        if (t.type === 'withdraw') {
            // Từ chối rút tiền: Phải hoàn lại tiền cho user
            balances[user] = (balances[user] || 0) + t.amount;
        }
        t.status = 'rejected';
        t.notified = false; // Đánh dấu để client hiện thông báo
        alert('Đã TỪ CHỐI giao dịch!');
    }

    // Save back
    localStorage.setItem('casino_transactions', JSON.stringify(trans));
    localStorage.setItem('casino_balances', JSON.stringify(balances));

    // Reload table
    loadTransactions();
}

// Initial load
loadTransactions();
