// client/src/App.jsx
import { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

const socket = io.connect("http://localhost:3001");

function App() {
  const [username, setUsername] = useState("");
  const [room, setRoom] = useState("");
  const [message, setMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [hasJoined, setHasJoined] = useState(false);

  const joinRoom = () => {
    if (username !== "" && room !== "") {
      socket.emit("join_room", room);
      setHasJoined(true);
    }
  };

  const sendMessage = () => {
    if (message !== "") {
      const messageData = {
        room: room,
        author: username, // Use the username from state
        message: message,
        time: new Date(Date.now()).toLocaleTimeString(),
      };
      socket.emit("send_message", messageData);
      setMessageList((list) => [...list, messageData]);
      setMessage("");
    }
  };

  const exitChat = () => {
    setHasJoined(false);
    setMessageList([]);
  };

  useEffect(() => {
    const handleReceiveMessage = (data) => {
      setMessageList((list) => [...list, data]);
    };
    socket.on("receive_message", handleReceiveMessage);

    return () => {
      socket.off("receive_message", handleReceiveMessage);
    };
  }, [socket]);

  return (
    <div className="App">
      {!hasJoined ? (
        <div className="joinChatContainer">
          <h3>Hey there, join a Chat!</h3>
          <input
            type="text"
            placeholder="Your Name..."
            onChange={(event) => setUsername(event.target.value)}
          />
          <input
            type="text"
            placeholder="Room Code..."
            onChange={(event) => setRoom(event.target.value)}
          />
          <button onClick={joinRoom}>Join Room</button>
        </div>
      ) : (
        <div className="chat-window">
          <div className="chat-header">
            <p>Live Chat - Room: {room}</p>
            <button onClick={exitChat} className="exit-btn">Exit</button>
          </div>
          <div className="chat-body">
            {messageList.map((msg, index) => (
              <div
                key={index}
                className="message"
                id={username === msg.author ? "you" : "other"}
              >
                <div>
                  <div className="message-content">
                    <p>{msg.message}</p>
                  </div>
                  <div className="message-meta">
                    <p id="time">{msg.time}</p>
                    <p id="author">{msg.author}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="chat-footer">
            <input
              type="text"
              value={message}
              placeholder="Hey..."
              onChange={(event) => setMessage(event.target.value)}
              onKeyPress={(event) => event.key === 'Enter' && sendMessage()}
            />
            <button onClick={sendMessage}>&#9658;</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;