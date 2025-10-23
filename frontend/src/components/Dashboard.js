import React, { useState, useEffect } from 'react';
import axios from 'axios';
import EvaluationForm from './EvaluationForm';

const Dashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('evaluate');
  const [evaluations, setEvaluations] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [instructorsRes, evaluationsRes] = await Promise.all([
        axios.get('http://localhost:5000/api/instructors'),
        axios.get('http://localhost:5000/api/evaluations/student/64a1b2c3d4e5f6789abcdef0') // Replace with actual student ID
      ]);
      
      setInstructors(instructorsRes.data.instructors);
      setEvaluations(evaluationsRes.data.evaluations);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderEvaluations = () => (
    <div style={styles.tabContent}>
      <h3>My Evaluations</h3>
      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : evaluations.length === 0 ? (
        <div style={styles.empty}>No evaluations submitted yet.</div>
      ) : (
        <div style={styles.evaluationsList}>
          {evaluations.map(evaluation => (
            <div key={evaluation._id} style={styles.evaluationCard}>
              <div style={styles.evaluationHeader}>
                <h4>{evaluation.instructorId?.name}</h4>
                <span style={styles.course}>{evaluation.course}</span>
              </div>
              <div style={styles.evaluationDetails}>
                <p><strong>Semester:</strong> {evaluation.semester}</p>
                <p><strong>Academic Year:</strong> {evaluation.academicYear}</p>
                <p><strong>Overall Rating:</strong> {evaluation.ratings.overallRating}/5</p>
                <p><strong>Submitted:</strong> {new Date(evaluation.submittedAt).toLocaleDateString()}</p>
              </div>
              {evaluation.feedback.strengths && (
                <div style={styles.feedback}>
                  <p><strong>Strengths:</strong> {evaluation.feedback.strengths}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderInstructors = () => (
    <div style={styles.tabContent}>
      <h3>Available Instructors</h3>
      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : (
        <div style={styles.instructorsList}>
          {instructors.map(instructor => (
            <div key={instructor._id} style={styles.instructorCard}>
              <h4>{instructor.name}</h4>
              <p><strong>Department:</strong> {instructor.department}</p>
              <p><strong>Email:</strong> {instructor.email}</p>
              {instructor.courses.length > 0 && (
                <p><strong>Courses:</strong> {instructor.courses.join(', ')}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <div>
            <h1>IT Instructor Evaluation System</h1>
            <p>College of Technology</p>
          </div>
          <button style={styles.logoutButton} onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <div style={styles.tabs}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'evaluate' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('evaluate')}
        >
          Submit Evaluation
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'myEvaluations' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('myEvaluations')}
        >
          My Evaluations
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'instructors' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('instructors')}
        >
          Instructors
        </button>
      </div>

      <div style={styles.content}>
        {activeTab === 'evaluate' && <EvaluationForm />}
        {activeTab === 'myEvaluations' && renderEvaluations()}
        {activeTab === 'instructors' && renderInstructors()}
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    background: '#f5f5f5',
  },
  header: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '40px 20px',
  },
  headerContent: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    maxWidth: '1200px',
    margin: '0 auto',
  },
  logoutButton: {
    padding: '10px 20px',
    background: 'rgba(255, 255, 255, 0.2)',
    color: 'white',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  tabs: {
    display: 'flex',
    background: 'white',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  tab: {
    flex: 1,
    padding: '15px 20px',
    border: 'none',
    background: 'white',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '500',
    color: '#666',
    borderBottom: '3px solid transparent',
  },
  activeTab: {
    color: '#667eea',
    borderBottomColor: '#667eea',
    background: '#f8f9ff',
  },
  content: {
    padding: '20px',
  },
  tabContent: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
  },
  empty: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  evaluationsList: {
    display: 'grid',
    gap: '20px',
  },
  evaluationCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  evaluationHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  course: {
    background: '#667eea',
    color: 'white',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '14px',
  },
  evaluationDetails: {
    marginBottom: '10px',
  },
  evaluationDetailsP: {
    margin: '5px 0',
    color: '#666',
  },
  feedback: {
    marginTop: '10px',
    padding: '10px',
    background: '#f8f9ff',
    borderRadius: '5px',
  },
  instructorsList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '20px',
  },
  instructorCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  instructorCardH4: {
    margin: '0 0 10px 0',
    color: '#333',
  },
  instructorCardP: {
    margin: '5px 0',
    color: '#666',
  },
};

export default Dashboard;
