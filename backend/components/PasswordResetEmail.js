const React = require('react');
const ReactDOMServer = require('react-dom/server');

const PasswordResetEmail = ({ resetLink }) => {
  return React.createElement('div', {
    style: {
      fontFamily: 'Arial, sans-serif',
      maxWidth: '600px',
      margin: '0 auto',
      padding: '20px'
    }
  },
    React.createElement('div', {
      style: {
        backgroundColor: '#f8f9fa',
        padding: '30px',
        borderRadius: '10px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)'
      }
    },
      React.createElement('h2', {
        style: {
          color: '#333',
          textAlign: 'center',
          marginBottom: '30px'
        }
      }, 'Password Reset Request'),
      
      React.createElement('p', {
        style: {
          color: '#666',
          fontSize: '16px',
          lineHeight: '1.6'
        }
      }, 'You requested a password reset for your account.'),
      
      React.createElement('p', {
        style: {
          color: '#666',
          fontSize: '16px',
          lineHeight: '1.6'
        }
      }, 'Click the button below to reset your password:'),
      
      React.createElement('div', {
        style: {
          textAlign: 'center',
          margin: '30px 0'
        }
      },
        React.createElement('a', {
          href: resetLink,
          style: {
            backgroundColor: '#007bff',
            color: 'white',
            padding: '15px 30px',
            textDecoration: 'none',
            borderRadius: '5px',
            display: 'inline-block',
            fontWeight: 'bold',
            fontSize: '16px'
          }
        }, 'Reset Password')
      ),
      
      React.createElement('p', {
        style: {
          color: '#666',
          fontSize: '14px',
          lineHeight: '1.6',
          marginTop: '20px'
        }
      }, 'If the button doesn\'t work, copy and paste this link into your browser:'),
      
      React.createElement('p', {
        style: {
          color: '#007bff',
          fontSize: '12px',
          lineHeight: '1.6',
          wordBreak: 'break-all',
          backgroundColor: '#f8f9fa',
          padding: '10px',
          borderRadius: '5px',
          border: '1px solid #e9ecef'
        }
      }, resetLink),
      
      React.createElement('p', {
        style: {
          color: '#666',
          fontSize: '14px',
          lineHeight: '1.6'
        }
      }, 'This link will expire in 60 minutes for security reasons.'),
      
      React.createElement('p', {
        style: {
          color: '#666',
          fontSize: '14px',
          lineHeight: '1.6'
        }
      }, 'If you didn\'t request this password reset, please ignore this email and your password will remain unchanged.'),
      
      React.createElement('hr', {
        style: {
          border: 'none',
          borderTop: '1px solid #eee',
          margin: '30px 0'
        }
      }),
      
      React.createElement('p', {
        style: {
          color: '#999',
          fontSize: '12px',
          textAlign: 'center'
        }
      }, 'This is an automated message. Please do not reply to this email.')
    )
  );
};

const renderEmailToHTML = (resetLink) => {
  const emailElement = React.createElement(PasswordResetEmail, { resetLink });
  return ReactDOMServer.renderToString(emailElement);
};

module.exports = { PasswordResetEmail, renderEmailToHTML };
