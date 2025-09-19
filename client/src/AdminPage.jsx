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
  const [isAuthenticated, setIsAuthenticated] = useState(true); // Placeholder for auth state
  const [editingRoomCode, setEditingRoomCode] = useState(null); // Track which room is being edited
  const [editCreatorName, setEditCreatorName] = useState(""); // Temp state for editing creator name

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

  // Function to handle deleting a room
  const handleDeleteRoom = async (roomCode) => {
      if (window.confirm(`Are you sure you want to delete room ${roomCode}?`)) {
          try {
              const response = await fetch(`http://localhost:3001/admin/rooms/${roomCode}`, { method: 'DELETE' });
              if (response.ok) {
                  setMessage(`Room ${roomCode} deleted successfully.`);
                  fetchRooms(); // Refresh the list
              } else {
                  setMessage("Failed to delete room.");
              }
          } catch (error) {
              setMessage("Error deleting room.");
          }
      }
  };

  // Function to handle updating a room
  const handleUpdateRoom = async (roomCode) => {
      try {
          const response = await fetch(`http://localhost:3001/admin/rooms/${roomCode}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ creatorName: editCreatorName })
          });

          if (response.ok) {
              setMessage(`Room ${roomCode} updated.`);
              setEditingRoomCode(null); // Exit edit mode
              fetchRooms(); // Refresh the list
          } else {
              setMessage("Failed to update room.");
          }
      } catch (error) {
          setMessage("Error updating room.");
      }
  };

  // Function to enter edit mode 
  const startEditing = (room) => {
        setEditingRoomCode(room.code);
        setEditCreatorName(room.data.creatorName);
    };

    useEffect(() => {
        if (isAuthenticated) fetchRooms();
    }, [isAuthenticated]);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  // its not working rn. its supposed to show expired in the admin page. okay its somewhat working 
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
                            ) : (
                                <>
                                    <button className="edit-btn" onClick={() => startEditing({ code, data })}>Edit</button>
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