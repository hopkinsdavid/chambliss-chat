// App.jsx
import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';
import ChamblissLogo from '/ccvertical.png';
import { v4 as uuidv4 } from 'uuid';

// Define the API URL using environment variables
// Fallback to localhost for local development
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Connect to the Socket.IO server using the API_URL
const socket = io.connect(API_URL);

// `initialRoom` and `initialUsername` can be passed as props, e.g., from AdminPage
function App({ room: initialRoom, username: initialUsername, userType = 'user', onExit }) {
  // State variables
  const [authorName, setAuthorName] = useState(initialUsername || ""); // Set initial username if provided (This is YOUR role)
  const [room, setRoom] = useState(initialRoom || ""); // Set initial room if provided
  const [message, setMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [hasJoined, setHasJoined] = useState(!!initialRoom); // Automatically join if room provided
  const [joinError, setJoinError] = useState("");
  const [editingMessage, setEditingMessage] = useState(null); // { id: msg.id, text: msg.message }
  // Persist userId in localStorage to rejoin correctly after refresh/reconnect
  const [userId, setUserId] = useState(localStorage.getItem('userId'));

  const chatBodyRef = useRef(null); // Ref for scrolling chat body

  // Function to emit join_room event
  const joinRoom = () => {
    if (room.trim() !== "") {
        console.log(`Attempting to join room: ${room} as ${userType} with userId: ${userId}`);
      socket.emit("join_room", { roomCode: room.trim(), userId, userType });
    } else {
        setJoinError("Please enter a room code.");
    }
  };

   // Effect to join room automatically if initialRoom is provided
   useEffect(() => {
    if (initialRoom) {
      joinRoom();
    }
    // Generate a userId if one doesn't exist in localStorage
    if (!userId) {
      const newUserId = uuidv4();
      localStorage.setItem('userId', newUserId);
      setUserId(newUserId);
    }
  }, [initialRoom, userId]); // Depend on initialRoom and userId

  // Send a new message
  const sendMessage = () => {
    if (message.trim() !== "" && hasJoined) {
      const messageData = {
        id: uuidv4(), // Generate unique ID client-side
        room: room,
        // Author is set server-side based on socket connection
        message: message,
        time: new Date(Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      socket.emit("send_message", messageData);
      setMessage(""); // Clear input
    }
  };

  // Start editing a message
   const startEditing = (msg) => {
    setEditingMessage({ id: msg.id, text: msg.message });
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingMessage(null);
  };

  // Send updated message content
  const updateMessage = (id, newMessage) => {
    const trimmedMessage = newMessage.trim();
    if (trimmedMessage === "") {
        // If the edited message is empty, treat it as a delete request
         if (window.confirm("Delete this message?")) {
             deleteMessage(id);
         } else {
             cancelEditing(); // Keep original if delete is cancelled
         }
      return;
    }
    const messageData = { id, room, message: trimmedMessage };
    socket.emit("update_message", messageData);
    setEditingMessage(null); // Exit editing mode
  };

  // Send delete message request
  const deleteMessage = (id) => {
     if (window.confirm("Are you sure you want to delete this message?")) {
         socket.emit("delete_message", { id, room });
     }
      setEditingMessage(null); // Ensure editing mode is exited if deleting while editing
  };

  // Handle exiting the chat room
  const exitChat = () => {
    if (onExit) { // If onExit prop is provided (e.g., from AdminPage)
      onExit();
    } else { // Default behavior if running standalone
      setHasJoined(false);
      setRoom("");
      setMessageList([]);
      setJoinError(""); // Clear any previous errors
    }
  };

  // Effect for handling Socket.IO events
  useEffect(() => {
    // Handler for receiving a single message
    const handleReceiveMessage = (data) => {
      setMessageList((list) => {
        if (list.some(msg => msg.id === data.id)) {
            return list;
        }
        return [...list, data];
      });
    };

    // Handler for room join status (success or failure)
    const handleRoomJoinStatus = (data) => {
       console.log("Room Join Status:", data);
      if (data.success) {
        setHasJoined(true);
        setJoinError("");
        if (data.authorName) {
            setAuthorName(data.authorName); // Update YOUR role based on server response (Sponsor/Recipient/Admin)
        }
         if (data.userId && data.userId !== userId) {
            localStorage.setItem('userId', data.userId);
            setUserId(data.userId);
        }
      } else {
        setHasJoined(false);
        setJoinError(data.message);
      }
    };

     // Handler for when admin closes the room
     const handleRoomClosed = (data) => {
        alert(data.message || "This chat room has been closed.");
         setHasJoined(false);
         setRoom("");
         setMessageList([]);
         setJoinError("Room closed by administrator.");
         if (onExit) onExit(); // If embedded, exit back
    };


    // Handler for receiving message history on join
    const handleMessageHistory = (history) => {
        setMessageList(history || []);
    };

    // Handler for message updates from others
     const handleMessageUpdated = (data) => {
        setMessageList((list) =>
            list.map((msg) =>
                msg.id === data.id ? { ...msg, message: data.message, edited: data.edited } : msg
            )
        );
    };

    // Handler for message deletions from others
    const handleMessageDeleted = (data) => {
        setMessageList((list) => list.filter((msg) => msg.id !== data.id));
    };

    // --- Socket Event Listeners ---
    socket.on("receive_message", handleReceiveMessage);
    socket.on("room_join_status", handleRoomJoinStatus);
    socket.on("room_closed", handleRoomClosed);
    socket.on("message_history", handleMessageHistory);
    socket.on("message_updated", handleMessageUpdated);
    socket.on("message_deleted", handleMessageDeleted);
    socket.on("connect_error", (err) => {
        console.error("Socket connection error:", err.message);
        setJoinError(`Connection failed: ${err.message}. Please check the server and network.`);
        setHasJoined(false);
    });
     socket.on("disconnect", (reason) => {
        console.log("Socket disconnected:", reason);
         if (reason !== "io client disconnect") {
             // setJoinError("Disconnected. Attempting to reconnect...");
         }
    });
     socket.on("connect", () => {
        console.log("Socket connected:", socket.id);
         if (hasJoined && room) {
             console.log("Re-attempting join after reconnect...");
             joinRoom();
         } else {
              setJoinError("");
         }
    });


    // Cleanup function to remove listeners when component unmounts
    return () => {
      socket.off("receive_message", handleReceiveMessage);
      socket.off("room_join_status", handleRoomJoinStatus);
      socket.off("room_closed", handleRoomClosed);
      socket.off("message_history", handleMessageHistory);
      socket.off("message_updated", handleMessageUpdated);
      socket.off("message_deleted", handleMessageDeleted);
      socket.off("connect_error");
      socket.off("disconnect");
      socket.off("connect");
    };
     }, [socket, hasJoined, room, userId, onExit]);


  // Effect to scroll chat to the bottom when new messages arrive
  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messageList]); // Run when messageList changes

  // --- Render Logic ---
  return (
    <div className="App">
      {!hasJoined ? (
        // Join Chat Screen
        <div className="joinChatContainer">
          <img src={ChamblissLogo} alt="Chambliss Center Logo" />
          <h3>Hey there, join a Chat!</h3>
          <input
            type="text"
            placeholder="Room Code..."
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            onKeyPress={(event) => {
              event.key === "Enter" && joinRoom();
            }}
            disabled={!!initialRoom}
          />
          <button onClick={joinRoom} disabled={!!initialRoom}>Join Room</button>
          {joinError && <p className="error-message">{joinError}</p>}
        </div>
      ) : (
        // Chat Window Screen
        <div className="chat-window">
          <div className="chat-header">
            <p>Live Chat - Room: {room.startsWith('s') ? room.substring(1) : room} (as {authorName})</p>
             <button onClick={exitChat} className="exit-btn">{onExit ? 'Back to Admin' : 'Exit Chat'}</button>
          </div>
          <div className="chat-body" ref={chatBodyRef}>
            {messageList.map((msg) => (
              <div
                key={msg.id}
                className="message-container"
                id={userId === msg.userId ? "you" : "other"}
              >
                <div className="message-content">
                   {editingMessage?.id === msg.id ? (
                        <input
                            autoFocus
                            type="text"
                            className="edit-input"
                            value={editingMessage.text}
                            onChange={(e) => setEditingMessage({ ...editingMessage, text: e.target.value })}
                            onBlur={() => updateMessage(msg.id, editingMessage.text)}
                            onKeyPress={(e) => {
                                if (e.key === "Enter") {
                                    updateMessage(msg.id, editingMessage.text);
                                } else if (e.key === "Escape") {
                                    cancelEditing();
                                }
                            }}
                        />
                    ) : (
                         <p>{msg.message} {msg.edited ? <span className="edited-indicator">(edited)</span> : ''}</p>
                    )}
                </div>
                 <div className="message-meta">
                   {/* **** THIS IS THE RESTORED PART **** */}
                   {/* Show msg.author (which is set by server to Sponsor/Recipient/Admin) */}
                   <p id="author">{msg.author}</p>
                   {/* ************************************** */}
                  <p id="time">{msg.time}</p>
                  {(userId === msg.userId || userType === 'admin') && !editingMessage && (
                    <div className="message-actions">
                      {userId === msg.userId && /* Only author can edit */
                        <button className="action-btn edit-btn" title="Edit" onClick={() => startEditing(msg)}>✎</button>
                      }
                      <button className="action-btn delete-btn" title="Delete" onClick={() => deleteMessage(msg.id)}>🗑️</button>
                    </div>
                  )}
                   {editingMessage?.id === msg.id && (
                       <button className="action-btn cancel-edit-btn" title="Cancel Edit" onClick={cancelEditing}>✖</button>
                   )}
                </div>
              </div>
            ))}
             {messageList.length === 0 && <p className="no-messages">No messages yet.</p>}
          </div>
          <div className="chat-footer">
            <input
              type="text"
              value={message}
              placeholder="Type your message..."
              onChange={(event) => setMessage(event.target.value)}
              onKeyPress={(event) => event.key === 'Enter' && sendMessage()}
            />
            <button onClick={sendMessage} disabled={!message.trim()}>&#9658;</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;