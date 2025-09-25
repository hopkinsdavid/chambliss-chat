// LoginPage.jsx
import React, { useState } from 'react';
import './LoginPage.css'; 
import ChamblissLogo from '/cchorizontal.png';

function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {

    // TEMPORARY!!!! SWITCH THIS
    if (username === 'admin' && password === 'password') {
      onLoginSuccess();
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <img src={ChamblissLogo} alt="Chambliss Center Logo" className="login-logo" />
        <h2>Admin Login</h2>
        <div className="input-group">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter your username"
          />
        </div>
        <div className="input-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
          />
        </div>
        {error && <p className="login-error">{error}</p>}
        <button onClick={handleLogin}>Login</button>
      </div>
    </div>
  );
}

export default LoginPage;