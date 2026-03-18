import React, { useState } from 'react';
import Login from './Login';
import Home from './Home';

const App = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [dbPath, setDbPath] = useState('');

  const handleLogin = (path) => {
    setDbPath(path);
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setDbPath('');
  };

  return isLoggedIn ? (
    <Home dbPath={dbPath} onLogout={handleLogout} />
  ) : (
    <Login onLogin={handleLogin} />
  );
};

export default App;
