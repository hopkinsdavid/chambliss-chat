require ('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
// Define allowed origins for Express CORS
const allowedOrigins = [
  'http://localhost:5173', // Your local frontend dev server (adjust port if different)
  'https://chambliss-chat.vercel.app' 
]

// Socket.IO CORS still uses FRONTEND_URL or falls back, but you might want to align this later
const FRONTEND_URL_SOCKETIO = process.env.FRONTEND_URL || "http://localhost:5173"; // Keep for Socket.IO for now

// Configure Express CORS
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    // or if the origin is in the allowed list
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ["GET", "POST", "PATCH", "DELETE"], // Keep allowed methods
  credentials: true // Optional: If you need cookies/auth headers
}));

app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins, // Allow origins for Socket.IO too
    methods: ["GET", "POST", "PATCH", "DELETE"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3001;

const activeRooms = {};
const MAX_USERS_PER_ROOM = 6;

// Santize Input
const sanitizeInput = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

function cleanupExpiredRooms() {
    const now = Date.now();
    for (const roomCode in activeRooms) {
        if (activeRooms[roomCode].expiresAt < now) {
            console.log(`Room ${roomCode} expired and is being removed.`);
            delete activeRooms[roomCode];
        }
    }
    // Schedule next cleanup (e.g., every hour)
    // Note: In a stateless environment like Render, this might not run reliably long-term
    // Consider a cron job or external scheduler if precise cleanup is critical
    setTimeout(cleanupExpiredRooms, 60 * 60 * 1000);
}
cleanupExpiredRooms(); // Initial call

// --- REST API Endpoints ---
app.post('/admin/create-room', (req, res) => {
    const { creatorName, expirationHours } = req.body;
    if (!creatorName) {
        return res.status(400).json({ message: "Creator name is required." });
    }

    let roomCode;
    do {
        roomCode = uuidv4().slice(0, 8);
    } while (activeRooms[roomCode]);

    const roomExpirationTime = (expirationHours || 24) * 60 * 60 * 1000;
    const expiresAt = Date.now() + roomExpirationTime;
    activeRooms[roomCode] = {
        expiresAt,
        creatorName : sanitizeInput(creatorName),
        createdAt: Date.now(),
        users: [],
        messages: [],
    };

    const sponsorCode = `s${roomCode}`;
    console.log(`Room ${roomCode} created by ${sanitizeInput(creatorName)}. Sponsor code: ${sponsorCode}`);
    res.status(201).json({
        recipientCode: roomCode,
        sponsorCode: sponsorCode,
        expiresAt: new Date(expiresAt).toLocaleString()
    });
});

app.get('/admin/rooms', (req, res) => {
    // Simple authentication (replace with something better in production)
    // const authHeader = req.headers.authorization;
    // if (!authHeader || authHeader !== 'Bearer your_secret_token') { // Example token
    //     return res.status(401).json({ message: "Unauthorized" });
    // }
    res.status(200).json(activeRooms);
});


app.patch('/admin/rooms/:roomCode', (req, res) => {
    const { roomCode } = req.params;
    const { creatorName } = req.body;

    if (activeRooms[roomCode]) {
        activeRooms[roomCode].creatorName = sanitizeInput(creatorName);
        console.log(`Admin updated room ${roomCode}. New creator: ${sanitizeInput(creatorName)}`);
        res.status(200).json({ message: 'Room updated successfully', room: activeRooms[roomCode] });
    } else {
        res.status(404).json({ message: 'Room not found' });
    }
});

app.patch('/admin/rooms/:roomCode/extend', (req, res) => {
    const { roomCode } = req.params;
    const { hours } = req.body;

    if (activeRooms[roomCode] && hours > 0) {
        const extensionMillis = hours * 60 * 60 * 1000;
        activeRooms[roomCode].expiresAt += extensionMillis;
        console.log(`Admin extended room ${roomCode} by ${hours} hours. New expiry: ${new Date(activeRooms[roomCode].expiresAt).toLocaleString()}`);
        res.status(200).json({ message: 'Room extended successfully', room: activeRooms[roomCode] });
    } else if (!activeRooms[roomCode]) {
        res.status(404).json({ message: 'Room not found' });
    } else {
        res.status(400).json({ message: 'Invalid number of hours' });
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


// --- Socket.IO Logic ---
io.on("connection", (socket) => {
    console.log(`User Connected: ${socket.id}`);

    socket.on("join_room", ({ roomCode, userId, userType }) => {
        const isSponsor = roomCode.startsWith('s');
        const baseRoomCode = isSponsor ? roomCode.substring(1) : roomCode;

        let authorName = userType === 'admin' ? 'Admin' : (isSponsor ? 'Sponsor' : 'Recipient');

        if (!activeRooms[baseRoomCode] || activeRooms[baseRoomCode].expiresAt <= Date.now()) {
            socket.emit("room_join_status", { success: false, message: "Room is invalid or has expired." });
            return;
        }

        const room = activeRooms[baseRoomCode];

        // Use io.sockets.adapter.rooms.get() for accurate room size across potential multiple server instances (if scaling)
        const currentRoomSize = io.sockets.adapter.rooms.get(baseRoomCode)?.size || 0;
        const existingUser = room.users.find(u => u.userId === userId);

        // Check against MAX_USERS_PER_ROOM if the user doesn't already exist in our logical list
        if (!existingUser && room.users.length >= MAX_USERS_PER_ROOM) {
             socket.emit("room_join_status", { success: false, message: "Room is full (max users)." });
             return;
        }

        // Limit non-admin users to 2
        const nonAdminUsersCount = room.users.filter(user => user.userType !== 'admin').length;
        // Allow joining if: user is admin OR user exists OR there's less than 2 non-admins already
        if (userType !== 'admin' && !existingUser && nonAdminUsersCount >= 2) {
             socket.emit("room_join_status", { success: false, message: "Room already has two participants." });
             return;
        }

        socket.join(baseRoomCode);

        if (existingUser) {
             // Update socket ID on rejoin
             existingUser.socketId = socket.id;
             existingUser.authorName = authorName; // Ensure role is updated if they rejoin with a different code type
             console.log(`User ${userId} (${authorName}) reconnected to room ${baseRoomCode} with socket ${socket.id}`);
             socket.emit("room_join_status", { success: true, message: `Rejoined room ${baseRoomCode}`, authorName: authorName, userId: existingUser.userId });
        } else {
             const newUserId = userId || uuidv4();
             room.users.push({ socketId: socket.id, userId: newUserId, userType, authorName });
             console.log(`User ${newUserId} (${authorName}) joined room ${baseRoomCode} with socket ${socket.id}`);
             socket.emit("room_join_status", { success: true, message: `Joined room ${baseRoomCode}`, userId: newUserId , authorName: authorName });
        }


        // Send message history to the joining user
        socket.emit("message_history", room.messages);
        // Optionally notify others (without sending full history again)
        // socket.to(baseRoomCode).emit("user_joined", { userId: existingUser ? existingUser.userId : newUserId, authorName });
    });

    socket.on("send_message", (data) => {
        const baseRoomCode = data.room.startsWith('s') ? data.room.substring(1) : data.room;

        if (activeRooms[baseRoomCode] && activeRooms[baseRoomCode].expiresAt > Date.now()) {
            const user = activeRooms[baseRoomCode].users.find(u => u.socketId === socket.id);
            if (!user) {
                console.error(`Message received from socket ${socket.id} not associated with a user in room ${baseRoomCode}`);
                return; // Ignore message if user isn't found (could happen on disconnect race conditions)
            }

            const sanitizedData = {
                ...data,
                // CRITICAL: Always use the server-known authorName, ignore what client sent
                author: user.authorName,
                userId: user.userId, // Include userId
                message: sanitizeInput(data.message),
                id: data.id || uuidv4(), // Ensure message has an ID
                time: data.time || new Date(Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            };

            activeRooms[baseRoomCode].messages.push(sanitizedData);

            // Broadcast message to everyone in the room (including sender)
            io.to(baseRoomCode).emit("receive_message", sanitizedData);
        } else {
            console.warn(`Attempt to send message to inactive/expired room ${baseRoomCode}`);
            // Optionally notify sender their message wasn't sent due to room state
            // socket.emit("send_message_error", { message: "Room is inactive or expired." });
        }
    });

    socket.on("update_message", (data) => {
        const baseRoomCode = data.room.startsWith('s') ? data.room.substring(1) : data.room;
        if (activeRooms[baseRoomCode] && activeRooms[baseRoomCode].expiresAt > Date.now()) {
            const user = activeRooms[baseRoomCode].users.find(u => u.socketId === socket.id);
             if (!user) return; // Ignore if user not found

            const messageIndex = activeRooms[baseRoomCode].messages.findIndex(msg => msg.id === data.id);
            if (messageIndex !== -1) {
                 // Check if the user is the author or an admin
                 if (activeRooms[baseRoomCode].messages[messageIndex].userId === user.userId || user.userType === 'admin') {
                     const updatedMessageContent = sanitizeInput(data.message);
                     activeRooms[baseRoomCode].messages[messageIndex].message = updatedMessageContent;
                     activeRooms[baseRoomCode].messages[messageIndex].edited = true; // Mark as edited
                     // Broadcast the update to others in the room
                     io.to(baseRoomCode).emit("message_updated", { id: data.id, message: updatedMessageContent, edited: true });
                 } else {
                     console.warn(`User ${user.userId} attempted to edit message ${data.id} without permission.`);
                     // Optionally notify the user they can't edit this message
                     // socket.emit("update_message_error", { id: data.id, message: "Permission denied." });
                 }
            }
        }
    });

    socket.on("delete_message", (data) => {
        const baseRoomCode = data.room.startsWith('s') ? data.room.substring(1) : data.room;
        if (activeRooms[baseRoomCode] && activeRooms[baseRoomCode].expiresAt > Date.now()) {
             const user = activeRooms[baseRoomCode].users.find(u => u.socketId === socket.id);
             if (!user) return; // Ignore if user not found

             const messageIndex = activeRooms[baseRoomCode].messages.findIndex(msg => msg.id === data.id);

             if (messageIndex !== -1) {
                  // Check if the user is the author or an admin
                 if (activeRooms[baseRoomCode].messages[messageIndex].userId === user.userId || user.userType === 'admin') {
                     activeRooms[baseRoomCode].messages.splice(messageIndex, 1); // Remove the message
                     io.to(baseRoomCode).emit("message_deleted", { id: data.id });
                 } else {
                     console.warn(`User ${user.userId} attempted to delete message ${data.id} without permission.`);
                     // Optionally notify the user they can't delete this message
                     // socket.emit("delete_message_error", { id: data.id, message: "Permission denied." });
                 }
             }
        }
    });


    socket.on("disconnect", (reason) => {
        console.log(`User Disconnected: ${socket.id}, Reason: ${reason}`);
        // Find which room the user was in and remove them
        for (const roomCode in activeRooms) {
            const userIndex = activeRooms[roomCode].users.findIndex(u => u.socketId === socket.id);
            if (userIndex !== -1) {
                const removedUser = activeRooms[roomCode].users.splice(userIndex, 1)[0];
                console.log(`User ${removedUser.userId} (${removedUser.authorName}) removed from room ${roomCode}`);
                // Optionally notify others in the room
                // io.to(roomCode).emit("user_left", { userId: removedUser.userId, authorName: removedUser.authorName });
                break; // Assume user is only in one room
            }
        }
    });
});

// Start the server
server.listen(PORT, '0.0.0.0', () => { // Listen on all available network interfaces
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});