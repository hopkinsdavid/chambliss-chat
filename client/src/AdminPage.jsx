// client/src/AdminPage.jsx
import React, { useState, useEffect } from 'react';
import './AdminPage.css'; // We'll create this next
import ChamblissLogo from '/cchorizontal.png';

function AdminPage() {
  const [creatorName, setCreatorName] = useState("Chambliss Admin"); // Default name
  const [newRoomCode, setNewRoomCode] = useState("");
  const [newRoomExpiry, setNewRoomExpiry] = useState("");
  const [activeRooms, setActiveRooms] = useState({});
  const [message, setMessage] = useState("");

  const fetchRooms = async () => {
    try {
      const response = await fetch('http://localhost:3001/admin/rooms');
      if (response.ok) {
        const data = await response.json();
        setActiveRooms(data);
      } else {
        setMessage("Failed to fetch active rooms.");
      }
    } catch (error) {
      setMessage("Error fetching rooms: " + error.message);
    }
  };

  const createRoom = async () => {
    setMessage(""); // Clear previous messages
    try {
      const response = await fetch('http://localhost:3001/admin/create-room', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ creatorName }),
      });

      if (response.ok) {
        const data = await response.json();
        setNewRoomCode(data.roomCode);
        setNewRoomExpiry(data.expiresAt);
        setMessage(`Room ${data.roomCode} created successfully! Expires: ${data.expiresAt}`);
        fetchRooms(); // Refresh the list of active rooms
      } else {
        const errorData = await response.json();
        setMessage(`Failed to create room: ${errorData.message || response.statusText}`);
      }
    } catch (error) {
      setMessage("Error creating room: " + error.message);
    }
  };

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const getExpiryStatus = (expiresAt) => {
    const expiryDate = new Date(expiresAt);
    const now = new Date();
    if (expiryDate < now) {
        return <span style={{ color: 'red', fontWeight: 'bold' }}>Expired</span>;
    }
    // switch the expiry date here 
    const diffHours = Math.round((expiryDate - now) / (1000 * 60 * 60));
    return `Expires in ~${diffHours} hours`;
  };


  return (
    <div className="admin-page">
      <div className="admin-header">
        <img src={ChamblissLogo} alt="Chambliss Center Logo" className="admin-logo" />
        <h1>Chambliss Admin Panel</h1>
      </div>

      <div className="admin-section create-room-section">
        <h2>Create New Chat Room</h2>
        <div className="input-group">
            <label htmlFor="creatorName">Admin Name:</label>
            <input
                id="creatorName"
                type="text"
                value={creatorName}
                onChange={(e) => setCreatorName(e.target.value)}
                placeholder="e.g., Jane Doe"
            />
        </div>
        <button onClick={createRoom}>Generate Room Code</button>
        {message && <p className="admin-message">{message}</p>}
        {newRoomCode && (
          <div className="generated-code">
            <p>New Room Code: <strong className="room-code-display">{newRoomCode}</strong></p>
            <p>Expires: {newRoomExpiry}</p>
            <p>Share this code with the Donor and Recipient.</p>
          </div>
        )}
      </div>

      <div className="admin-section active-rooms-section">
        <h2>Active Chat Rooms</h2>
        {Object.keys(activeRooms).length === 0 ? (
            <p>No active rooms found.</p>
        ) : (
            <table className="rooms-table">
                <thead>
                    <tr>
                        <th>Room Code</th>
                        <th>Created By</th>
                        <th>Created At</th>
                        <th>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(activeRooms).map(([code, data]) => (
                        <tr key={code}>
                            <td><span className="room-code-display">{code}</span></td>
                            <td>{data.creatorName}</td>
                            <td>{new Date(data.createdAt).toLocaleString()}</td>
                            <td>{getExpiryStatus(data.expiresAt)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
      </div>
    </div>
  );
}

export default AdminPage;