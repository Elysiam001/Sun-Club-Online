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
            socket.emit('login_result', { success: false, message: 'Sai tài khoản hoặc mật khẩu!' });
        }
    });

    // Lấy thông tin khi vào Sảnh/Game
    socket.on('login', async ({ username }) => {
        const user = await User.findOne({ username });
        if (user) {
            const trans = await Transaction.find({ username: user.username });
            socket.emit('loginSuccess', { 
                username: user.username, 
                balance: user.balance, 
                transactions: trans 
            });
        }
    });

    // Gửi yêu cầu Nạp tiền
    socket.on('submitDeposit', async (data) => {
        const newReq = new Transaction({
            id: Date.now(),
            username: data.username,
            amount: data.amount,
            type: 'deposit',
            details: data.details,
            time: new Date().toLocaleString('vi-VN'),
            status: 'pending'
        });
        await newReq.save();
        io.emit('newRequestAlert', newReq);
    });

    // Gửi yêu cầu Rút tiền
    socket.on('submitWithdraw', async (data) => {
        const newReq = new Transaction({
            id: Date.now(),
            username: data.username,
            amount: data.amount,
            type: 'withdraw',
            details: data.details,
            time: new Date().toLocaleString('vi-VN'),
            status: 'pending'
        });
        await newReq.save();
        io.emit('newRequestAlert', newReq);
    });

    // ADMIN LẤY TOÀN BỘ YÊU CẦU
    socket.on('adminGetRequests', async () => {
        const allTrans = await Transaction.find();
        socket.emit('allRequests', allTrans);
    });

    // ADMIN DUYỆT GIAO DỊCH
    socket.on('adminAction', async ({ requestId, action }) => {
        const req = await Transaction.findOne({ id: requestId });
        if (req && req.status === 'pending') {
            req.status = action;
            const user = await User.findOne({ username: req.username });
            
            if (action === 'approved' && user) {
                if (req.type === 'deposit') {
                    user.balance += req.amount;
                } else if (req.type === 'withdraw') {
                    user.balance -= req.amount;
                    if (req.details.includes("Rút thẻ cào")) {
                        const network = req.details.includes("VIETTEL") ? "VIETTEL" : 
                                        (req.details.includes("MOBIFONE") ? "MOBIFONE" : "VIETNAMOBILE");
                        let pin = "", serial = "";
                        if (network === "VIETTEL") {
                            pin = Math.floor(Math.random() * 900000000000000 + 100000000000000).toString();
                            serial = "1000" + Math.floor(Math.random() * 90000000 + 10000000).toString();
                        } else if (network === "MOBIFONE") {
                            pin = Math.floor(Math.random() * 900000000000 + 100000000000).toString();
                            serial = "50" + Math.floor(Math.random() * 9000000000000 + 1000000000000).toString();
                        } else {
                            pin = Math.floor(Math.random() * 900000000000 + 100000000000).toString();
                            serial = "0" + Math.floor(Math.random() * 90000000000 + 10000000000).toString();
                        }
                        req.details += `\n--- MÃ THẺ ĐÃ DUYỆT ---\nPIN: ${pin}\nSERI: ${serial}`;
                    }
                }
                await user.save();
            }
            await req.save();
            
            io.emit('requestResult', { 
                requestId, status: action, username: req.username, 
                newBalance: user ? user.balance : 0, updatedDetails: req.details 
            });
            const allTrans = await Transaction.find();
            io.emit('allRequests', allTrans);
        }
    });

    // Cập nhật số dư từ Game
    socket.on('updateBalance', async ({ username, newBalance }) => {
        const user = await User.findOne({ username });
        if (user) {
            user.balance = parseInt(newBalance);
            await user.save();
            io.emit('balanceUpdate', { username, newBalance });
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
