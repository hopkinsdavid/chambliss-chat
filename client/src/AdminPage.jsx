import React, { useState, useEffect } from 'react';
import './AdminPage.css';
import ChamblissLogo from '/cchorizontal.png';
import App from './App'; // Assuming App is the chat component
import LoginPage from './LoginPage'; // Assuming LoginPage handles admin auth

// Define the API URL using environment variables
// Fallback to localhost for local development
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function AdminPage() {
  const [creatorName, setCreatorName] = useState("Chambliss Admin");
  const [newSponsorCode, setNewSponsorCode] = useState("");
  const [newRecipientCode, setNewRecipientCode] = useState("");
  const [newRoomExpiry, setNewRoomExpiry] = useState("");
  const [activeRooms, setActiveRooms] = useState({});
  const [message, setMessage] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false); // Handle admin authentication
  const [editingRoomCode, setEditingRoomCode] = useState(null);
  const [editCreatorName, setEditCreatorName] = useState("");
  const [viewingRoom, setViewingRoom] = useState(null); // State to view/join a room as admin
  const [expirationHours, setExpirationHours] = useState(24);
  const [extendingRoomCode, setExtendingRoomCode] = useState(null); // State for extending expiry
  const [extensionHours, setExtensionHours] = useState(1); // Default extension hours

  // Fetch active rooms from the backend
  const fetchRooms = async () => {
    try {
      // Use the API_URL variable
      const response = await fetch(`${API_URL}/admin/rooms`);
      if (response.ok) {
        const data = await response.json();
        setActiveRooms(data);
      } else {
        setMessage("Failed to fetch active rooms.");
        console.error("Failed to fetch rooms:", response.status, await response.text());
      }
    } catch (error) {
      setMessage("Error fetching rooms: " + error.message);
      console.error("Error fetching rooms:", error);
    }
  };

  // Create a new room
  const createRoom = async () => {
    setMessage(""); // Clear previous messages
    try {
      // Use the API_URL variable
      const response = await fetch(`${API_URL}/admin/create-room`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ creatorName, expirationHours }), // Send expiration time
      });

      if (response.ok) {
        const data = await response.json();
        setNewSponsorCode(data.sponsorCode);
        setNewRecipientCode(data.recipientCode);
        setNewRoomExpiry(data.expiresAt); // Display expiry
        setMessage(`Room ${data.recipientCode} created successfully!`);
        fetchRooms(); // Refresh the list after creation
      } else {
        const errorData = await response.json();
        setMessage(`Failed to create room: ${errorData.message || response.statusText}`);
         console.error("Failed to create room:", response.status, errorData);
      }
    } catch (error) {
      setMessage("Error creating room: " + error.message);
      console.error("Error creating room:", error);
    }
  };

   // Delete a room
   const handleDeleteRoom = async (roomCode) => {
      if (window.confirm(`Are you sure you want to delete room ${roomCode}? This action cannot be undone.`)) {
          try {
              // Use the API_URL variable
              const response = await fetch(`${API_URL}/admin/rooms/${roomCode}`, { method: 'DELETE' });
              if (response.ok) {
                  setMessage(`Room ${roomCode} deleted successfully.`);
                  fetchRooms(); // Refresh list
              } else {
                  setMessage("Failed to delete room.");
                  console.error("Failed to delete room:", response.status, await response.text());
              }
          } catch (error) {
              setMessage("Error deleting room: " + error.message);
              console.error("Error deleting room:", error);
          }
      }
  };

  // Update room creator name
  const handleUpdateRoom = async (roomCode) => {
      try {
           // Use the API_URL variable
          const response = await fetch(`${API_URL}/admin/rooms/${roomCode}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ creatorName: editCreatorName })
          });

          if (response.ok) {
              setMessage(`Room ${roomCode} updated.`);
              setEditingRoomCode(null); // Exit editing mode
              fetchRooms(); // Refresh the list
          } else {
              setMessage("Failed to update room.");
               console.error("Failed to update room:", response.status, await response.text());
          }
      } catch (error) {
          setMessage("Error updating room: " + error.message);
           console.error("Error updating room:", error);
      }
  };

   // Extend room expiration
  const handleExtendRoom = async (roomCode) => {
    try {
        // Use the API_URL variable
        const response = await fetch(`${API_URL}/admin/rooms/${roomCode}/extend`, {
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
            console.error("Failed to extend room:", response.status, await response.text());
        }
    } catch (error) {
        setMessage("Error extending room: " + error.message);
        console.error("Error extending room:", error);
    }
  };

  // Enter editing mode for a room
  const startEditing = (room) => {
      setEditingRoomCode(room.code);
      setEditCreatorName(room.data.creatorName);
      setExtendingRoomCode(null); // Exit extending mode if active
  };

   // Enter extending mode for a room
  const startExtending = (roomCode) => {
    setExtendingRoomCode(roomCode);
    setEditingRoomCode(null); // Exit editing mode if active
  };

  // Fetch rooms periodically if authenticated
  useEffect(() => {
    if (isAuthenticated) {
      fetchRooms(); // Initial fetch
      const interval = setInterval(fetchRooms, 30000); // Refresh every 30 seconds
      return () => clearInterval(interval); // Cleanup interval on component unmount
    }
  }, [isAuthenticated]); // Rerun effect if authentication status changes

  // Helper to display expiry status
  const getExpiryStatus = (expiresAt) => {
      const expiryDate = new Date(expiresAt);
      const now = new Date();
      if (expiryDate < now) {
          return <span style={{ color: 'red', fontWeight: 'bold' }}>Expired</span>;
      }
      const diffMillis = expiryDate - now;
      const diffHours = Math.round(diffMillis / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMillis / (1000 * 60 * 60 * 24));

       if (diffDays > 0) {
            return `Expires in ~${diffDays} day(s)`;
       } else {
            return `Expires in ~${diffHours} hour(s)`;
       }
  };

   // Callback for successful login
   const handleLoginSuccess = () => {
    setIsAuthenticated(true);
  };

  // --- Render Logic ---

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

  // Show the chat component if viewing a room
   if (viewingRoom) {
    // Pass the base room code, admin username, userType, and an exit function
    return <App
             room={viewingRoom}
             username="Admin" // Or use creatorName state if needed
             userType="admin"
             onExit={() => setViewingRoom(null)} // Function to return to admin panel
           />;
  }

  // Show the main admin panel
  return (
    <div className="admin-page">
      <div className="admin-header">
        <img src={ChamblissLogo} alt="Chambliss Center Logo" className="admin-logo" />
        <h1>Chambliss Admin Panel</h1>
      </div>

      {/* Section to Create New Room */}
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
                     // Allow setting to 0 or positive, default to 24 if invalid
                    setExpirationHours(hours >= 0 ? hours : 24);
                }}
                min="0" // Allow 0 for potentially indefinite rooms (handle logic server-side if needed)
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

      {/* Section to Display Active Rooms */}
      <div className="admin-section active-rooms-section">
        <h2>Active Chat Rooms ({Object.keys(activeRooms).length})</h2>
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
                  {/* Inline edit for creator name */}
                  {editingRoomCode === code ? (
                    <input
                      type="text"
                      value={editCreatorName}
                      onChange={(e) => setEditCreatorName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleUpdateRoom(code)}
                       autoFocus
                    />
                  ) : (
                    data.creatorName
                  )}
                </td>
                <td>{new Date(data.createdAt).toLocaleString()}</td>
                 <td>{getExpiryStatus(data.expiresAt)}</td>
                <td>
                    {/* Conditional rendering for actions based on editing/extending state */}
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
                                setExtensionHours(hours > 0 ? hours : 1); // Ensure positive
                            }}
                            min="1"
                            style={{ width: '50px', marginRight: '5px' }}
                             autoFocus
                        /> hours
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
            {Object.keys(activeRooms).length === 0 && (
                <tr>
                    <td colSpan="5" style={{ textAlign: 'center' }}>No active rooms.</td>
                </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default AdminPage;