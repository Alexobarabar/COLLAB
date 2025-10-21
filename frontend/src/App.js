import React, { useEffect, useState } from 'react';
import logo from './logo.svg';
import './App.css';
import { getHealth } from './api/client';

function App() {
  const [backendStatus, setBackendStatus] = useState('Checking backend...');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    getHealth()
      .then((data) => {
        const message =
          data && data.success ? 'Backend connected ✅' : 'Unexpected response';
        setBackendStatus(message);
      })
      .catch((err) => {
        setBackendStatus('Backend not reachable ❌');
        setErrorMessage(
          (err && (err.body && err.body.message)) ||
            err.message ||
            'Unknown error'
        );
      });
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>{backendStatus}</p>
        {errorMessage ? <small style={{ color: '#ffb3b3' }}>{errorMessage}</small> : null}
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
