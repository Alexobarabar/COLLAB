import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import RoleSelection from "./component/RoleSelection.jsx";
import LoginPage from "./component/LoginPage.jsx";
import GoogleOAuthCallback from "./component/GoogleOAuthCallback.jsx";
import Dashboard from "./components/Dashboard.jsx";
import InstructorDashboard from "./components/InstructorDashboard.jsx";
import ForgotPassword from "./components/ForgotPassword.jsx";
import ResetPassword from "./components/ResetPassword.jsx";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState(null);
  const [userEmail, setUserEmail] = useState(null);

  useEffect(() => {
    // Check for Google OAuth token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const googleToken = urlParams.get('token');
    const googleRole = urlParams.get('role');
    const googleEmail = urlParams.get('email');
    
    if (googleToken) {
      // Store Google OAuth token and related data
      localStorage.setItem('token', googleToken);
      const expiryTime = new Date().getTime() + (24 * 60 * 60 * 1000);
      localStorage.setItem('tokenExpiry', expiryTime.toString());
      
      // Store role and email if provided
      if (googleRole) {
        localStorage.setItem('selectedRole', googleRole);
        setSelectedRole(googleRole);
      }
      if (googleEmail) {
        localStorage.setItem('userEmail', googleEmail);
        setUserEmail(googleEmail);
      }
      
      setIsAuthenticated(true);
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    
    // Check if user is authenticated (e.g., check localStorage or token)
    const token = localStorage.getItem('token');
    const tokenExpiry = localStorage.getItem('tokenExpiry');
    const storedRole = localStorage.getItem('selectedRole');
    const storedEmail = localStorage.getItem('userEmail');
    
    if (token && tokenExpiry) {
      // Check if token has expired
      const now = new Date().getTime();
      const expiryTime = parseInt(tokenExpiry);
      
      if (now < expiryTime) {
        setIsAuthenticated(true);
        // Restore selected role if available
        if (storedRole) {
          setSelectedRole(storedRole);
        }
        if (storedEmail) {
          setUserEmail(storedEmail);
        }
      } else {
        // Token expired, clear it
        localStorage.removeItem('token');
        localStorage.removeItem('tokenExpiry');
        localStorage.removeItem('selectedRole');
        localStorage.removeItem('userEmail');
      }
    }
    setLoading(false);
  }, []);

  const handleLogin = (email) => {
    setIsAuthenticated(true);
    if (email) {
      setUserEmail(email);
      localStorage.setItem('userEmail', email);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('tokenExpiry');
    localStorage.removeItem('selectedRole');
    localStorage.removeItem('userEmail');
    setIsAuthenticated(false);
    setSelectedRole(null);
    setUserEmail(null);
  };

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    // Store selected role in localStorage for persistence
    localStorage.setItem('selectedRole', role);
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>;
  }

  return (
    <Router>
      <div className="App">
        <Routes>
          <Route
            path="/"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : selectedRole ? (
                <Navigate to="/login" replace />
              ) : (
                <RoleSelection onRoleSelect={handleRoleSelect} />
              )
            }
          />
          <Route
            path="/login"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : selectedRole ? (
                <LoginPage onLogin={handleLogin} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route
            path="/forgot-password"
            element={
              isAuthenticated ? (
                <Navigate to="/dashboard" replace />
              ) : (
                <ForgotPassword />
              )
            }
          />
          <Route
            path="/reset-password"
            element={<ResetPassword />}
          />
          <Route
            path="/reset-password/:token"
            element={<ResetPassword />}
          />
          <Route
            path="/auth/google/callback"
            element={<GoogleOAuthCallback />}
          />
          <Route
            path="/dashboard"
            element={
              isAuthenticated ? (
                (() => {
                  // Validate role is present and valid
                  const currentRole = selectedRole || localStorage.getItem('selectedRole');
                  if (!currentRole || !['dean', 'instructor'].includes(currentRole.toLowerCase())) {
                    // Invalid or missing role - redirect to role selection
                    handleLogout();
                    return <Navigate to="/" replace />;
                  }
                  
                  // Route based on validated role
                  if (currentRole.toLowerCase() === 'instructor') {
                    return <InstructorDashboard onLogout={handleLogout} userEmail={userEmail} />;
                  } else {
                    return <Dashboard onLogout={handleLogout} userRole={currentRole} />;
                  }
                })()
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />

        </Routes>
      </div>
    </Router>
  );
}

export default App;
