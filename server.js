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
const taixiuState = {
    timer: 60,
    phase: 'betting',
    dices: [1, 2, 3],
    totalPool: { tai: 0, xiu: 0 },
    totalUsers: { tai: 0, xiu: 0 },
    bets: {},
    history: [],
    pendingPayouts: [],
    // Số liệu ảo
    fakeTai: { users: 1500, pool: 500000000 },
    fakeXiu: { users: 1200, pool: 450000000 }
};

function taixiuLoop() {
    taixiuState.timer--;

    if (taixiuState.phase === 'betting') {
        // Nhảy số ảo cho sinh động (Tăng dần mỗi giây)
        taixiuState.fakeTai.users += Math.floor(Math.random() * 3) + 1;
        taixiuState.fakeXiu.users += Math.floor(Math.random() * 3) + 1;
        taixiuState.fakeTai.pool += (Math.floor(Math.random() * 5) + 1) * 500000;
        taixiuState.fakeXiu.pool += (Math.floor(Math.random() * 5) + 1) * 500000;

        if (taixiuState.timer <= 0) {
            taixiuState.phase = 'result';
            taixiuState.timer = 15;
            taixiuState.dices = [
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1,
                Math.floor(Math.random() * 6) + 1
            ];
            // Tính toán người thắng ngay khi có kết quả
            const total = taixiuState.dices[0] + taixiuState.dices[1] + taixiuState.dices[2];
            calculateWinners(total >= 11, total <= 10, total);
        }
    } else {
        if (taixiuState.timer <= 0) {
            taixiuState.phase = 'betting';
            taixiuState.timer = 25; // Thời gian cược 25 giây
            
            // Reset số liệu ảo ván mới (Bắt đầu từ con số nhỏ)
            taixiuState.fakeTai = { users: 100 + Math.floor(Math.random() * 200), pool: Math.floor(Math.random() * 50) * 1000000 };
            taixiuState.fakeXiu = { users: 100 + Math.floor(Math.random() * 200), pool: Math.floor(Math.random() * 50) * 1000000 };
            
            executePayouts();

            taixiuState.totalPool = { tai: 0, xiu: 0 };
            taixiuState.totalUsers = { tai: 0, xiu: 0 };
            taixiuState.bets = {};
            io.emit('taixiuReset', taixiuState);
        }
    }

    // Gửi dữ liệu đầy đủ cho Client
    io.emit('taixiuTick', {
        timer: taixiuState.timer,
        phase: taixiuState.phase,
        totalPool: taixiuState.totalPool,
        totalUsers: taixiuState.totalUsers,
        fakeTai: taixiuState.fakeTai,
        fakeXiu: taixiuState.fakeXiu,
        dices: taixiuState.dices
    });
}

function calculateWinners(isTai, isXiu, total) {
    const winningSide = isTai ? 'tai' : (isXiu ? 'xiu' : null);
    taixiuState.pendingPayouts = [];
    
    for (let username in taixiuState.bets) {
        const userBets = taixiuState.bets[username];
        let winAmount = 0;
        if (winningSide && userBets[winningSide] > 0) {
            winAmount = userBets[winningSide] * 2;
        }
        if (winAmount > 0) {
            taixiuState.pendingPayouts.push({ username, winAmount });
        }
    }
}

async function executePayouts() {
    for (let payout of taixiuState.pendingPayouts) {
        try {
            const user = await User.findOne({ username: payout.username });
            if (user) {
                user.balance += payout.winAmount;
                await user.save();
                io.emit('balanceUpdate', { username: user.username, newBalance: user.balance });
                io.emit('taixiuWin', { username: user.username, winAmount: payout.winAmount });
            }
        } catch (err) {
            console.error('Lỗi trả thưởng trì hoãn:', err);
        }
    }
    taixiuState.pendingPayouts = []; // Xóa danh sách sau khi đã trả xong
}

setInterval(taixiuLoop, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
