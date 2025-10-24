import React, { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, useSearchParams } from "react-router-dom";

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [token, setToken] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const tokenFromUrl = searchParams.get("token");
    console.log('ResetPassword: URL search params:', window.location.search);
    console.log('ResetPassword: Token from URL:', tokenFromUrl);
    console.log('ResetPassword: Full URL:', window.location.href);
    
    if (tokenFromUrl) {
      setToken(tokenFromUrl);
      console.log('ResetPassword: Token set successfully');
    } else {
      console.log('ResetPassword: No token found in URL');
      setMessage("Invalid reset link. Please request a new password reset.");
    }
  }, [searchParams]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    if (newPassword !== confirmPassword) {
      setMessage("Passwords do not match");
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setMessage("Password must be at least 6 characters long");
      setLoading(false);
      return;
    }

    try {
      const res = await axios.post("http://localhost:5000/api/auth/reset-password", {
        token,
        newPassword,
      });

      setMessage(res.data.message);
      // Redirect to login after successful reset
      setTimeout(() => {
        navigate("/");
      }, 2000);
    } catch (err) {
      setMessage(err.response?.data?.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Reset Password</h2>
        <p style={styles.subtitle}>Enter your new password</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            style={styles.input}
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />

          <button style={styles.button} type="submit" disabled={loading || !token}>
            {loading ? 'Resetting...' : 'Reset Password'}
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

        {message && <div style={styles.message}>{message}</div>}
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

export default ResetPassword;
