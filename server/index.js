// server/index.js - Updated MINIMALLY for Render deployment
require('dotenv').config(); // <-- ADDED: Load .env file for local development

const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173"; // Use env var, fallback to localhost

app.use(cors({
  origin: FRONTEND_URL, // Use the variable
  methods: ["GET", "POST", "PATCH", "DELETE"] // Keep allowed methods
}));
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL, // Use the variable here too
    methods: ["GET", "POST", "PATCH", "DELETE"]
  }
});

const PORT = process.env.PORT || 3001; // Use env var, fallback to 3001

const activeRooms = {};
const MAX_USERS_PER_ROOM = 6; // Keeping your constant

const sanitizeInput = (str) => {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

function cleanupExpiredRooms() {
  const now = Date.now();
  for (const roomCode in activeRooms) {
    if (activeRooms[roomCode].expiresAt < now) {
      console.log(`Room ${roomCode} expired and is being removed.`);
      // IMPORTANT: Added notification and disconnect from simplified code version
      const room = activeRooms[roomCode];
      delete activeRooms[roomCode];
      io.to(roomCode).emit("room_closed", { message: "This chat room has expired." });
      io.in(roomCode).disconnectSockets(true); // Force disconnect clients
    }
  }
  setTimeout(cleanupExpiredRooms, 60 * 60 * 1000); // Check every hour
}
cleanupExpiredRooms();

// --- Keep existing Admin Routes (still unprotected) ---
app.post('/admin/create-room', (req, res) => {
  const { creatorName, expirationHours } = req.body;
  if (!creatorName) {
    return res.status(400).json({ message: "Creator name is required." });
  }
  let roomCode;
  do {
    roomCode = uuidv4().slice(0, 8);
  } while (activeRooms[roomCode]);
  const hours = Number(expirationHours) > 0 ? Number(expirationHours) : 24; // Ensure hours calculation is safe
  const roomExpirationTime = hours * 60 * 60 * 1000;
  const expiresAt = Date.now() + roomExpirationTime;
  activeRooms[roomCode] = {
    expiresAt,
    creatorName: sanitizeInput(creatorName), // Use sanitizeInput
    createdAt: Date.now(),
    users: [],
    messages: [],
  };
  const sponsorCode = `s${roomCode}`;
  console.log(`Room ${roomCode} created by ${sanitizeInput(creatorName)}. Sponsor code: ${sponsorCode}`); // Use sanitizeInput
  res.status(201).json({
    recipientCode: roomCode,
    sponsorCode: sponsorCode,
    expiresAt: new Date(expiresAt).toLocaleString()
  });
});

app.get('/admin/rooms', (req, res) => {
  // Return a copy or mapped version, not the direct internal object (safer)
  const roomDataForAdmin = Object.entries(activeRooms).map(([code, room]) => ({
      roomCode: code,
      creatorName: room.creatorName,
      createdAt: new Date(room.createdAt).toLocaleString(),
      expiresAt: new Date(room.expiresAt).toLocaleString(),
      userCount: room.users.length,
      messageCount: room.messages.length
  }));
  res.status(200).json(roomDataForAdmin);
});


app.patch('/admin/rooms/:roomCode', (req, res) => {
  const { roomCode } = req.params;
  const { creatorName } = req.body;
  if (activeRooms[roomCode]) {
    activeRooms[roomCode].creatorName = sanitizeInput(creatorName); // Use sanitizeInput
    console.log(`Admin updated room ${roomCode}. New creator: ${sanitizeInput(creatorName)}`); // Use sanitizeInput
    res.status(200).json({ message: 'Room updated successfully', room: activeRooms[roomCode] });
  } else {
    res.status(404).json({ message: 'Room not found' });
  }
});

app.patch('/admin/rooms/:roomCode/extend', (req, res) => {
  const { roomCode } = req.params;
  const { hours } = req.body;
  const numericHours = parseFloat(hours); // Ensure it's a number

  if (activeRooms[roomCode] && numericHours > 0) {
    const extensionMillis = numericHours * 60 * 60 * 1000;
    activeRooms[roomCode].expiresAt += extensionMillis;
    console.log(`Admin extended room ${roomCode} by ${numericHours} hours. New expiry: ${new Date(activeRooms[roomCode].expiresAt).toLocaleString()}`);
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
    io.in(roomCode).disconnectSockets(true); // Force disconnect clients
    console.log(`Admin deleted room ${roomCode}`);
    res.status(200).json({ message: 'Room deleted successfully' });
  } else {
    res.status(404).json({ message: 'Room not found' });
  }
});


// --- Keep existing Socket.IO connection logic ---
io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  socket.on("join_room", ({ roomCode, userId, userType }) => {
    const isSponsor = roomCode.startsWith('s');
    const baseRoomCode = isSponsor ? roomCode.substring(1) : roomCode;

    // Determine author name (make sure userType is considered)
    let authorName = isSponsor ? 'Sponsor' : 'Recipient';
    if (userType === 'admin') {
        authorName = 'Admin'; // Explicitly set Admin name
    }

    if (!activeRooms[baseRoomCode] || activeRooms[baseRoomCode].expiresAt <= Date.now()) {
      socket.emit("room_join_status", { success: false, message: "Room is invalid or has expired." });
      return;
    }

    const room = activeRooms[baseRoomCode];
    const existingUser = room.users.find(u => u.userId === userId);

    
    if (!existingUser && room.users.length >= MAX_USERS_PER_ROOM) {
      socket.emit("room_join_status", { success: false, message: "Room is full (max users reached)." }); // Clarified message
      return;
    }

    // Your logic to limit to 2 non-admin users
    const nonAdminUsers = room.users.filter(user => user.userType !== 'admin');
    if (userType !== 'admin' && !existingUser && nonAdminUsers.length >= 2) { // Check only for new, non-admin users
        socket.emit("room_join_status", { success: false, message: "Room is already full with 2 users." });
        return;
    }

    // Join the socket.io room
    socket.join(baseRoomCode);

    // Update or add user to the room's user list
    if (existingUser) {
      existingUser.socketId = socket.id; // Update socket ID on reconnect
      existingUser.authorName = authorName; // Update authorName in case they rejoined via different link
      existingUser.userType = userType; // Update userType as well
      socket.emit("room_join_status", { success: true, message: `Rejoined room ${baseRoomCode}`, authorName: authorName, userId: existingUser.userId });
    } else {
      const newUserId = userId || uuidv4(); // Assign userId if joining for the first time
      // Store userType along with other details
      room.users.push({ socketId: socket.id, userId: newUserId, userType: userType, authorName: authorName });
      socket.emit("room_join_status", { success: true, message: `Joined room ${baseRoomCode}`, userId: newUserId, authorName: authorName });
    }

    console.log(`User ${userId || 'new user'} (${socket.id}) joined room ${baseRoomCode} as ${authorName}`);
    socket.emit("message_history", room.messages); // Send history
  });

  socket.on("send_message", (data) => {
    if (!data || !data.room || !data.message) return; // Basic validation
    const baseRoomCode = data.room.startsWith('s') ? data.room.substring(1) : data.room;

    if (activeRooms[baseRoomCode] && activeRooms[baseRoomCode].expiresAt > Date.now()) {
      const room = activeRooms[baseRoomCode];
      const user = room.users.find(u => u.socketId === socket.id); // Find user by socket ID
      if (!user) {
          console.log(`Message rejected: Sender ${socket.id} not found in room ${baseRoomCode}.`);
          return; // Reject if sender isn't in our user list for the room
      }

      // Create message object server-side
      const messageData = {
        id: uuidv4(), // Assign unique ID
        room: data.room, // Keep original room code
        author: user.authorName, // Use server-verified author name
        userId: user.userId, // Include sender ID
        message: sanitizeInput(data.message), // Sanitize message
        time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) // Add timestamp
      };

      room.messages.push(messageData); // Store message
      io.to(baseRoomCode).emit("receive_message", messageData); // Broadcast
      console.log(`Message in ${baseRoomCode} from ${user.userId}`);
    } else {
        console.log(`Message rejected: Room ${baseRoomCode} invalid or expired.`);
        socket.emit("message_status", { success: false, message: "Cannot send message, room is invalid or has expired." });
    }
  });

  socket.on("disconnect", () => {
    console.log("User Disconnected", socket.id);
    for (const roomCode in activeRooms) {
      const room = activeRooms[roomCode];
      const userIndex = room.users.findIndex(u => u.socketId === socket.id);
      if (userIndex !== -1) {
        const removedUser = room.users.splice(userIndex, 1)[0]; // Remove user from array
        console.log(`User ${removedUser.userId} removed from room ${roomCode}`);
        // Optionally notify others
        // io.to(roomCode).emit("user_left", { userId: removedUser.userId, authorName: removedUser.authorName });
        break; // Assume user was in only one room
      }
    }
  });

  socket.on("update_message", (data) => {
    if (!data || !data.room || !data.id || data.message === undefined) return;
    const baseRoomCode = data.room.startsWith('s') ? data.room.substring(1) : data.room;

    if (activeRooms[baseRoomCode] && activeRooms[baseRoomCode].expiresAt > Date.now()) {
      const room = activeRooms[baseRoomCode];
      const user = room.users.find(u => u.socketId === socket.id); // Find user trying to update
      const messageIndex = room.messages.findIndex(msg => msg.id === data.id);

      // Check if user exists, message exists, and user is the author
      if (user && messageIndex !== -1 && room.messages[messageIndex].userId === user.userId) {
        const sanitizedMessage = sanitizeInput(data.message);
        room.messages[messageIndex].message = sanitizedMessage; // Update message
        room.messages[messageIndex].edited = true; // Mark as edited
        // Broadcast the update
        io.to(baseRoomCode).emit("message_updated", { id: data.id, message: sanitizedMessage, userId: user.userId, edited: true });
        console.log(`Message ${data.id} updated by ${user.userId}`);
      } else {
        console.log(`Update rejected for message ${data.id} by ${socket.id}`);
      }
    }
  });

  socket.on("delete_message", (data) => {
     if (!data || !data.room || !data.id) return;
     const baseRoomCode = data.room.startsWith('s') ? data.room.substring(1) : data.room;

     if (activeRooms[baseRoomCode] && activeRooms[baseRoomCode].expiresAt > Date.now()) {
        const room = activeRooms[baseRoomCode];
        const user = room.users.find(u => u.socketId === socket.id); // Find user trying to delete
        const messageIndex = room.messages.findIndex(msg => msg.id === data.id);

        // Allow deletion if user exists, message exists, and user is author OR admin
        if (user && messageIndex !== -1 && (room.messages[messageIndex].userId === user.userId || user.userType === 'admin')) {
            room.messages.splice(messageIndex, 1); // Remove message
            // Broadcast deletion
            io.to(baseRoomCode).emit("message_deleted", { id: data.id, userId: user.userId });
            console.log(`Message ${data.id} deleted by ${user.userId}`);
        } else {
            console.log(`Delete rejected for message ${data.id} by ${socket.id}`);
        }
     }
  });

});

// --- Start Server ---
// Listen on 0.0.0.0 is crucial for Render
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on http://0.0.0.0:${PORT}`);
});