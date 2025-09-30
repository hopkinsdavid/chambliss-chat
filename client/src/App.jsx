// client/src/App.jsx
import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';
import ChamblissLogo from '/ccvertical.png';
import { v4 as uuidv4 } from 'uuid'; // Import uuid

const socket = io.connect("http://localhost:3001");

function App({ room: initialRoom, username: initialUsername, userType = 'user', onExit }) {
  const [username, setUsername] = useState(initialUsername || "");
  const [room, setRoom] = useState(initialRoom || "");
  const [message, setMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [hasJoined, setHasJoined] = useState(!!(initialRoom && initialUsername));
  const [joinError, setJoinError] = useState("");
  const [editingMessage, setEditingMessage] = useState(null); // Track which message is being edited
  const [userId, setUserId] = useState(localStorage.getItem('userId')); // For session persistence

  const chatBodyRef = useRef(null);

  const joinRoom = () => {
    if (username !== "" && room !== "") {
      // Pass userId and userType when joining a room
      socket.emit("join_room", { roomCode: room, userId, userType });
    }
  };

  useEffect(() => {
    if (initialRoom && initialUsername) {
      joinRoom();
    }
  }, [initialRoom, initialUsername]);

  const sendMessage = () => {
    if (message.trim() !== "") {
      const messageData = {
        id: uuidv4(), // Add a unique ID
        room: room,
        author: username,
        message: message,
        time: new Date(Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      socket.emit("send_message", messageData);
      setMessageList((list) => [...list, messageData]);
      setMessage("");
    }
  };

  const updateMessage = (id, newMessage) => {
    if (newMessage.trim() === "") {
      deleteMessage(id); // If the edited message is empty, delete it
      return;
    }
    const messageData = {
      id: id,
      room: room,
      message: newMessage,
    };
    socket.emit("update_message", messageData);
    // Update the message in the local state
    setMessageList((list) =>
      list.map((msg) => (msg.id === id ? { ...msg, message: newMessage } : msg))
    );
    setEditingMessage(null); // Exit editing mode
  };

  const deleteMessage = (id) => {
    socket.emit("delete_message", { id, room });
    // Remove the message from the local state
    setMessageList((list) => list.filter((msg) => msg.id !== id));
  };


  const exitChat = () => {
    if (onExit) {
      onExit();
    } else {
      setHasJoined(false);
      setRoom("");
      setUsername("");
      setMessageList([]);
    }
  };

  useEffect(() => {
    const handleReceiveMessage = (data) => {
      setMessageList((list) => [...list, data]);
    };

    const handleRoomJoinStatus = (data) => {
      if (data.success) {
        setHasJoined(true);
        setJoinError("");
        if (data.userId) {
          // Save the userId to localStorage for session persistence
          localStorage.setItem('userId', data.userId);
          setUserId(data.userId);
        }
      } else {
        setHasJoined(false);
        setJoinError(data.message);
      }
    };

    const handleRoomClosed = (data) => {
      alert(data.message);
      exitChat();
    };

    const handleMessageUpdated = (data) => {
      setMessageList((list) =>
        list.map((msg) =>
          msg.id === data.id ? { ...msg, message: data.message } : msg
        )
      );
    };

    const handleMessageDeleted = (data) => {
      setMessageList((list) => list.filter((msg) => msg.id !== data.id));
    };

    const handleMessageHistory = (history) => {
      setMessageList(history);
    }


    socket.on("receive_message", handleReceiveMessage);
    socket.on("room_join_status", handleRoomJoinStatus);
    socket.on("room_closed", handleRoomClosed);
    socket.on("message_updated", handleMessageUpdated);
    socket.on("message_deleted", handleMessageDeleted);
    socket.on("message_history", handleMessageHistory);


    return () => {
      socket.off("receive_message", handleReceiveMessage);
      socket.off("room_join_status", handleRoomJoinStatus);
      socket.off("room_closed", handleRoomClosed);
      socket.off("message_updated", handleMessageUpdated);
      socket.off("message_deleted", handleMessageDeleted);
      socket.off("message_history", handleMessageHistory);
    };
  }, [socket]);

  useEffect(() => {
    if (chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [messageList]);


  return (
    <div className="App">
      {!hasJoined ? (
        <div className="joinChatContainer">
          <img src={ChamblissLogo} alt="Chambliss Center Logo" />
          <h3>Hey there, join a Chat!</h3>
          <input
            type="text"
            placeholder="Your Name..."
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onKeyPress={(event) => {
              event.key === "Enter" && joinRoom();
            }}
          />
          <input
            type="text"
            placeholder="Room Code..."
            value={room}
            onChange={(event) => setRoom(event.target.value)}
            onKeyPress={(event) => {
              event.key === "Enter" && joinRoom();
            }}
          />
          <button onClick={joinRoom}>Join Room</button>
          {joinError && <p className="error-message">{joinError}</p>}
        </div>
      ) : (
        <div className="chat-window">
          <div className="chat-header">
            <p>Live Chat - Room: {room}</p>
            <button onClick={exitChat} className="exit-btn">{onExit ? 'Back to Admin' : 'Exit'}</button>
          </div>
          <div className="chat-body" ref={chatBodyRef}>
            {messageList.map((msg) => (
              <div
                key={msg.id}
                className="message-container"
                id={username === msg.author ? "you" : "other"}
              >
                <div className="message-content">
                  {editingMessage === msg.id ? (
                    <input
                      autoFocus
                      type="text"
                      className="edit-input"
                      defaultValue={msg.message}
                      onBlur={(e) => updateMessage(msg.id, e.target.value)}
                      onKeyPress={(e) => {
                        if (e.key === "Enter") {
                          updateMessage(msg.id, e.target.value);
                        }
                      }}
                    />
                  ) : (
                    <p>{msg.message}</p>
                  )}
                </div>
                <div className="message-meta">
                  <p id="author">{msg.author}</p>
                  <p id="time">{msg.time}</p>
                  {(username === msg.author || username === 'Admin') && !editingMessage && (
                    <div className="message-actions">
                      <button className="action-btn" onClick={() => setEditingMessage(msg.id)}>✎</button>
                      <button className="action-btn delete-btn" onClick={() => deleteMessage(msg.id)}>🗑️</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="chat-footer">
            <input
              type="text"
              value={message}
              placeholder="I would like to..."
              onChange={(event) => setMessage(event.target.value)}
              onKeyPress={(event) => event.key === 'Enter' && sendMessage()}
              style={{ backgroundColor: "#666464ff", color: "#0a0909ff" }}
            />
            <button onClick={sendMessage}>&#9658;</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;