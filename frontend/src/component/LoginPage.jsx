import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import ReCAPTCHA from "react-google-recaptcha";

const LoginPage = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState("");
  const recaptchaRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Handle Google OAuth errors from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const error = urlParams.get('error');
    
    if (error) {
      let errorMessage = "Google login failed. Please try again.";
      
      switch (error) {
        case 'google_auth_failed':
          errorMessage = "Google authentication failed. Please try again.";
          break;
        case 'no_user_found':
          errorMessage = "User not found after Google authentication.";
          break;
        case 'callback_error':
          errorMessage = "Error processing Google login. Please try again.";
          break;
        default:
          errorMessage = `Google login error: ${error}`;
      }
      
      setMessage(errorMessage);
      
      // Clear the error from URL
      navigate('/login', { replace: true });
    }
  }, [location.search, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");

    // Check if reCAPTCHA is completed
    if (!recaptchaToken) {
      setMessage("Please complete the reCAPTCHA verification");
      setLoading(false);
      return;
    }

    try {
      const res = await axios.post("http://localhost:5000/api/auth/login", {
        email,
        password,
        recaptchaToken,
      });

      if (res.data.success) {
        // Store authentication token (assuming backend returns one)
        localStorage.setItem('token', res.data.token || 'authenticated');
        // Set token expiry to 24 hours from now
        const expiryTime = new Date().getTime() + (24 * 60 * 60 * 1000);
        localStorage.setItem('tokenExpiry', expiryTime.toString());
        onLogin();
        navigate("/dashboard");
      } else {
        setMessage(res.data.message || "Login failed");
        // Reset reCAPTCHA on failure
        if (recaptchaRef.current) {
          recaptchaRef.current.reset();
          setRecaptchaToken("");
        }
      }
    } catch (err) {
      setMessage(err.response?.data?.message || "Login failed");
      // Reset reCAPTCHA on error
      if (recaptchaRef.current) {
        recaptchaRef.current.reset();
        setRecaptchaToken("");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = "http://localhost:5000/api/auth/google";
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Welcome Back</h2>
        <p style={styles.subtitle}>Sign in to your account</p>
        
        {/* Google Sign-in Button - Primary Option */}
        <button style={styles.googleButton} onClick={handleGoogleLogin}>
          <span style={styles.googleIcon}>G</span>
          Continue with Google
        </button>
        
        {/* Divider */}
        <div style={styles.divider}>
          <span style={styles.dividerText}>or</span>
        </div>
        
        {/* Email/Password Form - Secondary Option */}
        <form onSubmit={handleLogin} style={styles.form}>
          <input
            style={styles.input}
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          
          {/* reCAPTCHA */}
          <div style={styles.recaptchaContainer}>
            <ReCAPTCHA
              ref={recaptchaRef}
              sitekey="6LcD3vMrAAAAAGMHL_sRq-_Dow2tiys9hot9bz6D" // Your actual site key
              onChange={(token) => setRecaptchaToken(token)}
              onExpired={() => setRecaptchaToken("")}
              onError={() => setRecaptchaToken("")}
            />
          </div>
          
          <button style={styles.button} type="submit" disabled={loading || !recaptchaToken}>
            {loading ? 'Signing in...' : 'Sign in with Email'}
          </button>
        </form>

        {/* Forgot Password Link */}
        <div style={styles.forgotPassword}>
          <button
            style={styles.forgotPasswordButton}
            onClick={() => navigate("/forgot-password")}
          >
            Forgot Password?
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
  googleButton: {
    width: "100%",
    padding: "12px 16px",
    background: "#fff",
    color: "#333",
    border: "2px solid #e1e5e9",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "500",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    transition: "all 0.3s ease",
    marginBottom: "1.5rem",
  },
  googleIcon: {
    width: "20px",
    height: "20px",
    background: "linear-gradient(45deg, #4285f4, #34a853, #fbbc05, #ea4335)",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    fontSize: "12px",
    fontWeight: "bold",
  },
  divider: {
    position: "relative",
    margin: "1.5rem 0",
    textAlign: "center",
  },
  dividerText: {
    background: "#fff",
    padding: "0 1rem",
    color: "#999",
    fontSize: "14px",
  },
  recaptchaContainer: {
    display: "flex",
    justifyContent: "center",
    margin: "1rem 0",
  },
  message: {
    marginTop: "1rem",
    padding: "10px",
    borderRadius: "5px",
    fontSize: "14px",
    backgroundColor: "#f8d7da",
    color: "#721c24",
    border: "1px solid #f5c6cb",
  },
  forgotPassword: {
    marginTop: "1rem",
    textAlign: "center",
  },
  forgotPasswordButton: {
    background: "none",
    border: "none",
    color: "#007bff",
    cursor: "pointer",
    fontSize: "14px",
    textDecoration: "underline",
    transition: "color 0.3s ease",
  },
};

export default LoginPage;
