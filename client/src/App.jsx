// client/src/App.jsx
import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api')
      .then((res) => res.json())
      .then((data) => setMessage(data.message));
  }, []);

  return (
    <div className="lobby-container" style={{ textAlign: 'center', padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1 style={{ color: '#4A90E2' }}>Hello and Welcome to the Lobby Page!</h1>
      <p style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>
        {message || 'Loading...'}
      </p>
      <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem' }}>
        <button
          style={{
            padding: '1rem 2rem',
            fontSize: '1rem',
            background: '#7ED957',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
          onClick={() => alert('Donor clicked!')}
        >
          Enter as Donor
        </button>
        <button
          style={{
            padding: '1rem 2rem',
            fontSize: '1rem',
            background: '#F9A826',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
          onClick={() => alert('Supporter clicked!')}
        >
          Enter as Supporter
        </button>
      </div>
    </div>
  );
}

export default App;