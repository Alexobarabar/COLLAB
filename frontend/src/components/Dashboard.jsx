import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import EvaluationForm from './EvaluationForm.jsx';

const Dashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('evaluate');
  const [evaluations, setEvaluations] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newInstructor, setNewInstructor] = useState({
    name: '',
    email: '',
    department: '',
    courses: ''
  });
  const [message, setMessage] = useState('');
  const [studentId, setStudentId] = useState('');
  const location = useLocation();

  useEffect(() => {
    // Check for token from Google OAuth callback
    const urlParams = new URLSearchParams(location.search);
    const token = urlParams.get('token');
    
    if (token) {
      // Store the token from Google OAuth
      localStorage.setItem('token', token);
      localStorage.setItem('tokenExpiry', (new Date().getTime() + (24 * 60 * 60 * 1000)).toString());
      
      // Extract user ID from token (format: user_${userId}_${timestamp})
      const userId = token.split('_')[1];
      setStudentId(userId);
      
      // Clear the token from URL
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      // Get student ID from localStorage (for regular login)
      const storedToken = localStorage.getItem('token');
      if (storedToken) {
        // Extract student ID from token or use a default for now
        // In a real app, you'd decode the JWT to get the user ID
        const userId = storedToken.split('_')[1] || '64a1b2c3d4e5f6789abcdef0';
        setStudentId(userId);
      }
    }
    
    fetchData();
  }, [location.search]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [instructorsRes, evaluationsRes, statsRes] = await Promise.all([
        axios.get('http://localhost:5000/api/instructors'),
        axios.get(`http://localhost:5000/api/evaluations/student/${studentId || '64a1b2c3d4e5f6789abcdef0'}`),
        axios.get('http://localhost:5000/api/stats')
      ]);

      setInstructors(instructorsRes.data.instructors);
      setEvaluations(evaluationsRes.data.evaluations);
      setStats(statsRes.data.stats);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddInstructor = async (e) => {
    e.preventDefault();
    setMessage('');

    try {
      const instructorData = {
        ...newInstructor,
        courses: newInstructor.courses.split(',').map(course => course.trim()).filter(course => course)
      };

      await axios.post('http://localhost:5000/api/instructors', instructorData);
      setNewInstructor({ name: '', email: '', department: '', courses: '' });
      setShowAddForm(false);
      setMessage('Instructor added successfully!');
      fetchData(); // Refresh the list
    } catch (error) {
      setMessage(error.response?.data?.message || 'Error adding instructor');
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

  const renderStats = () => (
    <div style={styles.tabContent}>
      <h3>Evaluation Statistics</h3>
      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : (
        <div style={styles.statsContainer}>
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <h4>Total Evaluations</h4>
              <p style={styles.statNumber}>{stats.totalEvaluations || 0}</p>
            </div>
            <div style={styles.statCard}>
              <h4>Total Instructors</h4>
              <p style={styles.statNumber}>{stats.totalInstructors || 0}</p>
            </div>
            <div style={styles.statCard}>
              <h4>Average Overall Rating</h4>
              <p style={styles.statNumber}>{stats.averageRatings?.avgOverallRating?.toFixed(1) || '0.0'}/5</p>
            </div>
            <div style={styles.statCard}>
              <h4>Average Teaching Effectiveness</h4>
              <p style={styles.statNumber}>{stats.averageRatings?.avgTeachingEffectiveness?.toFixed(1) || '0.0'}/5</p>
            </div>
          </div>

          {stats.topInstructors && stats.topInstructors.length > 0 && (
            <div style={styles.topInstructors}>
              <h4>Top Rated Instructors</h4>
              <div style={styles.instructorsList}>
                {stats.topInstructors.map((instructor, index) => (
                  <div key={index} style={styles.instructorCard}>
                    <h5>{instructor.name}</h5>
                    <p><strong>Department:</strong> {instructor.department}</p>
                    <p><strong>Average Rating:</strong> {instructor.avgRating?.toFixed(1)}/5</p>
                    <p><strong>Evaluations:</strong> {instructor.evaluationCount}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats.evaluationsBySemester && stats.evaluationsBySemester.length > 0 && (
            <div style={styles.semesterStats}>
              <h4>Evaluations by Semester</h4>
              <div style={styles.semesterList}>
                {stats.evaluationsBySemester.map((semester, index) => (
                  <div key={index} style={styles.semesterItem}>
                    <span>{semester._id}</span>
                    <span>{semester.count} evaluations</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderInstructors = () => (
    <div style={styles.tabContent}>
      <div style={styles.header}>
        <h3>Available Instructors</h3>
        <button
          style={styles.addButton}
          onClick={() => setShowAddForm(!showAddForm)}
        >
          {showAddForm ? 'Cancel' : 'Add Instructor'}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddInstructor} style={styles.form}>
          <div style={styles.formRow}>
            <input
              type="text"
              placeholder="Name"
              value={newInstructor.name}
              onChange={(e) => setNewInstructor({...newInstructor, name: e.target.value})}
              style={styles.input}
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={newInstructor.email}
              onChange={(e) => setNewInstructor({...newInstructor, email: e.target.value})}
              style={styles.input}
              required
            />
          </div>
          <div style={styles.formRow}>
            <input
              type="text"
              placeholder="Department"
              value={newInstructor.department}
              onChange={(e) => setNewInstructor({...newInstructor, department: e.target.value})}
              style={styles.input}
              required
            />
            <input
              type="text"
              placeholder="Courses (comma separated)"
              value={newInstructor.courses}
              onChange={(e) => setNewInstructor({...newInstructor, courses: e.target.value})}
              style={styles.input}
            />
          </div>
          <button type="submit" style={styles.submitButton}>
            Add Instructor
          </button>
        </form>
      )}

      {message && (
        <div style={styles.message}>
          {message}
        </div>
      )}

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
            ...(activeTab === 'stats' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('stats')}
        >
          Statistics
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
        {activeTab === 'stats' && renderStats()}
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
    overflowX: 'auto',
  },
  tab: {
    flex: 1,
    minWidth: '120px',
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
  addButton: {
    padding: '10px 20px',
    background: '#27ae60',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  form: {
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    marginBottom: '20px',
  },
  formRow: {
    display: 'flex',
    gap: '10px',
    marginBottom: '10px',
    flexWrap: 'wrap',
  },
  input: {
    flex: 1,
    minWidth: '200px',
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    fontSize: '16px',
  },
  submitButton: {
    padding: '10px 20px',
    background: '#3498db',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '500',
  },
  message: {
    padding: '10px',
    borderRadius: '5px',
    textAlign: 'center',
    marginBottom: '20px',
    fontSize: '16px',
  },
  statsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '30px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '20px',
  },
  statCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    textAlign: 'center',
  },
  statNumber: {
    fontSize: '32px',
    fontWeight: 'bold',
    color: '#667eea',
    margin: '10px 0',
  },
  topInstructors: {
    marginTop: '20px',
  },
  semesterStats: {
    marginTop: '20px',
  },
  semesterList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '10px',
  },
  semesterItem: {
    display: 'flex',
    justifyContent: 'space-between',
    background: 'white',
    padding: '15px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
};

export default Dashboard;
