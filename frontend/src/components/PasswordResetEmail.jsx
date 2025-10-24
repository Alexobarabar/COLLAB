import React from 'react';

const PasswordResetEmail = ({ resetLink }) => {
  return (
    <div style={{
      fontFamily: 'Arial, sans-serif',
      maxWidth: '600px',
      margin: '0 auto',
      padding: '20px'
    }}>
      <div style={{
        backgroundColor: '#f8f9fa',
        padding: '30px',
        borderRadius: '10px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{
          color: '#333',
          textAlign: 'center',
          marginBottom: '30px'
        }}>
          Password Reset Request
        </h2>
        
        <p style={{
          color: '#666',
          fontSize: '16px',
          lineHeight: '1.6'
        }}>
          You requested a password reset for your account.
        </p>
        
        <p style={{
          color: '#666',
          fontSize: '16px',
          lineHeight: '1.6'
        }}>
          Click the button below to reset your password:
        </p>
        
        <div style={{
          textAlign: 'center',
          margin: '30px 0'
        }}>
          <a 
            href={resetLink}
            style={{
              backgroundColor: '#007bff',
              color: 'white',
              padding: '15px 30px',
              textDecoration: 'none',
              borderRadius: '5px',
              display: 'inline-block',
              fontWeight: 'bold',
              fontSize: '16px'
            }}
          >
            Reset Password
          </a>
        </div>
        
        <p style={{
          color: '#666',
          fontSize: '14px',
          lineHeight: '1.6'
        }}>
          This link will expire in 60 minutes for security reasons.
        </p>
        
        <p style={{
          color: '#666',
          fontSize: '14px',
          lineHeight: '1.6'
        }}>
          If you didn't request this password reset, please ignore this email and your password will remain unchanged.
        </p>
        
        <hr style={{
          border: 'none',
          borderTop: '1px solid #eee',
          margin: '30px 0'
        }} />
        
        <p style={{
          color: '#999',
          fontSize: '12px',
          textAlign: 'center'
        }}>
          This is an automated message. Please do not reply to this email.
        </p>
      </div>
    </div>
  );
};

export default PasswordResetEmail;
