// server/index.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const { v4: uuidv4 } = require('uuid'); // For generating unique IDs

const app = express();
app.use(cors());
app.use(express.json()); // To parse JSON bodies from admin API calls

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173", // Your React app's address
        methods: ["GET", "POST"]
    }
});

const PORT = 3001;

// --- Room Management ---
const activeRooms = {}; // Stores { roomCode: { ..., users: { socketId: string, userId: string, userType: string }[], ... } }
const ROOM_EXPIRATION_TIME = 24 * 60 * 60 * 1000; // 24 hours
const MAX_USERS_PER_ROOM = 6; 

// Function to clean up expired rooms
function cleanupExpiredRooms() {
    const now = Date.now();
    for (const roomCode in activeRooms) {
        if (activeRooms[roomCode].expiresAt < now) {
            console.log(`Room ${roomCode} expired and is being removed.`);
            delete activeRooms[roomCode];
        }
    }
    setTimeout(cleanupExpiredRooms, 60 * 60 * 1000); // Run every hour
}
cleanupExpiredRooms();

// --- Admin API Endpoints ---
app.post('/admin/create-room', (req, res) => {
    const { creatorName } = req.body;
    if (!creatorName) {
        return res.status(400).json({ message: "Creator name is required." });
    }

    let roomCode;
    do {
        roomCode = uuidv4().slice(0, 8);
    } while (activeRooms[roomCode]);

    const expiresAt = Date.now() + ROOM_EXPIRATION_TIME;
    activeRooms[roomCode] = {
        expiresAt,
        creatorName,
        createdAt: Date.now(),
        users: [],
        messages: [],
    };

    console.log(`Room ${roomCode} created by ${creatorName}, expires at ${new Date(expiresAt).toLocaleString()}`);
    res.status(201).json({ roomCode, expiresAt: new Date(expiresAt).toLocaleString() });
});

app.get('/admin/rooms', (req, res) => {
    res.status(200).json(activeRooms);
});

app.patch('/admin/rooms/:roomCode', (req, res) => {
    const { roomCode } = req.params;
    const { creatorName } = req.body;

    if (activeRooms[roomCode]) {
        activeRooms[roomCode].creatorName = creatorName;
        console.log(`Admin updated room ${roomCode}. New creator: ${creatorName}`);
        res.status(200).json({ message: 'Room updated successfully', room: activeRooms[roomCode] });
    } else {
        res.status(404).json({ message: 'Room not found' });
    }
});

app.delete('/admin/rooms/:roomCode', (req, res) => {
    const { roomCode } = req.params;
    if (activeRooms[roomCode]) {
        delete activeRooms[roomCode];
        io.to(roomCode).emit("room_closed", { message: "This chat room has been closed by an administrator." });
        console.log(`Admin deleted room ${roomCode}`);
        res.status(200).json({ message: 'Room deleted successfully' });
    } else {
        res.status(404).json({ message: 'Room not found' });
    }
});



// --- Socket.IO Connection Handling ---
io.on("connection", (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on("join_room", ({ roomCode, userId, userType }) => {
        // 1. Check if room is valid
        if (!activeRooms[roomCode] || activeRooms[roomCode].expiresAt <= Date.now()) {
            socket.emit("room_join_status", { success: false, message: "Room is invalid or has expired." });
            return;
        }

        const room = activeRooms[roomCode];
        const currentRoomSize = io.sockets.adapter.rooms.get(roomCode)?.size || 0;
        const existingUser = room.users.find(u => u.userId === userId);

        // 2. Check for hard connection limit first
        if (currentRoomSize >= MAX_USERS_PER_ROOM) {
            socket.emit("room_join_status", { success: false, message: "Room is full." });
            return;
        }
        
        // 3. Check for business logic (2 non-admin users) only if it's a NEW user// recheck this asap. 
        if (!existingUser) {
            const nonAdminUsers = room.users.filter(user => user.userType !== 'admin').length;
            if (userType !== 'admin' && nonAdminUsers >= 2) {
                socket.emit("room_join_status", { success: false, message: "Room is already full with 2 users." });
                return;
            }
        }
        
        // 4. If all checks pass, let the user join
        socket.join(roomCode);

        if (existingUser) {
            existingUser.socketId = socket.id; // Update socket ID on rejoin
            socket.emit("room_join_status", { success: true, message: `Rejoined room ${roomCode}` });
        } else {
            const newUserId = userId || uuidv4();
            room.users.push({ socketId: socket.id, userId: newUserId, userType });
            socket.emit("room_join_status", { success: true, message: `Joined room ${roomCode}`, userId: newUserId });
        }
        
        console.log(`User with ID: ${socket.id} (userId: ${userId}) joined room: ${roomCode}`);
        socket.emit("message_history", room.messages);
    });

    socket.on("send_message", (data) => {
        if (activeRooms[data.room] && activeRooms[data.room].expiresAt > Date.now()) {
            activeRooms[data.room].messages.push(data);
            socket.to(data.room).emit("receive_message", data);
        } else {
            socket.emit("room_join_status", { success: false, message: "Cannot send message: Room is invalid or has expired." });
        }
    });

    socket.on("disconnect", () => {
        console.log("User Disconnected", socket.id);
        for (const roomCode in activeRooms) {
            const userIndex = activeRooms[roomCode].users.findIndex(u => u.socketId === socket.id);
            if (userIndex !== -1) {
                // Instead of removing completely, we just nullify the socketId
                activeRooms[roomCode].users.splice(userIndex, 1);
                console.log(`User removed from room ${roomCode}`);
                break;
            }
        }
    });

    socket.on("update_message", (data) => {
        if (activeRooms[data.room] && activeRooms[data.room].expiresAt > Date.now()) {
            const messageIndex = activeRooms[data.room].messages.findIndex(msg => msg.id === data.id);
            if (messageIndex !== -1) {
                activeRooms[data.room].messages[messageIndex].message = data.message;
            }
            socket.to(data.room).emit("message_updated", { id: data.id, message: data.message });
        }
    });

    socket.on("delete_message", (data) => {
        if (activeRooms[data.room] && activeRooms[data.room].expiresAt > Date.now()) {
            activeRooms[data.room].messages = activeRooms[data.room].messages.filter(msg => msg.id !== data.id);
            socket.to(data.room).emit("message_deleted", { id: data.id });
        }
    });
    
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});