const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const mongoose = require('mongoose');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// --- KẾT NỐI MONGODB (BẤT TỬ) ---
const MONGO_URI = 'mongodb+srv://admin:123456bg@cluster0.ky7yose.mongodb.net/sun-club?retryWrites=true&w=majority&appName=Cluster0';

console.log('🚀 Đang bắt đầu kết nối MongoDB...');

mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ Đã kết nối MongoDB Atlas thành công!');
        migrateData();
    })
    .catch(err => {
        console.error('❌ LỖI KẾT NỐI MONGODB:', err.message);
    });

// --- ĐỊNH NGHĨA CẤU TRÚC DỮ LIỆU (SCHEMAS) ---
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 5000000 },
    role: { type: String, default: 'user' }
});
const User = mongoose.model('User', userSchema);

const transactionSchema = new mongoose.Schema({
    id: Number,
    username: String,
    amount: Number,
    type: String, // 'deposit', 'withdraw'
    status: { type: String, default: 'pending' },
    details: String,
    time: String,
    notified: { type: Boolean, default: false }
});
const Transaction = mongoose.model('Transaction', transactionSchema);

// --- DI CƯ DỮ LIỆU TỪ DB.JSON ---
async function migrateData() {
    try {
        const userCount = await User.countDocuments();
        if (userCount === 0 && fs.existsSync('db.json')) {
            console.log('📦 Đang di cư dữ liệu từ db.json sang MongoDB...');
            const db = JSON.parse(fs.readFileSync('db.json', 'utf8'));
            
            // Di cư Users
            for (let uname in db.users) {
                await new User({ 
                    username: uname, 
                    password: db.users[uname].password,
                    balance: db.users[uname].balance || 0,
                    role: db.users[uname].role || 'user'
                }).save();
            }
            // Di cư Transactions
            if (db.transactions && db.transactions.length > 0) {
                await Transaction.insertMany(db.transactions);
            }
            console.log('✅ Di cư hoàn tất!');
        }
    } catch (err) {
        console.error('❌ Lỗi di cư dữ liệu:', err);
    }
}

app.use(express.static(path.join(__dirname)));

io.on('connection', (socket) => {
    // Đăng ký
    socket.on('register', async ({ username, password }) => {
        try {
            const existingUser = await User.findOne({ username });
            if (existingUser) {
                socket.emit('register_result', { success: false, message: 'Tài khoản đã tồn tại!' });
            } else {
                await new User({ username, password }).save();
                socket.emit('register_result', { success: true, message: 'Đăng ký thành công!' });
            }
        } catch (err) {
            socket.emit('register_result', { success: false, message: 'Lỗi hệ thống!' });
        }
    });

    // Kiểm tra đăng nhập
    socket.on('login_check', async ({ username, password }) => {
        const user = await User.findOne({ username, password });
        if (user) {
            socket.emit('login_result', { success: true, username: user.username });
        } else {
            socket.emit('login_result', { success: false, message: 'Sai tài khoản hoặc mật khẩu!' });
        }
    });

    // Vào Sảnh/Game
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

    // Gửi yêu cầu Nạp
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

    // Gửi yêu cầu Rút
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

    // Admin lấy danh sách
    socket.on('adminGetRequests', async () => {
        const allTrans = await Transaction.find();
        socket.emit('allRequests', allTrans);
    });

    // Admin duyệt
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

    // --- BẢNG XẾP HẠNG THẬT TỪ DATABASE ---
    socket.on('getLeaderboard', async () => {
        try {
            const topUsers = await User.find()
                .sort({ balance: -1 })
                .limit(50)
                .select('username balance');
            
            const leaderboard = topUsers.map(u => ({
                name: u.username === 'admin' ? 'Nhà Cái' : (u.username.length > 3 ? u.username.substring(0, 3) + '***' + u.username.substring(u.username.length - 2) : u.username),
                money: u.balance,
                isMe: false // Sẽ xử lý ở client
            }));
            
            socket.emit('leaderboardData', leaderboard);
        } catch (err) {
            console.error('Lỗi lấy BXH:', err);
        }
    });

    socket.on('disconnect', () => {});

    // --- LOGIC TÀI XỈU TẬP TRUNG (SERVER-SIDE) ---
    socket.on('taixiuJoin', () => {
        socket.emit('taixiuState', taixiuState);
    });

    socket.on('taixiuBet', async ({ username, side, amount }) => {
        if (taixiuState.phase !== 'betting') return;
        
        const user = await User.findOne({ username });
        if (user && user.balance >= amount) {
            user.balance -= amount;
            await user.save();

            // Lưu cược vào Server
            if (!taixiuState.bets[username]) {
                taixiuState.bets[username] = { tai: 0, xiu: 0 };
            }
            taixiuState.bets[username][side] += amount;
            taixiuState.totalPool[side] += amount;
            taixiuState.totalUsers[side]++;

            socket.emit('balanceUpdate', { username, newBalance: user.balance });
            socket.emit('taixiuBetSuccess', { side, amount });
            
            // Cập nhật pool cho tất cả mọi người thấy tiền đang nhảy
            io.emit('taixiuPoolUpdate', taixiuState.totalPool);
        } else {
            socket.emit('taixiuError', 'Số dư không đủ!');
        }
    });
});

// --- QUẢN LÝ GAME TÀI XỈU (VÒNG LẶP VĨNH CỬU) ---
let taixiuState = {
    timer: 25,
    phase: 'betting', // 'betting', 'result'
    dices: [1, 1, 1],
    totalPool: { tai: 0, xiu: 0 },
    totalUsers: { tai: 0, xiu: 0 },
    bets: {}, // { username: { tai: 0, xiu: 0 } }
    history: []
};

function taixiuLoop() {
    taixiuState.timer--;

    if (taixiuState.timer <= 0) {
        if (taixiuState.phase === 'betting') {
            // Chuyển sang giai đoạn kết quả
            taixiuState.phase = 'result';
            taixiuState.timer = 15; // 15 giây chờ kết quả và reset

            // Quay xúc xắc
            taixiuState.dices = [
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1
            ];

            const total = taixiuState.dices[0] + taixiuState.dices[1] + taixiuState.dices[2];
            const isTai = total >= 11;
            const isXiu = total <= 10;

            // Tính toán trả thưởng
            processWinners(isTai, isXiu, total);

            // Gửi kết quả cho tất cả mọi người
            io.emit('taixiuResult', {
                dices: taixiuState.dices,
                total: total,
                isTai: isTai
            });

            // Lưu lịch sử
            taixiuState.history.push({ total, isTai });
            if (taixiuState.history.length > 20) taixiuState.history.shift();

        } else {
            // Reset ván mới
            taixiuState.phase = 'betting';
            taixiuState.timer = 25;
            taixiuState.totalPool = { tai: 0, xiu: 0 };
            taixiuState.totalUsers = { tai: 0, xiu: 0 };
            taixiuState.bets = {};
            io.emit('taixiuReset', taixiuState);
        }
    }

    // Gửi giây đếm ngược cho tất cả máy khách
    io.emit('taixiuTick', {
        timer: taixiuState.timer,
        phase: taixiuState.phase,
        totalPool: taixiuState.totalPool,
        totalUsers: taixiuState.totalUsers
    });
}

async function processWinners(isTai, isXiu, total) {
    const winningSide = isTai ? 'tai' : (isXiu ? 'xiu' : null);
    
    for (let username in taixiuState.bets) {
        const userBets = taixiuState.bets[username];
        let winAmount = 0;

        if (winningSide && userBets[winningSide] > 0) {
            winAmount = userBets[winningSide] * 2;
        }

        if (winAmount > 0) {
            try {
                const user = await User.findOne({ username });
                if (user) {
                    user.balance += winAmount;
                    await user.save();
                    // Thông báo riêng cho người thắng
                    io.emit('balanceUpdate', { username, newBalance: user.balance });
                    io.emit('taixiuWin', { username, winAmount });
                }
            } catch (err) {
                console.error('Lỗi trả thưởng:', err);
            }
        }
    }
}

setInterval(taixiuLoop, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
