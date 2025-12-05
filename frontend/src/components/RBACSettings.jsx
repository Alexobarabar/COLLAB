import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { clearPermissionsCache } from '../hooks/usePermission';

const RBACSettings = () => {
  const [activeRole, setActiveRole] = useState('dean');
  const [deanPermissions, setDeanPermissions] = useState({});
  const [instructorPermissions, setInstructorPermissions] = useState({});
  const [deanCategories, setDeanCategories] = useState({});
  const [instructorCategories, setInstructorCategories] = useState({});
  const [labels, setLabels] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState(''); // 'success' or 'error'

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    fetchAllPermissions();
  }, []);

  const fetchAllPermissions = async () => {
    try {
      setLoading(true);
      
      const [deanResponse, instructorResponse] = await Promise.all([
        axios.get('http://localhost:5000/api/rbac/permissions/dean'),
        axios.get('http://localhost:5000/api/rbac/permissions/instructor'),
      ]);

      if (deanResponse.data.success) {
        setDeanPermissions(deanResponse.data.permissions);
        setDeanCategories(deanResponse.data.categories);
        setLabels(deanResponse.data.labels);
      }

      if (instructorResponse.data.success) {
        setInstructorPermissions(instructorResponse.data.permissions);
        setInstructorCategories(instructorResponse.data.categories);
      }
    } catch (error) {
      console.error('Error fetching permissions:', error);
      showMessage('Error loading permissions', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (featureName, role) => {
    if (role === 'dean') {
      setDeanPermissions(prev => ({
        ...prev,
        [featureName]: !prev[featureName]
      }));
    } else {
      setInstructorPermissions(prev => ({
        ...prev,
        [featureName]: !prev[featureName]
      }));
    }
  };

  const handleSelectAll = (category, role, value) => {
    const categories = role === 'dean' ? deanCategories : instructorCategories;
    const features = categories[category] || [];
    
    if (role === 'dean') {
      setDeanPermissions(prev => {
        const updated = { ...prev };
        features.forEach(feature => {
          updated[feature] = value;
        });
        return updated;
      });
    } else {
      setInstructorPermissions(prev => {
        const updated = { ...prev };
        features.forEach(feature => {
          updated[feature] = value;
        });
        return updated;
      });
    }
  };

  const handleSaveChanges = async () => {
    try {
      setSaving(true);
      setMessage('');

      const role = activeRole;
      const permissions = role === 'dean' ? deanPermissions : instructorPermissions;

      const response = await axios.patch(
        `http://localhost:5000/api/rbac/permissions/${role}`,
        { permissions },
        { headers: getAuthHeaders() }
      );

      if (response.data.success) {
        // Clear permissions cache to force refetch
        clearPermissionsCache();
        showMessage(`${role.charAt(0).toUpperCase() + role.slice(1)} permissions saved successfully!`, 'success');
        // Refetch to ensure we have the latest data
        await fetchAllPermissions();
      } else {
        showMessage('Failed to save permissions', 'error');
      }
    } catch (error) {
      console.error('Error saving permissions:', error);
      showMessage(error.response?.data?.message || 'Error saving permissions', 'error');
    } finally {
      setSaving(false);
    }
  };

  const showMessage = (text, type) => {
    setMessage(text);
    setMessageType(type);
    setTimeout(() => {
      setMessage('');
      setMessageType('');
    }, 5000);
  };

  const renderPermissionCategory = (categoryName, features, role) => {
    const permissions = role === 'dean' ? deanPermissions : instructorPermissions;
    const allEnabled = features.every(feature => permissions[feature] === true);
    const someEnabled = features.some(feature => permissions[feature] === true);

    return (
      <div key={categoryName} style={styles.category}>
        <div style={styles.categoryHeader}>
          <h3 style={styles.categoryTitle}>{categoryName}</h3>
          <div style={styles.categoryActions}>
            <button
              style={styles.selectButton}
              onClick={() => handleSelectAll(categoryName, role, true)}
              disabled={saving}
            >
              Enable All
            </button>
            <button
              style={styles.selectButton}
              onClick={() => handleSelectAll(categoryName, role, false)}
              disabled={saving}
            >
              Disable All
            </button>
          </div>
        </div>
        <div style={styles.permissionsList}>
          {features.map(feature => (
            <div key={feature} style={styles.permissionItem}>
              <label style={styles.permissionLabel}>
                <input
                  type="checkbox"
                  checked={permissions[feature] === true}
                  onChange={() => handleToggle(feature, role)}
                  disabled={saving}
                  style={styles.checkbox}
                />
                <span style={styles.featureLabel}>
                  {labels[feature] || feature}
                </span>
              </label>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loader}></div>
        <p style={styles.loadingText}>Loading permissions...</p>
      </div>
    );
  }

  const currentCategories = activeRole === 'dean' ? deanCategories : instructorCategories;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Feature Access Control (RBAC)</h1>
      </div>

      {message && (
        <div style={{
          ...styles.message,
          ...(messageType === 'success' ? styles.successMessage : styles.errorMessage)
        }}>
          {message}
        </div>
      )}

      <div style={styles.roleTabs}>
        <button
          style={{
            ...styles.roleTab,
            ...(activeRole === 'dean' ? styles.activeRoleTab : {})
          }}
          onClick={() => setActiveRole('dean')}
        >
          🎓 Dean Permissions
        </button>
        <button
          style={{
            ...styles.roleTab,
            ...(activeRole === 'instructor' ? styles.activeRoleTab : {})
          }}
          onClick={() => setActiveRole('instructor')}
        >
          👨‍🏫 Instructor Permissions
        </button>
      </div>

      <div style={styles.content}>
        <div style={styles.infoBox}>
          <strong>ℹ️ Note:</strong> Disabled features will be hidden from the UI and blocked at the API level.
        </div>

        {Object.entries(currentCategories).map(([categoryName, features]) =>
          renderPermissionCategory(categoryName, features, activeRole)
        )}
      </div>

      <div style={styles.footer}>
        <button
          style={{
            ...styles.saveButton,
            ...(saving ? styles.savingButton : {})
          }}
          onClick={handleSaveChanges}
          disabled={saving}
        >
          {saving ? 'Saving...' : '💾 Save Changes'}
        </button>
      </div>
    </div>
  );
};

const styles = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
    backgroundColor: '#f8f9fa',
    minHeight: '100vh',
  },
  header: {
    marginBottom: '30px',
    padding: '20px',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  title: {
    margin: '0 0 10px 0',
    color: '#233876',
    fontSize: '28px',
    fontWeight: 'bold',
  },
  subtitle: {
    margin: 0,
    color: '#6c757d',
    fontSize: '14px',
  },
  message: {
    padding: '15px 20px',
    borderRadius: '8px',
    marginBottom: '20px',
    fontWeight: '500',
    animation: 'slideDown 0.3s ease',
  },
  successMessage: {
    backgroundColor: '#d4edda',
    color: '#155724',
    border: '1px solid #c3e6cb',
  },
  errorMessage: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    border: '1px solid #f5c6cb',
  },
  roleTabs: {
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
  },
  roleTab: {
    flex: 1,
    padding: '15px 20px',
    fontSize: '16px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: 'white',
    color: '#6c757d',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  activeRoleTab: {
    backgroundColor: '#233876',
    color: 'white',
    transform: 'scale(1.02)',
    boxShadow: '0 4px 8px rgba(35,56,118,0.3)',
  },
  content: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '20px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  infoBox: {
    padding: '15px',
    backgroundColor: '#e7f3ff',
    border: '1px solid #b3d9ff',
    borderRadius: '6px',
    marginBottom: '25px',
    fontSize: '14px',
    color: '#004085',
  },
  category: {
    marginBottom: '30px',
    paddingBottom: '25px',
    borderBottom: '2px solid #e9ecef',
  },
  categoryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
  },
  categoryTitle: {
    margin: 0,
    color: '#233876',
    fontSize: '20px',
    fontWeight: '600',
  },
  categoryActions: {
    display: 'flex',
    gap: '10px',
  },
  selectButton: {
    padding: '8px 16px',
    fontSize: '13px',
    border: '1px solid #dee2e6',
    borderRadius: '5px',
    backgroundColor: 'white',
    color: '#495057',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    fontWeight: '500',
  },
  permissionsList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '12px',
  },
  permissionItem: {
    padding: '12px',
    backgroundColor: '#f8f9fa',
    borderRadius: '6px',
    transition: 'all 0.2s ease',
  },
  permissionLabel: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    userSelect: 'none',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    marginRight: '12px',
    cursor: 'pointer',
    accentColor: '#233876',
  },
  featureLabel: {
    fontSize: '14px',
    color: '#495057',
    flex: 1,
  },
  footer: {
    marginTop: '30px',
    padding: '20px',
    backgroundColor: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    display: 'flex',
    justifyContent: 'flex-end',
  },
  saveButton: {
    padding: '15px 40px',
    fontSize: '16px',
    fontWeight: '600',
    border: 'none',
    borderRadius: '8px',
    backgroundColor: '#233876',
    color: 'white',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  savingButton: {
    backgroundColor: '#6c757d',
    cursor: 'not-allowed',
    opacity: 0.7,
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
  },
  loader: {
    width: '50px',
    height: '50px',
    border: '5px solid #f3f3f3',
    borderTop: '5px solid #233876',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText: {
    marginTop: '20px',
    color: '#6c757d',
    fontSize: '16px',
  },
};

export default RBACSettings;

