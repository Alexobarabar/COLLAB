import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

const RoleSelection = ({ onRoleSelect }) => {
  const [selectedRole, setSelectedRole] = useState("");
  const navigate = useNavigate();

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    onRoleSelect(role);
    navigate("/login");
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Welcome to College of Technologies - IT Instructor Evaluation and Feedback</h1>
        <p style={styles.subtitle}>Please select your role to continue</p>

        <div style={styles.roleContainer}>
          <div
            style={{
              ...styles.roleCard,
              ...(selectedRole === "dean" ? styles.selectedRole : {}),
            }}
            onClick={() => handleRoleSelect("dean")}
          >
            <div style={styles.roleIcon}>🎓</div>
            <h3 style={styles.roleTitle}>Dean</h3>
            <p style={styles.roleDescription}>
              Oversee instructor evaluations and manage system analytics
            </p>
          </div>

          <div
            style={{
              ...styles.roleCard,
              ...(selectedRole === "instructor" ? styles.selectedRole : {}),
            }}
            onClick={() => handleRoleSelect("instructor")}
          >
            <div style={styles.roleIcon}>👨‍💼</div>
            <h3 style={styles.roleTitle}>Instructor</h3>
            <p style={styles.roleDescription}>
              Access your instructor profile and manage your account settings
            </p>
          </div>
        </div>

        <div style={styles.footer}>
          <p style={styles.footerText}>
            Select your role to proceed to the login page
          </p>
        </div>
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
    padding: "20px",
  },
  card: {
    background: "#fff",
    padding: "3rem",
    borderRadius: "20px",
    boxShadow: "0 15px 35px rgba(0,0,0,0.1)",
    width: "100%",
    maxWidth: "800px",
    textAlign: "center",
  },
  title: {
    margin: "0 0 1rem 0",
    color: "#333",
    fontSize: "2.5rem",
    fontWeight: "700",
  },
  subtitle: {
    margin: "0 0 3rem 0",
    color: "#666",
    fontSize: "1.2rem",
    fontWeight: "400",
  },
  roleContainer: {
    display: "flex",
    gap: "2rem",
    justifyContent: "center",
    marginBottom: "2rem",
    flexWrap: "wrap",
  },
  roleCard: {
    background: "#f8f9fa",
    padding: "2rem",
    borderRadius: "15px",
    cursor: "pointer",
    transition: "all 0.3s ease",
    border: "2px solid transparent",
    width: "300px",
    textAlign: "center",
    boxShadow: "0 5px 15px rgba(0,0,0,0.08)",
  },
  selectedRole: {
    borderColor: "#007bff",
    background: "#e3f2fd",
    transform: "translateY(-5px)",
    boxShadow: "0 10px 25px rgba(0,123,255,0.2)",
  },
  roleIcon: {
    fontSize: "3rem",
    marginBottom: "1rem",
  },
  roleTitle: {
    margin: "0 0 1rem 0",
    color: "#333",
    fontSize: "1.5rem",
    fontWeight: "600",
  },
  roleDescription: {
    margin: "0",
    color: "#666",
    fontSize: "0.95rem",
    lineHeight: "1.5",
  },
  footer: {
    marginTop: "2rem",
    paddingTop: "2rem",
    borderTop: "1px solid #e9ecef",
  },
  footerText: {
    margin: "0",
    color: "#888",
    fontSize: "0.9rem",
  },
};

export default RoleSelection;
