import React, { useState, useEffect } from 'react';
import axios from 'axios';

const EvaluationForm = () => {
  const [instructors, setInstructors] = useState([]);
  const [selectedInstructor, setSelectedInstructor] = useState('');
  const [formData, setFormData] = useState({
    course: '',
    semester: '',
    academicYear: '',
    ratings: {
      teachingEffectiveness: 5,
      communicationSkills: 5,
      subjectKnowledge: 5,
      punctuality: 5,
      availability: 5,
      overallRating: 5
    },
    feedback: {
      strengths: '',
      areasForImprovement: '',
      additionalComments: ''
    },
    isAnonymous: false
  });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchInstructors();
  }, []);

  const fetchInstructors = async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/instructors');
      setInstructors(response.data.instructors);
    } catch (error) {
      setMessage('Error fetching instructors');
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name.startsWith('ratings.')) {
      const ratingField = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        ratings: {
          ...prev.ratings,
          [ratingField]: parseInt(value)
        }
      }));
    } else if (name.startsWith('feedback.')) {
      const feedbackField = name.split('.')[1];
      setFormData(prev => ({
        ...prev,
        feedback: {
          ...prev.feedback,
          [feedbackField]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'checkbox' ? checked : value
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      const response = await axios.post('http://localhost:5000/api/evaluations', {
        ...formData,
        instructorId: selectedInstructor,
        studentId: '64a1b2c3d4e5f6789abcdef0' // This should come from auth context
      });

      setMessage('Evaluation submitted successfully!');
      setFormData({
        course: '',
        semester: '',
        academicYear: '',
        ratings: {
          teachingEffectiveness: 5,
          communicationSkills: 5,
          subjectKnowledge: 5,
          punctuality: 5,
          availability: 5,
          overallRating: 5
        },
        feedback: {
          strengths: '',
          areasForImprovement: '',
          additionalComments: ''
        },
        isAnonymous: false
      });
      setSelectedInstructor('');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Error submitting evaluation');
    } finally {
      setLoading(false);
    }
  };

  const ratingFields = [
    { key: 'teachingEffectiveness', label: 'Teaching Effectiveness' },
    { key: 'communicationSkills', label: 'Communication Skills' },
    { key: 'subjectKnowledge', label: 'Subject Knowledge' },
    { key: 'punctuality', label: 'Punctuality' },
    { key: 'availability', label: 'Availability' },
    { key: 'overallRating', label: 'Overall Rating' }
  ];

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>Instructor Evaluation Form</h2>
        
        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Instructor Selection */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Select Instructor *</label>
            <select
              name="instructor"
              value={selectedInstructor}
              onChange={(e) => setSelectedInstructor(e.target.value)}
              style={styles.select}
              required
            >
              <option value="">Choose an instructor...</option>
              {instructors.map(instructor => (
                <option key={instructor._id} value={instructor._id}>
                  {instructor.name} - {instructor.department}
                </option>
              ))}
            </select>
          </div>

          {/* Course Information */}
          <div style={styles.fieldGroup}>
            <label style={styles.label}>Course *</label>
            <input
              type="text"
              name="course"
              value={formData.course}
              onChange={handleInputChange}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.row}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Semester *</label>
              <input
                type="text"
                name="semester"
                value={formData.semester}
                onChange={handleInputChange}
                style={styles.input}
                required
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Academic Year *</label>
              <input
                type="text"
                name="academicYear"
                value={formData.academicYear}
                onChange={handleInputChange}
                style={styles.input}
                required
              />
            </div>
          </div>

          {/* Ratings */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Rate the following aspects (1-5 scale)</h3>
            {ratingFields.map(field => (
              <div key={field.key} style={styles.ratingField}>
                <label style={styles.ratingLabel}>{field.label}</label>
                <div style={styles.ratingContainer}>
                  {[1, 2, 3, 4, 5].map(rating => (
                    <label key={rating} style={styles.radioLabel}>
                      <input
                        type="radio"
                        name={`ratings.${field.key}`}
                        value={rating}
                        checked={formData.ratings[field.key] === rating}
                        onChange={handleInputChange}
                        style={styles.radio}
                      />
                      {rating}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Feedback */}
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Feedback</h3>
            
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Strengths</label>
              <textarea
                name="feedback.strengths"
                value={formData.feedback.strengths}
                onChange={handleInputChange}
                style={styles.textarea}
                rows="3"
                placeholder="What did the instructor do well?"
              />
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Areas for Improvement</label>
              <textarea
                name="feedback.areasForImprovement"
                value={formData.feedback.areasForImprovement}
                onChange={handleInputChange}
                style={styles.textarea}
                rows="3"
                placeholder="What could the instructor improve?"
              />
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>Additional Comments</label>
              <textarea
                name="feedback.additionalComments"
                value={formData.feedback.additionalComments}
                onChange={handleInputChange}
                style={styles.textarea}
                rows="4"
                placeholder="Any other comments or suggestions?"
              />
            </div>
          </div>

          {/* Anonymous Option */}
          <div style={styles.checkboxGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                name="isAnonymous"
                checked={formData.isAnonymous}
                onChange={handleInputChange}
                style={styles.checkbox}
              />
              Submit anonymously
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !selectedInstructor}
            style={styles.submitButton}
          >
            {loading ? 'Submitting...' : 'Submit Evaluation'}
          </button>

          {message && (
            <div style={styles.message}>
              {message}
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    padding: '20px',
    background: '#f5f5f5',
  },
  card: {
    maxWidth: '800px',
    margin: '0 auto',
    background: 'white',
    borderRadius: '10px',
    padding: '30px',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  title: {
    textAlign: 'center',
    marginBottom: '30px',
    color: '#333',
    fontSize: '28px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  row: {
    display: 'flex',
    gap: '20px',
  },
  label: {
    fontWeight: 'bold',
    color: '#555',
    fontSize: '14px',
  },
  input: {
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    fontSize: '16px',
  },
  select: {
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    fontSize: '16px',
    background: 'white',
  },
  section: {
    marginTop: '20px',
    padding: '20px',
    background: '#f9f9f9',
    borderRadius: '8px',
  },
  sectionTitle: {
    marginBottom: '20px',
    color: '#333',
    fontSize: '18px',
  },
  ratingField: {
    marginBottom: '15px',
  },
  ratingLabel: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: 'bold',
    color: '#555',
  },
  ratingContainer: {
    display: 'flex',
    gap: '15px',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    cursor: 'pointer',
  },
  radio: {
    margin: 0,
  },
  textarea: {
    padding: '10px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    fontSize: '16px',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  checkboxGroup: {
    marginTop: '20px',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
  },
  checkbox: {
    margin: 0,
  },
  submitButton: {
    padding: '15px 30px',
    background: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    fontSize: '16px',
    cursor: 'pointer',
    marginTop: '20px',
  },
  message: {
    padding: '10px',
    borderRadius: '5px',
    textAlign: 'center',
    marginTop: '10px',
  },
};

export default EvaluationForm;
