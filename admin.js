const socket = io();

// Kiểm tra quyền Admin
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

// Lấy danh sách yêu cầu khi vừa vào trang
socket.emit('adminGetRequests');

socket.on('allRequests', (requests) => {
    renderTable(requests);
});

socket.on('newRequestAlert', (newReq) => {
    alert(`CÓ YÊU CẦU MỚI!\nNgười chơi: ${newReq.username}\nLoại: ${newReq.type}\nSố tiền: ${newReq.amount.toLocaleString()}`);
    socket.emit('adminGetRequests'); // Refresh lại bảng
});

function renderTable(requests) {
    const tbody = document.getElementById('trans-body');
    // Chỉ hiện các yêu cầu đang chờ (pending)
    const pending = requests.filter(r => r.status === 'pending');

    if (pending.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:50px;">Chưa có yêu cầu nào mới.</td></tr>';
        return;
    }

    tbody.innerHTML = pending.map(req => `
        <tr>
            <td>${req.time}</td>
            <td style="color:#ffd700; font-weight:bold;">${req.username}</td>
            <td><span class="badge ${req.type}">${req.type === 'deposit' ? 'NẠP TIỀN' : 'RÚT TIỀN'}</span></td>
            <td style="color:#00ff41; font-weight:bold;">${parseInt(req.amount).toLocaleString()} VNĐ</td>
            <td style="font-size:12px; max-width:250px;">${req.details}</td>
            <td>
                <button class="action-btn btn-approve" onclick="handleAction(${req.id}, 'approved')">DUYỆT</button>
                <button class="action-btn btn-reject" onclick="handleAction(${req.id}, 'rejected')">HỦY</button>
            </td>
        </tr>
    `).join('');
}

window.handleAction = function(requestId, action) {
    if (confirm(`Bạn có chắc muốn ${action === 'approved' ? 'DUYỆT' : 'HỦY'} yêu cầu này không?`)) {
        socket.emit('adminAction', { requestId, action });
        
        // Sau khi duyệt, mình cũng cần cập nhật số dư cho người chơi trong LocalStorage của HỌ
        // Nhưng vì Admin không sửa trực tiếp được LocalStorage của máy người chơi, 
        // nên ta sẽ gửi tín hiệu để máy người chơi tự cập nhật.
        
        socket.emit('adminGetRequests'); // Refresh lại bảng Admin
    }
};

// Lắng nghe kết quả để tự động cập nhật lại bảng nếu có thay đổi từ server
socket.on('requestResult', () => {
    socket.emit('adminGetRequests');
});
