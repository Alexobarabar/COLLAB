import React, { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const res = await axios.post("http://localhost:5000/api/auth/forgot-password", {
        email,
      });

      setMessage(res.data.message);
    } catch (err) {
      console.error('Forgot password error:', err);
      if (err.response?.data?.details) {
        setMessage(`Error: ${err.response.data.message}. Details: ${err.response.data.details}`);
      } else {
        setMessage(err.response?.data?.message || "An error occurred. Please check your email configuration.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Forgot Password</h2>
        <p style={styles.subtitle}>Enter your email to receive a reset link</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            style={styles.input}
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <button style={styles.button} type="submit" disabled={loading}>
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div style={styles.backToLogin}>
          <button
            style={styles.backButton}
            onClick={() => navigate("/")}
          >
            Back to Login
          </button>
        </div>

        {message && (
          <div style={{
            ...styles.message,
            backgroundColor: message.includes('Error') || message.includes('error') ? '#f8d7da' : '#d4edda',
            color: message.includes('Error') || message.includes('error') ? '#721c24' : '#155724',
            border: message.includes('Error') || message.includes('error') ? '1px solid #f5c6cb' : '1px solid #c3e6cb'
          }}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: {
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  },
  card: {
    background: "#fff",
    padding: "2.5rem",
    borderRadius: "15px",
    boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
    width: "400px",
    textAlign: "center",
  },
  title: {
    margin: "0 0 0.5rem 0",
    color: "#333",
    fontSize: "28px",
    fontWeight: "600",
  },
  subtitle: {
    margin: "0 0 2rem 0",
    color: "#666",
    fontSize: "16px",
  },
  form: {
    marginTop: "1.5rem",
  },
  input: {
    width: "100%",
    padding: "12px 16px",
    marginBottom: "1rem",
    border: "2px solid #e1e5e9",
    borderRadius: "8px",
    fontSize: "16px",
    transition: "border-color 0.3s ease",
    boxSizing: "border-box",
  },
  button: {
    width: "100%",
    padding: "12px",
    background: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "500",
    transition: "background-color 0.3s ease",
    marginTop: "0.5rem",
  },
  backToLogin: {
    marginTop: "1rem",
    textAlign: "center",
  },
  backButton: {
    background: "none",
    border: "none",
    color: "#007bff",
    cursor: "pointer",
    fontSize: "14px",
    textDecoration: "underline",
    transition: "color 0.3s ease",
  },
  message: {
    marginTop: "1rem",
    padding: "10px",
    borderRadius: "5px",
    fontSize: "14px",
    backgroundColor: "#d4edda",
    color: "#155724",
    border: "1px solid #c3e6cb",
  },
};

export default ForgotPassword;
