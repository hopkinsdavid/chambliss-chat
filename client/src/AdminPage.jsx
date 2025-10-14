// client/src/AdminPage.jsx
import React, { useState, useEffect } from 'react';
import './AdminPage.css';
import ChamblissLogo from '/cchorizontal.png';
import App from './App';
import LoginPage from './LoginPage';

function AdminPage() {
  const [creatorName, setCreatorName] = useState("Chambliss Admin");
  const [newSponsorCode, setNewSponsorCode] = useState("");
  const [newRecipientCode, setNewRecipientCode] = useState("");
  const [newRoomExpiry, setNewRoomExpiry] = useState("");
  const [activeRooms, setActiveRooms] = useState({});
  const [message, setMessage] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [editingRoomCode, setEditingRoomCode] = useState(null);
  const [editCreatorName, setEditCreatorName] = useState("");
  const [viewingRoom, setViewingRoom] = useState(null);
  const [expirationHours, setExpirationHours] = useState(24);
  const [extendingRoomCode, setExtendingRoomCode] = useState(null);
  const [extensionHours, setExtensionHours] = useState(1);

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
    setMessage("");
    try {
      const response = await fetch('http://localhost:3001/admin/create-room', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ creatorName, expirationHours }),
      });

      if (response.ok) {
        const data = await response.json();
        setNewSponsorCode(data.sponsorCode);
        setNewRecipientCode(data.recipientCode);
        setNewRoomExpiry(data.expiresAt);
        setMessage(`Room ${data.recipientCode} created successfully!`);
        fetchRooms();
      } else {
        const errorData = await response.json();
        setMessage(`Failed to create room: ${errorData.message || response.statusText}`);
      }
    } catch (error) {
      setMessage("Error creating room: " + error.message);
    }
  };

  const handleDeleteRoom = async (roomCode) => {
      if (window.confirm(`Are you sure you want to delete room ${roomCode}?`)) {
          try {
              const response = await fetch(`http://localhost:3001/admin/rooms/${roomCode}`, { method: 'DELETE' });
              if (response.ok) {
                  setMessage(`Room ${roomCode} deleted successfully.`);
                  fetchRooms();
              } else {
                  setMessage("Failed to delete room.");
              }
          } catch (error) {
              setMessage("Error deleting room.");
          }
      }
  };

  const handleUpdateRoom = async (roomCode) => {
      try {
          const response = await fetch(`http://localhost:3001/admin/rooms/${roomCode}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ creatorName: editCreatorName })
          });

          if (response.ok) {
              setMessage(`Room ${roomCode} updated.`);
              setEditingRoomCode(null);
              fetchRooms();
          } else {
              setMessage("Failed to update room.");
          }
      } catch (error) {
          setMessage("Error updating room.");
      }
  };

  const handleExtendRoom = async (roomCode) => {
    try {
        const response = await fetch(`http://localhost:3001/admin/rooms/${roomCode}/extend`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hours: extensionHours })
        });

        if (response.ok) {
            setMessage(`Room ${roomCode} extended by ${extensionHours} hours.`);
            setExtendingRoomCode(null); // Exit extension mode
            fetchRooms(); // Refresh the list
        } else {
            setMessage("Failed to extend room.");
        }
    } catch (error) {
        setMessage("Error extending room.");
    }
  };

  const startEditing = (room) => {
        setEditingRoomCode(room.code);
        setEditCreatorName(room.data.creatorName);
        setExtendingRoomCode(null);
  };

  const startExtending = (roomCode) => {
    setExtendingRoomCode(roomCode);
    setEditingRoomCode(null);
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchRooms();
      const interval = setInterval(fetchRooms, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const getExpiryStatus = (expiresAt) => {
    const expiryDate = new Date(expiresAt);
    const now = new Date();
    if (expiryDate < now) {
        return <span style={{ color: 'red', fontWeight: 'bold' }}>Expired</span>;
    }
    const diffHours = Math.round((expiryDate - now) / (1000 * 60 * 60));
    return `Expires in ~${diffHours} hours`;
  };

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  if (viewingRoom) {
    return <App room={viewingRoom} username="Admin" userType="admin" onExit={() => setViewingRoom(null)} />;
  }

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
        <div className="input-group">
            <label htmlFor="expirationHours">Expires in (hours):</label>
            <input
                id="expirationHours"
                type="number"
                value={expirationHours}
                onChange={(e) => {
                    const hours = parseInt(e.target.value, 10);
                    if (hours > 0) {
                        setExpirationHours(hours);
                    }
                }}
                min="0"
                placeholder="e.g., 24"
            />
        </div>
        <button onClick={createRoom}>Generate Room Codes</button>
        {message && <p className="admin-message">{message}</p>}
        {newSponsorCode && (
          <div className="generated-code">
            <p>Sponsor Code: <strong className="room-code-display">{newSponsorCode}</strong></p>
            <p>Recipient Code: <strong className="room-code-display">{newRecipientCode}</strong></p>
            <p>Expires: {newRoomExpiry}</p>
            <p>Share these codes with the correct individuals.</p>
          </div>
        )}
      </div>

      <div className="admin-section active-rooms-section">
        <h2>Active Chat Rooms</h2>
        <table className="rooms-table">
            <thead>
                <tr>
                    <th>Room Code</th>
                    <th>Created By</th>
                    <th>Created At</th>
                    <th>Status</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                {Object.entries(activeRooms).map(([code, data]) => (
                    <tr key={code}>
                        <td>{code}</td>
                        <td>
                            {editingRoomCode === code ? (
                                <input
                                    type="text"
                                    value={editCreatorName}
                                    onChange={(e) => setEditCreatorName(e.target.value)}
                                />
                            ) : (
                                data.creatorName
                            )}
                        </td>
                        <td>{new Date(data.createdAt).toLocaleString()}</td>
                        <td>{getExpiryStatus(data.expiresAt)}</td>
                        <td>
                            {editingRoomCode === code ? (
                                <>
                                    <button className="save-btn" onClick={() => handleUpdateRoom(code)}>Save</button>
                                    <button className="cancel-btn" onClick={() => setEditingRoomCode(null)}>Cancel</button>
                                </>
                            ) : extendingRoomCode === code ? (
                                <>
                                    <input
                                        type="number"
                                        value={extensionHours}
                                        onChange={(e) => {
                                            const hours = parseInt(e.target.value, 10);
                                            if (hours > 0) setExtensionHours(hours);
                                        }}
                                        min="0"
                                        style={{ width: '50px', marginRight: '5px' }}
                                    />
                                    <button className="save-btn" onClick={() => handleExtendRoom(code)}>Confirm</button>
                                    <button className="cancel-btn" onClick={() => setExtendingRoomCode(null)}>Cancel</button>
                                </>
                            ) : (
                                <>
                                    <button className="view-btn" onClick={() => setViewingRoom(code)}>View</button>
                                    <button className="edit-btn" onClick={() => startEditing({ code, data })}>Edit</button>
                                    <button className="extend-btn" onClick={() => startExtending(code)}>Extend</button>
                                    <button className="delete-btn" onClick={() => handleDeleteRoom(code)}>Delete</button>
                                </>
                            )}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
</div>
);
}

export default AdminPage;