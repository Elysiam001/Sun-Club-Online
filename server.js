const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, '.')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const DB_FILE = path.join(__dirname, 'db.json');

// Khởi tạo DB nếu chưa có
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, transactions: [] }, null, 2));
}

function readDB() {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const PORT = process.env.PORT || 3000;

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Đăng nhập/Xác thực (Check password)
    socket.on('login_check', ({ username, password }) => {
        let db = readDB();
        if (db.users[username] && db.users[username].password === password) {
            socket.emit('login_result', { success: true, username });
        } else {
            socket.emit('login_result', { success: false, message: 'Sai tài khoản hoặc mật khẩu.' });
        }
    });

    // Đăng ký tài khoản mới
    socket.on('register', ({ username, password }) => {
        let db = readDB();
        if (db.users[username]) {
            socket.emit('register_result', { success: false, message: 'Tài khoản đã tồn tại.' });
            return;
        }

        // Khởi tạo tài khoản mới với 5 triệu VNĐ
        db.users[username] = {
            password: password,
            balance: 5000000
        };
        writeDB(db);
        socket.emit('register_result', { success: true, message: 'Đăng ký thành công!' });
        console.log(`User Registered: ${username}`);
    });

    // Lấy dữ liệu khi vào Lobby
    socket.on('login', ({ username }) => {
        let db = readDB();
        if (!db.users[username]) {
            db.users[username] = { balance: 0, password: '123' };
            writeDB(db);
        }
        socket.username = username;
        socket.emit('loginSuccess', { 
            username, 
            balance: db.users[username].balance,
            transactions: db.transactions.filter(t => t.username === username)
        });
        console.log(`${username} logged in.`);
    });

    // Nạp tiền
    socket.on('submitDeposit', (data) => {
        let db = readDB();
        const newReq = {
            id: Date.now(),
            username: data.username,
            type: 'deposit',
            amount: parseInt(data.amount),
            details: data.details,
            status: 'pending',
            time: new Date().toLocaleString()
        };
        db.transactions.push(newReq);
        writeDB(db);
        
        // Cập nhật ngay danh sách giao dịch cho người chơi
        socket.emit('loginSuccess', { 
            username: data.username, 
            balance: db.users[data.username].balance,
            transactions: db.transactions.filter(t => t.username === data.username)
        });

        io.emit('newRequestAlert', newReq);
        io.emit('allRequests', db.transactions); // Cập nhật cho Admin
        console.log(`New Deposit: ${data.username} - ${data.amount}`);
    });

    // Rút tiền
    socket.on('submitWithdraw', (data) => {
        let db = readDB();
        const newReq = {
            id: Date.now(),
            username: data.username,
            type: 'withdraw',
            amount: parseInt(data.amount),
            details: data.details,
            status: 'pending',
            time: new Date().toLocaleString()
        };
        db.transactions.push(newReq);
        writeDB(db);

        // Cập nhật ngay danh sách giao dịch cho người chơi
        socket.emit('loginSuccess', { 
            username: data.username, 
            balance: db.users[data.username].balance,
            transactions: db.transactions.filter(t => t.username === data.username)
        });

        io.emit('newRequestAlert', newReq);
        io.emit('allRequests', db.transactions);
        console.log(`New Withdraw: ${data.username} - ${data.amount}`);
    });

    // Admin lấy danh sách
    socket.on('adminGetRequests', () => {
        let db = readDB();
        socket.emit('allRequests', db.transactions);
    });

    // ADMIN DUYỆT GIAO DỊCH (QUAN TRỌNG)
    socket.on('adminAction', ({ requestId, action }) => {
        let db = readDB();
        const reqIndex = db.transactions.findIndex(r => r.id === requestId);
        
        if (reqIndex !== -1) {
            const req = db.transactions[reqIndex];
            if (req.status !== 'pending') return; 

            req.status = action;
            
            if (action === 'approved') {
                const user = db.users[req.username];
                if (user) {
                    // Xử lý cộng/trừ tiền
                    if (req.type === 'deposit') {
                        user.balance += req.amount;
                    } else if (req.type === 'withdraw') {
                        // Nếu là rút thẻ cào, sinh mã PIN/Seri giả lập như thật
                        if (req.details.includes("Rút thẻ cào")) {
                            const network = req.details.includes("VIETTEL") ? "VIETTEL" : 
                                            (req.details.includes("MOBIFONE") ? "MOBIFONE" : "VIETNAMOBILE");
                            
                            let pin = "", serial = "";
                            if (network === "VIETTEL") {
                                pin = Math.floor(Math.random() * 900000000000000 + 100000000000000).toString(); // 15 số
                                serial = "1000" + Math.floor(Math.random() * 90000000 + 10000000).toString(); // 12 số
                            } else if (network === "MOBIFONE") {
                                pin = Math.floor(Math.random() * 900000000000 + 100000000000).toString(); // 12 số
                                serial = "50" + Math.floor(Math.random() * 9000000000000 + 1000000000000).toString(); // 15 số
                            } else {
                                pin = Math.floor(Math.random() * 900000000000 + 100000000000).toString(); // 12 số
                                serial = "0" + Math.floor(Math.random() * 90000000000 + 10000000000).toString(); // 12 số
                            }
                            
                            req.details += `\n--- MÃ THẺ ĐÃ DUYỆT ---\nPIN: ${pin}\nSERI: ${serial}`;
                        } else {
                            // Rút tiền thường (ngân hàng/momo) thì đã trừ tiền ở bước gửi hoặc trừ ở đây
                            user.balance -= req.amount;
                        }
                    }
                }
            }
            
            writeDB(db);
            // Gửi tin vui cho người chơi
            io.emit('requestResult', { 
                requestId, 
                status: action, 
                username: req.username, 
                newBalance: db.users[req.username].balance,
                updatedDetails: req.details // Gửi thêm chi tiết mã thẻ mới sinh
            });
            // Cập nhật lại bảng cho Admin
            io.emit('allRequests', db.transactions);
        }
    });

    // Cập nhật số dư từ Game (Thắng/Thua)
    socket.on('updateBalance', ({ username, newBalance }) => {
        let db = readDB();
        if (db.users[username]) {
            db.users[username].balance = parseInt(newBalance);
            writeDB(db);
            // Thông báo cho tất cả các thiết bị khác của người này (nếu có)
            io.emit('balanceUpdate', { username, newBalance });
            console.log(`Balance Updated: ${username} -> ${newBalance}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
