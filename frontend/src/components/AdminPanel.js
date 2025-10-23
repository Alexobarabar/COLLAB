import React, { useState, useEffect } from 'react';
import axios from 'axios';

const AdminPanel = () => {
  const [instructors, setInstructors] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('instructors');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newInstructor, setNewInstructor] = useState({
    name: '',
    email: '',
    department: '',
    courses: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [instructorsRes, evaluationsRes] = await Promise.all([
        axios.get('http://localhost:5000/api/instructors'),
        axios.get('http://localhost:5000/api/evaluations')
      ]);
      
      setInstructors(instructorsRes.data.instructors);
      setEvaluations(evaluationsRes.data.evaluations);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddInstructor = async (e) => {
    e.preventDefault();
    try {
      const instructorData = {
        ...newInstructor,
        courses: newInstructor.courses.split(',').map(course => course.trim()).filter(course => course)
      };

      await axios.post('http://localhost:5000/api/instructors', instructorData);
      setNewInstructor({ name: '', email: '', department: '', courses: '' });
      setShowAddForm(false);
      fetchData();
    } catch (error) {
      console.error('Error adding instructor:', error);
    }
  };

  const handleDeleteInstructor = async (id) => {
    if (window.confirm('Are you sure you want to delete this instructor?')) {
      try {
        await axios.delete(`http://localhost:5000/api/instructors/${id}`);
        fetchData();
      } catch (error) {
        console.error('Error deleting instructor:', error);
      }
    }
  };

  const renderInstructors = () => (
    <div style={styles.tabContent}>
      <div style={styles.header}>
        <h3>Manage Instructors</h3>
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

      <div style={styles.instructorsList}>
        {instructors.map(instructor => (
          <div key={instructor._id} style={styles.instructorCard}>
            <div style={styles.instructorInfo}>
              <h4>{instructor.name}</h4>
              <p><strong>Email:</strong> {instructor.email}</p>
              <p><strong>Department:</strong> {instructor.department}</p>
              {instructor.courses.length > 0 && (
                <p><strong>Courses:</strong> {instructor.courses.join(', ')}</p>
              )}
            </div>
            <div style={styles.instructorActions}>
              <button
                style={styles.deleteButton}
                onClick={() => handleDeleteInstructor(instructor._id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderEvaluations = () => (
    <div style={styles.tabContent}>
      <h3>All Evaluations</h3>
      <div style={styles.evaluationsList}>
        {evaluations.map(evaluation => (
          <div key={evaluation._id} style={styles.evaluationCard}>
            <div style={styles.evaluationHeader}>
              <h4>{evaluation.instructorId?.name}</h4>
              <span style={styles.course}>{evaluation.course}</span>
            </div>
            <div style={styles.evaluationDetails}>
              <p><strong>Student:</strong> {evaluation.studentId?.email}</p>
              <p><strong>Semester:</strong> {evaluation.semester}</p>
              <p><strong>Overall Rating:</strong> {evaluation.ratings.overallRating}/5</p>
              <p><strong>Submitted:</strong> {new Date(evaluation.submittedAt).toLocaleDateString()}</p>
            </div>
            {evaluation.feedback.strengths && (
              <div style={styles.feedback}>
                <p><strong>Strengths:</strong> {evaluation.feedback.strengths}</p>
                {evaluation.feedback.areasForImprovement && (
                  <p><strong>Areas for Improvement:</strong> {evaluation.feedback.areasForImprovement}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1>Admin Panel</h1>
        <p>IT Instructor Evaluation System</p>
      </div>

      <div style={styles.tabs}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'instructors' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('instructors')}
        >
          Manage Instructors
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'evaluations' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('evaluations')}
        >
          View Evaluations
        </button>
      </div>

      <div style={styles.content}>
        {activeTab === 'instructors' && renderInstructors()}
        {activeTab === 'evaluations' && renderEvaluations()}
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
    background: 'linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)',
    color: 'white',
    padding: '40px 20px',
    textAlign: 'center',
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
    color: '#e74c3c',
    borderBottomColor: '#e74c3c',
    background: '#fdf2f2',
  },
  content: {
    padding: '20px',
  },
  tabContent: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  addButton: {
    padding: '10px 20px',
    background: '#27ae60',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
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
  },
  input: {
    flex: 1,
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '5px',
  },
  submitButton: {
    padding: '10px 20px',
    background: '#3498db',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
  },
  instructorsList: {
    display: 'grid',
    gap: '20px',
  },
  instructorCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  instructorInfo: {
    flex: 1,
  },
  instructorInfo h4: {
    margin: '0 0 10px 0',
    color: '#333',
  },
  instructorInfo p: {
    margin: '5px 0',
    color: '#666',
  },
  instructorActions: {
    display: 'flex',
    gap: '10px',
  },
  deleteButton: {
    padding: '8px 16px',
    background: '#e74c3c',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
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
    background: '#3498db',
    color: 'white',
    padding: '4px 12px',
    borderRadius: '20px',
    fontSize: '14px',
  },
  evaluationDetails: {
    marginBottom: '10px',
  },
  evaluationDetails p: {
    margin: '5px 0',
    color: '#666',
  },
  feedback: {
    marginTop: '10px',
    padding: '10px',
    background: '#f8f9fa',
    borderRadius: '5px',
  },
};

export default AdminPanel;
