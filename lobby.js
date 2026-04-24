// --- Authentication & Setup ---
const currentUser = sessionStorage.getItem('casino_currentUser');
const currentRole = sessionStorage.getItem('casino_role');
let serverBalance = 0; // Số dư thực tế từ Server
let serverTransactions = []; // Lịch sử thực tế từ Server

if (!currentUser || currentRole !== 'user') {
    window.location.href = 'index.html';
}

document.getElementById('player-name').textContent = currentUser;

// --- Socket.io Connection ---
const socket = io();

socket.on('connect', () => {
    // Đăng nhập vào Server để lấy dữ liệu thực tế
    socket.emit('login', { username: currentUser });
});

// Khi Server gửi dữ liệu tài khoản về
socket.on('loginSuccess', (data) => {
    serverBalance = data.balance;
    serverTransactions = data.transactions || []; // Lưu lịch sử từ Server gửi về
    updateBalanceDisplay();
    console.log("Dữ liệu tài khoản & Lịch sử đã đồng bộ từ Server.");
});

// Lắng nghe biến động số dư từ Game (Thắng/Thua)
socket.on('balanceUpdate', (data) => {
    if (data.username === currentUser) {
        serverBalance = data.newBalance;
        updateBalanceDisplay();
    }
});

// Lắng nghe kết quả từ Admin Duyệt/Hủy
socket.on('requestResult', ({ requestId, status, username, newBalance, updatedDetails }) => {
    if (username === currentUser) {
        serverBalance = newBalance;
        
        // Cập nhật trạng thái và CHI TIẾT MÃ THẺ trong danh sách giao dịch
        const tIdx = serverTransactions.findIndex(t => t.id === requestId);
        if (tIdx !== -1) {
            serverTransactions[tIdx].status = status;
            if (updatedDetails) {
                serverTransactions[tIdx].details = updatedDetails;
            }
        }

        updateBalanceDisplay();
        
        const statusText = status === 'approved' ? 'THÀNH CÔNG' : 'BỊ TỪ CHỐI';
        let alertMsg = `Yêu cầu (ID: ${requestId}) của sếp đã được ${statusText}!`;
        
        // Nếu là rút thẻ và thành công, hiện luôn mã thẻ cho khách mừng
        if (status === 'approved' && updatedDetails && updatedDetails.includes("MÃ THẺ")) {
            alertMsg += `\n\n${updatedDetails}`;
        }

        showCustomAlert(alertMsg, status === 'approved' ? 'GIAO DỊCH THÀNH CÔNG' : 'THÔNG BÁO');
        
        // Cập nhật lại tab lịch sử nếu đang mở
        const historyTab = document.getElementById('dep-history');
        if (historyTab && !historyTab.classList.contains('hidden')) loadTransactionHistory('deposit');
        const wdHistoryTab = document.getElementById('wd-history');
        if (wdHistoryTab && !wdHistoryTab.classList.contains('hidden')) loadTransactionHistory('withdraw');
    }
});

function getBalance() {
    return serverBalance;
}

function updateBalanceDisplay() {
    const display = document.getElementById('player-balance');
    if (display) {
        display.textContent = serverBalance.toLocaleString('vi-VN');
    }
    // Cập nhật cả số dư trong các modal nạp/rút nếu đang mở
    const wdBalanceEl = document.getElementById('wd-current-balance-new');
    if (wdBalanceEl) wdBalanceEl.textContent = serverBalance.toLocaleString('vi-VN');
}

// Đăng ký sự kiện click cho nút Alert để chắc chắn nó hoạt động
document.addEventListener('DOMContentLoaded', () => {
    const alertBtn = document.querySelector('.alert-ok-btn');
    if (alertBtn) {
        alertBtn.addEventListener('click', () => {
            window.closeAlert();
        });
    }
});

// --- Navigation ---
document.getElementById('btn-logout').addEventListener('click', () => {
    sessionStorage.removeItem('casino_currentUser');
    sessionStorage.removeItem('casino_role');
    window.location.href = 'index.html';
});

document.getElementById('game-taixiu').addEventListener('click', () => {
    window.location.href = 'taixiu.html';
});

// --- Modals Logic ---
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
}

// --- Gán sự kiện cho nút Nạp & Rút mới ---
document.addEventListener('DOMContentLoaded', () => {
    // Nút dấu + cạnh số dư (Nạp tiền)
    const btnDep = document.getElementById('btn-deposit-top');
    if (btnDep) {
        btnDep.addEventListener('click', () => openModal('deposit-modal'));
    }

    // Nút Rút Tiền to đùng ở thanh dưới
    const btnWd = document.getElementById('btn-withdraw-center');
    if (btnWd) {
        btnWd.addEventListener('click', () => openModal('withdraw-modal'));
    }
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
        modal.style.display = 'flex'; // Ép hiển thị
        modal.classList.remove('hidden');
    }
};

window.closeAlert = function() {
    console.log('Closing alert button clicked');
    const modal = document.getElementById('custom-alert-modal');
    if (modal) {
        modal.style.display = 'none'; // Ép ẩn
        modal.classList.add('hidden');
    }
};

// --- Check Admin Notifications ---
function checkTransactionNotifications() {
    // Để trống vì đã có socket.on('requestResult') xử lý thông báo tức thì
}
setInterval(checkTransactionNotifications, 5000); // Check mỗi 5 giây

// --- Dynamic Marquee Logic (Fake Winners) ---
const fakeNames = ['anh_ba_khia', 'be_heo_9x', 'ga_con_lon_ton', 'than_bai_88', 'dai_gia_pho_nui', 'kiem_the_vo_song', 'trum_tai_xiu', 'cong_tu_bac_lieu', 'rua_con_it', 'dai_bang_lua'];
const fakeGames = ['Tài Xỉu', 'Slot Đá Quý', 'Bắn Cá', 'Siêu Hũ Rik', 'Mini Poker'];

function updateDynamicMarquee() {
    const marquee = document.getElementById('marquee-text');
    if (!marquee) return;

    const randomName = fakeNames[Math.floor(Math.random() * fakeNames.length)];
    const randomGame = fakeGames[Math.floor(Math.random() * fakeGames.length)];
    const randomAmount = Math.floor(Math.random() * 500 + 50) * 1000000; // 50M to 550M
    
    const newText = `Chúc mừng người chơi <span style="color:#ffd700">${randomName}</span> vừa nổ hũ thắng lớn <span style="color:#ffd700">${randomAmount.toLocaleString()} VNĐ</span> tại game ${randomGame}. Chào mừng bạn đến với cổng game uy tín nhất!`;
    
    // Đợi marquee chạy hết một vòng rồi mới đổi text để mượt mà (xấp xỉ)
    marquee.innerHTML = newText;
}
setInterval(updateDynamicMarquee, 15000); // Đổi thông báo mỗi 15 giây
updateDynamicMarquee(); // Chạy ngay lần đầu

// Mở Deposit Modal
document.getElementById('btn-deposit-top').addEventListener('click', () => {
    // Generate random code for transfer content
    const code = 'NAP' + Math.floor(Math.random() * 1000000);
    document.getElementById('dep-content-code-new').textContent = code;
    openModal('deposit-modal');
});

function copyText(id) {
    const text = document.getElementById(id).textContent;
    navigator.clipboard.writeText(text).then(() => {
        showCustomAlert('Đã sao chép: ' + text);
    });
}

let selectedCardType = 'VIETTEL';
let selectedCardPrice = 50000;

function selectCardType(type, el) {
    selectedCardType = type;
    document.querySelectorAll('.card-type-item').forEach(item => item.classList.remove('active'));
    el.classList.add('active');
}

function selectCardPrice(price, el) {
    selectedCardPrice = price;
    document.querySelectorAll('.price-row').forEach(row => row.classList.remove('active'));
    el.classList.add('active');
}

function switchDepTab(tab) {
    document.querySelectorAll('.dep-tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dep-tab-pane').forEach(p => p.classList.add('hidden'));

    if (tab === 'bank') {
        document.querySelectorAll('.dep-tab-btn')[0].classList.add('active');
        document.getElementById('dep-bank').classList.remove('hidden');
    } else if (tab === 'card') {
        document.querySelectorAll('.dep-tab-btn')[1].classList.add('active');
        document.getElementById('dep-card').classList.remove('hidden');
    } else if (tab === 'momo') {
        document.querySelectorAll('.dep-tab-btn')[2].classList.add('active');
        document.getElementById('dep-momo').classList.remove('hidden');
    } else {
        document.querySelectorAll('.dep-tab-btn')[3].classList.add('active');
        document.getElementById('dep-history').classList.remove('hidden');
        loadTransactionHistory('deposit');
    }
}

function generateMomoQR() {
    const amount = document.getElementById('dep-momo-amount').value;
    if (!amount || amount < 10000) {
        showCustomAlert("Vui lòng nhập số tiền nạp tối thiểu là 10,000 VNĐ");
        return;
    }

    const content = document.getElementById('dep-content-code-new').textContent;
    const bankId = "MB"; // Ngân hàng Quân Đội (Momo quét cực mượt)
    const accountNo = "0395420402";
    const accountName = "TONG VAN DUNG";
    
    // Link tạo QR tự động từ VietQR.io (Miễn phí & Chuyên nghiệp)
    const qrUrl = `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?amount=${amount}&addInfo=${content}&accountName=${encodeURIComponent(accountName)}`;
    
    const qrArea = document.getElementById('momo-qr-area');
    const qrImg = document.getElementById('momo-qr-img');
    
    if (qrArea && qrImg) {
        qrImg.src = qrUrl;
        qrArea.classList.remove('hidden');
        showCustomAlert("Đã tạo mã QR thành công! Vui lòng quét mã để thanh toán.", "THÀNH CÔNG");
    }
}

// Mở Withdraw Modal
document.getElementById('btn-withdraw-center').addEventListener('click', () => {
    document.getElementById('wd-current-balance-new').textContent = getBalance().toLocaleString('vi-VN');
    openModal('withdraw-modal');
});

function switchWdTab(tab) {
    document.querySelectorAll('#withdraw-modal .dep-tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('#withdraw-modal .dep-tab-pane').forEach(p => p.classList.add('hidden'));

    if (tab === 'bank') {
        document.querySelectorAll('#withdraw-modal .dep-tab-btn')[0].classList.add('active');
        document.getElementById('wd-bank').classList.remove('hidden');
    } else if (tab === 'card') {
        document.querySelectorAll('#withdraw-modal .dep-tab-btn')[1].classList.add('active');
        document.getElementById('wd-card').classList.remove('hidden');
    } else if (tab === 'momo') {
        document.querySelectorAll('#withdraw-modal .dep-tab-btn')[2].classList.add('active');
        document.getElementById('wd-momo').classList.remove('hidden');
    } else {
        document.querySelectorAll('#withdraw-modal .dep-tab-btn')[3].classList.add('active');
        document.getElementById('wd-history').classList.remove('hidden');
        loadTransactionHistory('withdraw');
    }
    // Cập nhật số dư trong modal rút tiền luôn
    const wdBalanceEl = document.getElementById('wd-current-balance-new');
    if (wdBalanceEl) wdBalanceEl.textContent = serverBalance.toLocaleString('vi-VN');
}

function getFakeOTP() {
    const otp = Math.floor(100000 + Math.random() * 900000);
    showCustomAlert("Mã OTP của bạn là: " + otp, "MÃ XÁC THỰC");
    document.getElementById('wd-otp').value = otp;
}

let selectedWdCardType = 'VIETTEL';
let selectedWdCardPrice = 50000;

function selectWdCardType(type, el) {
    selectedWdCardType = type;
    document.querySelectorAll('#wd-card .card-type-item').forEach(item => item.classList.remove('active'));
    el.classList.add('active');
}

function selectWdCardPrice(price, el) {
    selectedWdCardPrice = price;
    document.querySelectorAll('#wd-card .price-row').forEach(row => row.classList.remove('active'));
    el.classList.add('active');
}

function loadTransactionHistory(filterType) {
    const containerId = filterType === 'deposit' ? 'dep-history-list' : 'wd-history-list';
    const container = document.getElementById(containerId);
    if (!container) return;

    // Lọc giao dịch từ dữ liệu Server gửi về
    let userTrans = serverTransactions.filter(t => (filterType === 'deposit' ? t.type === 'deposit' : (t.type === 'withdraw' || t.type === 'withdraw_card_auto'))).reverse();

    if (userTrans.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:50px; color:#888;">Chưa có giao dịch nào.</div>';
        return;
    }

    container.innerHTML = userTrans.map(t => {
        let statusClass = 'status-pending';
        let statusText = 'Đang chờ';
        if (t.status === 'approved') {
            statusClass = 'status-approved';
            statusText = 'Thành công';
        } else if (t.status === 'rejected') {
            statusClass = 'status-rejected';
            statusText = 'Bị từ chối';
        }

        return `
            <div class="history-item">
                <div class="hist-top">
                    <span class="hist-time">${t.time}</span>
                    <span class="hist-status ${statusClass}">${statusText}</span>
                </div>
                <div class="hist-mid">
                    <span class="hist-amount">${t.amount.toLocaleString()} VNĐ</span>
                </div>
                <div class="hist-bot">
                    <p class="hist-details">${t.details.replace(/\n/g, '<br>')}</p>
                </div>
            </div>
        `;
    }).join('');
}

function submitDeposit(method) {
    let amount = 0;
    let details = '';

    if (method === 'bank') {
        amount = parseInt(document.getElementById('dep-bank-amount-new').value);
        if (!amount || amount < 10000) {
            showCustomAlert("Số tiền nạp tối thiểu là 10,000");
            return;
        }
        details = `Ngân hàng MB - Mã: ${document.getElementById('dep-content-code-new').textContent}`;
    } else {
        amount = selectedCardPrice;
        const type = selectedCardType;
        const pin = document.getElementById('dep-card-pin-new').value;
        const serial = document.getElementById('dep-card-serial-new').value;
        if (!pin || !serial) {
            showCustomAlert("Vui lòng nhập đầy đủ mã PIN và Serial");
            return;
        }
        details = `Thẻ cào ${type} - PIN: ${pin} - Seri: ${serial} - Mệnh giá: ${amount}`;
    }

    // Gửi thẳng lên Server
    socket.emit('submitDeposit', { username: currentUser, amount, details });
    
    showCustomAlert('Đã gửi yêu cầu nạp tiền! Vui lòng chờ Admin duyệt.');
    closeModal('deposit-modal');
}

function submitWithdraw() {
    const amount = parseInt(document.getElementById('wd-amount-new').value);
    const bank = document.getElementById('wd-bank-name-new').value;
    const accNo = document.getElementById('wd-account-no-new').value;
    const accName = document.getElementById('wd-account-name-new').value;
    const otp = document.getElementById('wd-otp').value;

    if (!amount || amount < 50000) {
        showCustomAlert("Số tiền rút tối thiểu là 50,000");
        return;
    }
    if (amount > getBalance()) {
        showCustomAlert("Số dư không đủ!");
        return;
    }
    if (!accNo || !accName || !otp) {
        showCustomAlert("Vui lòng nhập đầy đủ thông tin và mã OTP");
        return;
    }

    let details = `Rút về: ${bank} - ${accNo} - ${accName} (OTP: ${otp})`;
    // Gửi lên Server (Server sẽ tự trừ tiền khi Admin Duyệt)
    socket.emit('submitWithdraw', { username: currentUser, amount, details });

    showCustomAlert('Đã gửi yêu cầu rút tiền! Vui lòng chờ Admin duyệt.');
    closeModal('withdraw-modal');
}

function submitWithdrawCard() {
    const amount = selectedWdCardPrice;
    if (amount > getBalance()) {
        showCustomAlert("Số dư không đủ!");
        return;
    }
    
    let details = `Rút thẻ cào: ${selectedWdCardType} - Mệnh giá: ${amount}`;
    socket.emit('submitWithdraw', { username: currentUser, amount, details });
    
    showCustomAlert(`Yêu cầu rút thẻ cào ${selectedWdCardType} đã được gửi!\nVui lòng chờ Admin duyệt để nhận mã thẻ.`, "GỬI YÊU CẦU THÀNH CÔNG");
    closeModal('withdraw-modal');
}

function submitWithdrawMomo() {
    const amount = parseInt(document.getElementById('wd-momo-amount').value);
    const phone = document.getElementById('wd-momo-phone').value;
    const name = document.getElementById('wd-momo-name').value;

    if (!amount || amount < 50000) {
        showCustomAlert("Số tiền rút tối thiểu là 50,000");
        return;
    }
    if (amount > getBalance()) {
        showCustomAlert("Số dư không đủ!");
        return;
    }
    if (!phone || !name) {
        showCustomAlert("Vui lòng nhập đầy đủ thông tin Momo");
        return;
    }

    let details = `Rút về Momo: ${phone} - ${name}`;
    addTransaction('withdraw', amount, details);
    showCustomAlert('Yêu cầu rút tiền Momo đã gửi!');
    closeModal('withdraw-modal');
}

// --- Menu Bottom Buttons Logic ---

// Mở Tài Xỉu khi click vào card game
const gameTaiXiu = document.getElementById('game-taixiu');
if (gameTaiXiu) {
    gameTaiXiu.addEventListener('click', () => {
        window.location.href = 'taixiu.html';
    });
}

// Sự kiện
document.getElementById('btn-event').addEventListener('click', () => {
    showCustomAlert("KHUYẾN MÃI CỰC KHỦNG:\n1. X2 Nạp lần đầu cho tân thủ.\n2. Đua TOP Tài Xỉu nhận ngay 100M VNĐ.\n3. Hoàn trả 1.5% mỗi ngày cho VIP.", "SỰ KIỆN HOT");
});

// Luật chơi
document.getElementById('btn-rules').addEventListener('click', () => {
    showCustomAlert("LUẬT CHƠI CƠ BẢN:\n\n1. TIẾN LÊN: Sử dụng bộ bài 52 lá, mỗi người 13 lá. Đánh theo vòng, ai hết bài trước thắng. Thứ tự bài: 3 < 4 < ... < A < 2. Chất: Bích < Chuồn < Rô < Cơ.\n\n2. PHỎM: Mỗi người 9 lá (Chủ bàn 10). Ăn bài hoặc bốc bài để tạo Phỏm (3 lá cùng số hoặc sảnh cùng chất). Kết thúc ai ít điểm nhất thắng.\n\n3. TÀI XỈU: Tổng 3 xúc xắc 4-10 là XỈU, 11-17 là TÀI. Nhân đôi tiền cược nếu đoán đúng.", "LUẬT CHƠI");
});

// Mở Tiến Lên
const gameTienLen = document.getElementById('game-tienlen');
if (gameTienLen) {
    gameTienLen.addEventListener('click', () => {
        window.location.href = 'cardgames.html?game=tienlen';
    });
}

// Mở Phỏm
const gamePhom = document.getElementById('game-phom');
if (gamePhom) {
    gamePhom.addEventListener('click', () => {
        window.location.href = 'cardgames.html?game=phom';
    });
}

// Hotline
document.getElementById('btn-hotline').addEventListener('click', () => {
    showCustomAlert("TỔNG ĐÀI HỖ TRỢ 24/7:\n0395.420.402 (Hỗ trợ trực tiếp)\nChúng tôi luôn sẵn sàng phục vụ sếp!", "HỖ TRỢ TRỰC TUYẾN");
});

// Live Chat
document.getElementById('btn-livechat').addEventListener('click', () => {
    showCustomAlert("Kênh Live Chat đang được bảo trì.\nVui lòng nhắn tin trực tiếp qua Telegram:\n@SunClub_Admin để được hỗ trợ nhanh nhất.", "CHĂM SÓC KHÁCH HÀNG");
});

// --- Fullscreen Toggle Logic ---
const btnFullscreen = document.getElementById('btn-fullscreen');
if (btnFullscreen) {
    btnFullscreen.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            // Vào chế độ toàn màn hình
            document.documentElement.requestFullscreen().catch(err => {
                showCustomAlert(`Không thể bật toàn màn hình: ${err.message}`);
            });
            btnFullscreen.innerHTML = '<i class="fa-solid fa-compress"></i><span>Thu Nhỏ</span>';
        } else {
            // Thoát chế độ toàn màn hình
            if (document.exitFullscreen) {
                document.exitFullscreen();
                btnFullscreen.innerHTML = '<i class="fa-solid fa-expand"></i><span>Phóng To</span>';
            }
        }
    });
}
