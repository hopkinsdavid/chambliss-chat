// client/src/App.jsx
import { useState, useEffect, useRef } from 'react'; // Import useRef
import io from 'socket.io-client';
import './App.css';
import ChamblissLogo from '/ccvertical.png'; // Import the logo

const socket = io.connect("http://localhost:3001");

function App() {
  const [username, setUsername] = useState("");
  const [room, setRoom] = useState("");
  const [message, setMessage] = useState("");
  const [messageList, setMessageList] = useState([]);
  const [hasJoined, setHasJoined] = useState(false);

  const chatBodyRef = useRef(null); // Ref for auto-scrolling

  const joinRoom = () => {
    if (username !== "" && room !== "") {
      socket.emit("join_room", room);
      setHasJoined(true);
    }
  };

  const sendMessage = () => {
    if (message.trim() !== "") { // Trim to prevent sending empty messages
      const messageData = {
        room: room,
        author: username,
        message: message,
        time: new Date(Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), // Nicer time format
      };
      socket.emit("send_message", messageData);
      setMessageList((list) => [...list, messageData]);
      setMessage(""); // Clear the input after sending
    }
  };

  const exitChat = () => {
    setHasJoined(false);
    setRoom(""); // Clear room and username when exiting
    setUsername("");
    setMessageList([]);
  };

  useEffect(() => {
    const handleReceiveMessage = (data) => {
      setMessageList((list) => [...list, data]);
    };
    socket.on("receive_message", handleReceiveMessage);

    // Cleanup function to remove the event listener when component unmounts
    return () => {
      socket.off("receive_message", handleReceiveMessage);
    };
  }, [socket]);

  // Auto-scroll to the bottom of the chat when new messages arrive
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
        </div>
      ) : (
        <div className="chat-window">
          <div className="chat-header">
            <p>Live Chat - Room: {room}</p>
            <button onClick={exitChat} className="exit-btn">Exit</button>
          </div>
          <div className="chat-body" ref={chatBodyRef}>
            {messageList.map((msg, index) => (
              <div
                key={index}
                className="message-container"
                id={username === msg.author ? "you" : "other"}
              >
                <div className="message-content">
                  <p>{msg.message}</p>
                </div>
                <div className="message-meta">
                  <p id="author">{msg.author}</p>
                  <p id="time">{msg.time}</p>
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
              style={{ backgroundColor: "#666464ff", color: "#0a0909ff" }} // Force white background and black text
            />
            <button onClick={sendMessage}>&#9658;</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;