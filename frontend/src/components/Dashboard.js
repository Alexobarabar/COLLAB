import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ApiService from '../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const response = await ApiService.getDashboardData();
      setDashboardData(response.data);
    } catch (error) {
      setError('Failed to load dashboard data');
      console.error('Dashboard error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="loading">Loading dashboard...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-container">
        <div className="error">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>BukSU College of Technology IT Evaluation System</h1>
        <div className="user-info">
          <span>Welcome, {user?.email}</span>
          <button onClick={logout} className="logout-button">
            Logout
          </button>
        </div>
      </header>

      <div className="dashboard-content">
        <div className="metrics-grid">
          <div className="metric-card">
            <h3>Total Surveys</h3>
            <div className="metric-value">{dashboardData?.totalSurveys || 0}</div>
            <p>Number of surveys created</p>
          </div>
          <div className="metric-card">
            <h3>Total Instructors</h3>
            <div className="metric-value">{dashboardData?.totalInstructors || 0}</div>
            <p>Active instructors</p>
          </div>
          <div className="metric-card">
            <h3>Total Responses</h3>
            <div className="metric-value">{dashboardData?.totalResponses || 0}</div>
            <p>All collected responses</p>
          </div>
        </div>

        <div className="dashboard-grid">
          <div className="chart-section">
            <h3>Instructor Ratings Overview</h3>
            <div className="ratings-chart">
              {dashboardData?.instructors?.map((instructor, index) => (
                <div key={index} className="rating-bar">
                  <span className="instructor-name">{instructor.name}</span>
                  <div className="bar-container">
                    <div 
                      className="rating-bar-fill" 
                      style={{ width: `${(instructor.rating / 5) * 100}%` }}
                    ></div>
                    <span className="rating-value">{instructor.rating}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="recent-surveys">
            <h3>Recently Submitted Surveys</h3>
            <div className="surveys-list">
              {dashboardData?.recentSurveys?.map((survey) => (
                <div key={survey.id} className="survey-item">
                  <div className="survey-info">
                    <h4>{survey.title}</h4>
                    <p>Submitted: {survey.submittedAt}</p>
                  </div>
                  <div className="survey-stats">
                    <span className="response-count">{survey.responses} responses</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;