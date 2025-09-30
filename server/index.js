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
const activeRooms = {}; // Stores { roomCode: { expiresAt: Date, creatorId: string, users: { socketId: string, userId: string, userType: string }[], messages: any[] } }
const ROOM_EXPIRATION_TIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MAX_USERS_PER_ROOM = 3; // 2 users + 1 admin

// Function to clean up expired rooms
function cleanupExpiredRooms() {
    const now = Date.now();
    for (const roomCode in activeRooms) {
        if (activeRooms[roomCode].expiresAt < now) {
            console.log(`Room ${roomCode} expired and is being removed.`);
            delete activeRooms[roomCode];
        }
    }
    // Run cleanup every hour
    setTimeout(cleanupExpiredRooms, 60 * 60 * 1000);
}
// Start initial cleanup
cleanupExpiredRooms();

// --- Admin API Endpoints ---
app.post('/admin/create-room', (req, res) => {
    const { creatorName } = req.body; // Admin can provide a name for tracking
    if (!creatorName) {
        return res.status(400).json({ message: "Creator name is required." });
    }

    let roomCode;
    do {
        roomCode = uuidv4().slice(0, 8); // Generate an 8-character unique code
    } while (activeRooms[roomCode]); // Ensure uniqueness

    const expiresAt = Date.now() + ROOM_EXPIRATION_TIME;
    activeRooms[roomCode] = {
        expiresAt,
        creatorName,
        createdAt: Date.now(), // For additional tracking
        users: [], // Initialize with an empty array of users
        messages: [], // Array to store messages
    };

    console.log(`Room ${roomCode} created by ${creatorName}, expires at ${new Date(expiresAt).toLocaleString()}`);
    res.status(201).json({ roomCode, expiresAt: new Date(expiresAt).toLocaleString() });
});

app.get('/admin/rooms', (req, res) => {
    res.status(200).json(activeRooms);
});

// --- Endpoint to UPDATE a room ---
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

// --- Endpoint to DELETE a room ---
app.delete('/admin/rooms/:roomCode', (req, res) => {
    const { roomCode } = req.params;
    if (activeRooms[roomCode]) {
        delete activeRooms[roomCode];
        // Notify anyone in the room that it has been closed
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
        if (activeRooms[roomCode] && activeRooms[roomCode].expiresAt > Date.now()) {
            const room = activeRooms[roomCode];
            const existingUser = room.users.find(u => u.userId === userId);

            if (existingUser) {
                // User is rejoining, update their socketId
                existingUser.socketId = socket.id;
                socket.join(roomCode);
                socket.emit("room_join_status", { success: true, message: `Rejoined room ${roomCode}` });
                socket.emit("message_history", room.messages);
                return;
            }
            
            const currentRoomSize = io.sockets.adapter.rooms.get(roomCode)?.size || 0;

            if (currentRoomSize < MAX_USERS_PER_ROOM) {
                 if (userType === 'admin') {
                    socket.join(roomCode);
                    console.log(`Admin with ID: ${socket.id} joined room: ${roomCode}`);
                    socket.emit("room_join_status", { success: true, message: `Joined room ${roomCode} as Admin` });
                    socket.emit("message_history", activeRooms[roomCode].messages);
                    return;
                }
                
                const nonAdminUsers = activeRooms[roomCode].users.filter(user => user.userType !== 'admin').length;
                if (nonAdminUsers < 2) {
                    const newUserId = userId || uuidv4();
                    socket.join(roomCode);
                    room.users.push({ socketId: socket.id, userId: newUserId, userType });
    
                    console.log(`User with ID: ${socket.id} (userId: ${newUserId}) joined room: ${roomCode}`);
                    socket.emit("room_join_status", { success: true, message: `Joined room ${roomCode}`, userId: newUserId });
                    socket.emit("message_history", room.messages);
                } else {
                     socket.emit("room_join_status", { success: false, message: "Room is full with 2 users." });
                }

            } else {
                socket.emit("room_join_status", { success: false, message: "Room is full." });
            }
        } else {
            console.log(`User with ID: ${socket.id} tried to join expired/invalid room: ${roomCode}`);
            socket.emit("room_join_status", { success: false, message: "Room is invalid or has expired." });
        }
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
        // Remove user from the room's user list upon disconnection
        for (const roomCode in activeRooms) {
            const userIndex = activeRooms[roomCode].users.findIndex(u => u.socketId === socket.id);
            if (userIndex !== -1) {
                activeRooms[roomCode].users.splice(userIndex, 1);
                console.log(`User removed from room ${roomCode}`);
                break;
            }
        }
    });

    socket.on("update_message", (data) => {
        if (activeRooms[data.room] && activeRooms[data.room].expiresAt > Date.now()) {
            // Broadcast the message update to others in the room
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
            // Broadcast the message deletion to others in the room
            socket.to(data.room).emit("message_deleted", { id: data.id });
        }
    });
    
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});