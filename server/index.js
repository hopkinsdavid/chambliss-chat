// server/index.js
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const cors = require('cors'); // We'll need this to allow connections

const app = express();
app.use(cors()); // Use cors middleware

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:5173", // React app's address
        methods: ["GET", "POST"]
    }
});

const PORT = 3001;

// This runs when a client connects to our server
io.on("connection", (socket) => {
    console.log(`User Connected: ${socket.id}`);

    // Logic for joining a room
    socket.on("join_room", (data) => {
        socket.join(data);
        console.log(`User with ID: ${socket.id} joined room: ${data}`);
    });

    // Logic for sending a message to a room
    socket.on("send_message", (data) => {
        // This sends the message to everyone in the room specified
        socket.to(data.room).emit("receive_message", data);
    });

    socket.on("disconnect", () => {
        console.log("User Disconnected", socket.id);
    });
});

server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});