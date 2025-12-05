import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const GoogleOAuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    const role = urlParams.get('role');
    const email = urlParams.get('email');

    if (token && role) {
      // Validate role is valid
      const normalizedRole = role.toLowerCase();
      if (!['dean', 'instructor'].includes(normalizedRole)) {
        console.error('Invalid role received from Google OAuth:', role);
        navigate('/login?error=role_mismatch', { replace: true });
        return;
      }
      
      // Validate role matches the selected role (if available)
      const selectedRole = localStorage.getItem('selectedRole');
      if (selectedRole && selectedRole.toLowerCase() !== normalizedRole) {
        console.error('Role mismatch: selected', selectedRole, 'but received', normalizedRole);
        localStorage.removeItem('token');
        localStorage.removeItem('selectedRole');
        localStorage.removeItem('tokenExpiry');
        navigate('/login?error=role_mismatch', { replace: true });
        return;
      }
      
      // Store authentication data for redirect flow
      localStorage.setItem('token', token);
      localStorage.setItem('selectedRole', normalizedRole);
      const expiryTime = new Date().getTime() + (24 * 60 * 60 * 1000);
      localStorage.setItem('tokenExpiry', expiryTime.toString());
      
      // Store email if provided (required for instructor profile loading)
      if (email) {
        localStorage.setItem('userEmail', email);
      }

      // Redirect to dashboard
      navigate('/dashboard', { replace: true });
    } else {
      // Handle error case - redirect to login with error
      navigate('/login?error=google_auth_failed', { replace: true });
    }
  }, [navigate]);

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      height: '100vh',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{ textAlign: 'center' }}>
        <h2>Completing Google Sign-In...</h2>
        <p>Please wait while we redirect you.</p>
      </div>
    </div>
  );
};

export default GoogleOAuthCallback;
