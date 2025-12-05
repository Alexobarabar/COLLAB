import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import generateInstructorReportPdf from '../utils/generateInstructorReportPdf';
import buildInstructorPrintPayload from '../utils/buildInstructorPrintPayload';

const ALL_SECTIONS_OPTION = 'ALL_SECTIONS';

const InstructorDashboard = ({ onLogout, userEmail }) => {
  const [activeTab, setActiveTab] = useState('profile');
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [mvccMeta, setMvccMeta] = useState({ user: null, instructor: null });
  const formatDateTime = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  };
  const [conflictDetails, setConflictDetails] = useState(null);
  const [currentEmail, setCurrentEmail] = useState(userEmail || localStorage.getItem('userEmail') || '');
  
  // Profile update form state
  const [updateForm, setUpdateForm] = useState({
    newEmail: '',
    newPassword: '',
    currentPassword: ''
  });
  const [updateMode, setUpdateMode] = useState(''); // 'email' | 'password'
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updateErrors, setUpdateErrors] = useState({});

  // Student management state
  const [students, setStudents] = useState([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [sections, setSections] = useState([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const initialStudentForm = {
    studentId: '',
    sectionId: '',
    email: '',
    subjectCode: '',
  };
  const [studentForm, setStudentForm] = useState(initialStudentForm);
  const [studentFormErrors, setStudentFormErrors] = useState({});
  const [studentAlert, setStudentAlert] = useState(null);
  const [showAddStudentForm, setShowAddStudentForm] = useState(false);
  
  // Section creation state
  const [showCreateSectionModal, setShowCreateSectionModal] = useState(false);
  const [sectionForm, setSectionForm] = useState({
    sectionCode: '',
    course: '',
    yearLevel: '',
  });
  const [sectionFormErrors, setSectionFormErrors] = useState({});
  const [sectionAlert, setSectionAlert] = useState(null);
  const [sectionBanner, setSectionBanner] = useState(null);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [evaluationForms, setEvaluationForms] = useState([]);
  const [loadingEvaluationForms, setLoadingEvaluationForms] = useState(false);
  const [selectedEvaluationFormId, setSelectedEvaluationFormId] = useState('');
  const [printingEvaluationReport, setPrintingEvaluationReport] = useState(false);
  const [evaluationNotice, setEvaluationNotice] = useState('');
  const [showSectionActionMenu, setShowSectionActionMenu] = useState(false);
  const [showEditSectionModal, setShowEditSectionModal] = useState(false);
  const [sectionEditValue, setSectionEditValue] = useState('');
  const [sectionEditVersion, setSectionEditVersion] = useState(null);
  const [sectionEditError, setSectionEditError] = useState('');
  const [updatingSection, setUpdatingSection] = useState(false);
  const sectionActionRef = useRef(null);
  const selectedSection = sections.find((section) => section._id === selectedSectionId);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  useEffect(() => {
    if (userEmail && userEmail !== currentEmail) {
      setCurrentEmail(userEmail);
    }
  }, [userEmail]); // keep local email in sync with prop

  useEffect(() => {
    if (currentEmail) {
      fetchProfile(currentEmail);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentEmail]);

  // Subject codes are now entered manually

  useEffect(() => {
    if (!studentAlert) return;
    const timeoutId = setTimeout(() => setStudentAlert(null), 4000);
    return () => clearTimeout(timeoutId);
  }, [studentAlert]);

  useEffect(() => {
    if (activeTab === 'students') {
      fetchSections();
    }
  }, [activeTab]);

  useEffect(() => {
    if (!sectionAlert) return;
    const timeoutId = setTimeout(() => setSectionAlert(null), 4000);
    return () => clearTimeout(timeoutId);
  }, [sectionAlert]);

  useEffect(() => {
    if (!sectionBanner) return;
    const timeoutId = setTimeout(() => setSectionBanner(null), 4000);
    return () => clearTimeout(timeoutId);
  }, [sectionBanner]);

useEffect(() => {
  if (activeTab === 'evaluation') {
    setEvaluationNotice('');
    fetchEvaluationForms();
  }
}, [activeTab]);

  useEffect(() => {
    setShowSectionActionMenu(false);
  }, [selectedSectionId]);

  useEffect(() => {
    if (!showSectionActionMenu) return undefined;
    const handleClickOutside = (event) => {
      if (sectionActionRef.current && !sectionActionRef.current.contains(event.target)) {
        setShowSectionActionMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSectionActionMenu]);

  const fetchProfile = async (emailOverride) => {
    try {
      setLoading(true);
      const targetEmail = emailOverride || currentEmail || userEmail;
      if (!targetEmail) {
        setMessage('Unable to determine instructor email for profile lookup.');
        setLoading(false);
        return;
      }
      const response = await axios.get(`http://localhost:5000/api/instructor-profile/profile?email=${targetEmail}`, {
        headers: getAuthHeaders(),
      });
      setProfile(response.data.profile);
      setMvccMeta(response.data.mvcc || { user: null, instructor: null });
      setConflictDetails(null);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Error fetching profile');
    } finally {
      setLoading(false);
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setMessage('');
    setUpdateErrors({});
    setConflictDetails(null);

    // Validate based on selected mode
    if (!updateMode) {
      setMessage('Please choose whether to update Email or Password.');
      return;
    }

    if (updateMode === 'email') {
      if (!updateForm.newEmail) {
        setUpdateErrors(prev => ({ ...prev, newEmail: 'New email is required' }));
        setMessage('Please provide a valid email.');
        return;
      }
      const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updateForm.newEmail);
      if (!emailValid) {
        setUpdateErrors(prev => ({ ...prev, newEmail: 'Enter a valid email address' }));
        setMessage('Please provide a valid email.');
        return;
      }
    }

    if (updateMode === 'password') {
      if (!updateForm.currentPassword) {
        setUpdateErrors(prev => ({ ...prev, currentPassword: 'Current password is required' }));
        setMessage('Please fill in all password fields.');
        return;
      }
      if (!updateForm.newPassword) {
        setUpdateErrors(prev => ({ ...prev, newPassword: 'New password is required' }));
        setMessage('Please fill in all password fields.');
        return;
      }
      if (!confirmPassword) {
        setUpdateErrors(prev => ({ ...prev, confirmPassword: 'Please confirm the new password' }));
        setMessage('Please fill in all password fields.');
        return;
      }
      if (updateForm.newPassword !== confirmPassword) {
        setUpdateErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match' }));
        setMessage('New passwords do not match.');
        return;
      }
    }

    if (!mvccMeta.user?.version && mvccMeta.user?.version !== 0) {
      setMessage('Unable to determine current profile version. Please refresh the page and try again.');
      return;
    }

    const updateData = {
      email: currentEmail || userEmail,
      userVersion: mvccMeta.user?.version,
    };

    if (mvccMeta.instructor && mvccMeta.instructor.version !== undefined) {
      updateData.instructorVersion = mvccMeta.instructor.version;
    }

    if (updateMode === 'email') {
      updateData.newEmail = updateForm.newEmail;
      updateData.newPassword = '';
      updateData.currentPassword = '';
    } else if (updateMode === 'password') {
      updateData.newPassword = updateForm.newPassword;
      updateData.currentPassword = updateForm.currentPassword;
      updateData.newEmail = '';
    }

    try {
      const response = await axios.put('http://localhost:5000/api/instructor-profile/profile', updateData, {
        headers: getAuthHeaders(),
      });
      
      // Success feedback
      if (updateMode === 'email' && updateForm.newEmail && updateForm.newEmail !== (currentEmail || userEmail)) {
        setMessage('Email updated successfully!');
        // Store the new email for future reference
        localStorage.setItem('userEmail', updateForm.newEmail);
        setCurrentEmail(updateForm.newEmail);
      } else if (updateMode === 'password') {
        setMessage(response.data.message || 'Password updated successfully!');
      } else {
        setMessage(response.data.message || 'Profile updated successfully!');
      }
      setMvccMeta(response.data.mvcc || mvccMeta);
      setConflictDetails(null);
      
      setUpdateForm({ newEmail: '', newPassword: '', currentPassword: '' });
      setConfirmPassword('');
      setUpdateMode('');
      setUpdateErrors({});
      
      if (!(updateMode === 'email' && updateForm.newEmail && updateForm.newEmail !== (currentEmail || userEmail))) {
        fetchProfile();
      }
    } catch (error) {
      if (error.response?.status === 409) {
        setConflictDetails(error.response?.data?.conflict || null);
        setMessage(error.response?.data?.message || 'Your profile was updated elsewhere. Please refresh and try again.');
        fetchProfile();
      } else {
        setMessage(error.response?.data?.message || 'Error updating profile');
      }
    }
  };

  // Fetch students

  const fetchSections = async () => {
    try {
      setSectionsLoading(true);
      const response = await axios.get('http://localhost:5000/api/instructor/sections', {
        headers: getAuthHeaders(),
      });
      setSections(response.data.sections || []);
    } catch (error) {
      console.error('Error fetching sections:', error);
      setMessage(error.response?.data?.message || 'Error fetching sections');
    } finally {
      setSectionsLoading(false);
    }
  };

  const fetchEvaluationForms = async () => {
    try {
      setLoadingEvaluationForms(true);
      const response = await axios.get('http://localhost:5000/api/evaluation-forms');
      const forms = response.data.evaluationForms || [];
      const googleForms = forms.filter((form) => form.googleFormId);
      setEvaluationForms(googleForms);
      if (!googleForms.length) {
        setEvaluationNotice('No Google evaluation forms are available. Please contact the Dean.');
      }
    } catch (error) {
      setEvaluationNotice(error.response?.data?.message || 'Error loading evaluation forms.');
    } finally {
      setLoadingEvaluationForms(false);
    }
  };

  const fetchStudents = async (sectionId = selectedSectionId) => {
    try {
      setStudentsLoading(true);
      const params = {};
      const effectiveSectionId = sectionId === ALL_SECTIONS_OPTION ? '' : sectionId;

      if (effectiveSectionId) {
        params.sectionId = effectiveSectionId;
      }

      const response = await axios.get('http://localhost:5000/api/instructor/students', {
        headers: getAuthHeaders(),
        params,
      });
      setStudents(response.data.students);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Error fetching students');
    } finally {
      setStudentsLoading(false);
    }
  };

  const handleOpenEditSectionModal = () => {
    if (!selectedSectionId || selectedSectionId === ALL_SECTIONS_OPTION || !selectedSection) {
      return;
    }
    setSectionEditValue(selectedSection.sectionCode || '');
    setSectionEditVersion(
      typeof selectedSection.version === 'number' ? selectedSection.version : null
    );
    setSectionEditError('');
    setShowEditSectionModal(true);
    setShowSectionActionMenu(false);
  };

  const closeEditSectionModal = () => {
    setShowEditSectionModal(false);
    setSectionEditValue('');
    setSectionEditVersion(null);
    setSectionEditError('');
  };

  const handleUpdateSectionCode = async (event) => {
    event.preventDefault();
    if (!selectedSectionId || selectedSectionId === ALL_SECTIONS_OPTION) {
      setSectionEditError('Please select a section first.');
      return;
    }
    const trimmedCode = (sectionEditValue || '').trim();
    if (!trimmedCode) {
      setSectionEditError('Section code is required.');
      return;
    }
    if (sectionEditVersion === null || sectionEditVersion === undefined) {
      setSectionEditError('Unable to determine section version. Please refresh and try again.');
      return;
    }
    setUpdatingSection(true);
    try {
      const response = await axios.put(
        `http://localhost:5000/api/instructor/sections/${selectedSectionId}`,
        { newSectionCode: trimmedCode, sectionVersion: sectionEditVersion },
        { headers: getAuthHeaders() }
      );
      setSectionBanner({ type: 'success', text: response.data.message || 'Section updated successfully!' });
      setSectionEditVersion(response.data?.mvcc?.version ?? response.data?.section?.version ?? null);
      setShowEditSectionModal(false);
      setSectionEditValue('');
      setSectionEditError('');
      await fetchSections();
      await fetchStudents(selectedSectionId);
    } catch (error) {
      if (error.response?.status === 409) {
        setSectionEditError(error.response?.data?.message || 'Version conflict detected. Please refresh and try again.');
        setSectionBanner({
          type: 'error',
          text: error.response?.data?.message || 'Section was updated elsewhere. Please refresh.',
        });
        await fetchSections();
      } else {
        const errorText = error.response?.data?.message || 'Error updating section code';
        setSectionEditError(errorText);
        setSectionBanner({ type: 'error', text: errorText });
      }
    } finally {
      setUpdatingSection(false);
    }
  };

  const handleSectionChange = (sectionId) => {
    setSelectedSectionId(sectionId);

    if (!sectionId) {
      setStudents([]);
      return;
    }

    fetchStudents(sectionId);
  };

  const handlePrintInstructorEvaluation = async () => {
    if (!selectedEvaluationFormId) {
      setEvaluationNotice('Please select an evaluation form to print.');
      return;
    }

    if (!userEmail) {
      setEvaluationNotice('Unable to determine instructor email.');
      return;
    }

    try {
      setPrintingEvaluationReport(true);
      setEvaluationNotice('');

      const token = localStorage.getItem('token');

      // Fetch form summary, section summary, and individual responses
      const [summaryResponse, sectionSummaryResponse, responsesResponse] = await Promise.all([
        axios.get(`http://localhost:5000/api/stats/form/${selectedEvaluationFormId}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`http://localhost:5000/api/stats/form/${selectedEvaluationFormId}/instructor-section-summary`, {
          params: {
            instructorEmail: userEmail,
          },
          headers: { Authorization: `Bearer ${token}` }
        }).catch(error => {
          console.error('Error fetching section summary:', error);
          return { data: { success: false, data: [] } };
        }),
        axios.get(`http://localhost:5000/api/stats/form/${selectedEvaluationFormId}/instructor-responses`, {
          params: { instructorEmail: userEmail },
          headers: { Authorization: `Bearer ${token}` }
        }).catch(error => {
          console.error('Error fetching individual responses:', error);
          return { data: { success: false, data: [] } };
        })
      ]);

      if (!summaryResponse.data?.success || !summaryResponse.data?.data) {
        setEvaluationNotice(summaryResponse.data?.message || 'Unable to load evaluation data for this form.');
        return;
      }

      const summaryData = summaryResponse.data.data;
      const sectionSummary = sectionSummaryResponse.data?.success 
        ? sectionSummaryResponse.data.data 
        : [];
      const individualResponses = responsesResponse.data?.success
        ? responsesResponse.data.data
        : [];

      console.log('Section Summary from API:', sectionSummary);
      console.log('Individual Responses count:', individualResponses.length);
      console.log('Instructor Email:', userEmail);

      const instructorEntry = summaryData?.instructors?.find(
        (entry) => (entry.instructorEmail || '').toLowerCase().trim() === userEmail.toLowerCase().trim()
      );

      if (!instructorEntry) {
        setEvaluationNotice('No evaluation data found for your account in this form.');
        return;
      }

      const selectedFormDefinition = evaluationForms.find(
        (form) => form.googleFormId === selectedEvaluationFormId
      );
      
      // Use the fetched section summary and individual responses
      const payload = buildInstructorPrintPayload({
        instructor: instructorEntry,
        summary: summaryData,
        formDefinition: selectedFormDefinition,
        sectionSummary: sectionSummary,
        individualResponses: individualResponses,
      });

      if (!payload) {
        setEvaluationNotice('Unable to build a printable report for this evaluation form.');
        return;
      }

      await generateInstructorReportPdf(payload);
      setEvaluationNotice('Instructor evaluation PDF generated.');
    } catch (error) {
      console.error('Failed to generate instructor evaluation PDF:', error);
      setEvaluationNotice(error.response?.data?.message || 'Failed to generate instructor evaluation PDF.');
    } finally {
      setPrintingEvaluationReport(false);
    }
  };

  const handleStudentFormChange = (field, value) => {
    setStudentForm(prev => ({ ...prev, [field]: value }));
    setStudentFormErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validateStudentForm = () => {
    const errors = {};
    Object.entries(studentForm).forEach(([key, value]) => {
      if (!String(value || '').trim()) {
        errors[key] = 'This field is required';
      }
    });

    if (studentForm.studentId && !/^[A-Za-z0-9\-]+$/.test(studentForm.studentId.trim())) {
      errors.studentId = 'Student ID can contain letters, numbers, and dashes only';
    }
    if (studentForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(studentForm.email.trim())) {
      errors.email = 'Please enter a valid email address';
    }

    setStudentFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSectionFormChange = (field, value) => {
    setSectionForm(prev => ({ ...prev, [field]: value }));
    setSectionFormErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validateSectionForm = () => {
    const errors = {};
    Object.entries(sectionForm).forEach(([key, value]) => {
      if (!String(value || '').trim()) {
        errors[key] = 'This field is required';
      }
    });

    setSectionFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleCreateSection = async (e) => {
    e.preventDefault();
    setSectionAlert(null);

    if (!validateSectionForm()) {
      setSectionAlert({ type: 'error', text: 'Please fill in all required fields.' });
      return;
    }

    try {
    const payload = {
      sectionCode: sectionForm.sectionCode.trim(),
      course: sectionForm.course.trim(),
      yearLevel: sectionForm.yearLevel.trim(),
    };

      const response = await axios.post(
        'http://localhost:5000/api/instructor/sections',
        payload,
        { headers: getAuthHeaders() }
      );

      setSectionAlert({ type: 'success', text: response.data.message || 'Section created successfully!' });
      setSectionForm({ sectionCode: '', course: '', yearLevel: '' });
      setSectionFormErrors({});
      setShowCreateSectionModal(false);
      fetchSections();
    } catch (error) {
      const errorText = error.response?.data?.message || 'Error creating section';
      setSectionAlert({ type: 'error', text: errorText });
    }
  };

  const handleAddStudent = async (event) => {
    if (event) {
      event.preventDefault();
    }
    setStudentAlert(null);

    if (!validateStudentForm()) {
      setStudentAlert({ type: 'error', text: 'Please fill in all required fields.' });
      return;
    }

    try {
      const payload = {
        studentId: studentForm.studentId.trim(),
        sectionId: studentForm.sectionId.trim(),
        email: studentForm.email.trim(),
      subjectCode: studentForm.subjectCode.trim(),
      };

      const response = await axios.post(
        'http://localhost:5000/api/instructor/add-student',
        payload,
        { headers: getAuthHeaders() }
      );

      setStudentAlert({ type: 'success', text: response.data.message || 'Student added successfully!' });
      setStudentForm(initialStudentForm);
      setStudentFormErrors({});
      // Refresh students list with current section filter if selected
      fetchStudents(selectedSectionId);
    } catch (error) {
      const errorText = error.response?.data?.message || 'Error adding student';
      setStudentAlert({ type: 'error', text: errorText });
    }
  };

  const renderProfile = () => (
    <div style={styles.tabContent}>
      <h3>Profile Settings</h3>
      
      {loading ? (
        <div style={styles.loading}>Loading profile...</div>
      ) : profile ? (
        <div style={styles.profileContainer}>
          <div style={styles.profileCard}>
            <h4>Current Profile Information</h4>
            <div style={styles.profileInfo}>
              <div style={styles.infoRow}>
                <label>Name:</label>
                <span>{profile.name}</span>
              </div>
              <div style={styles.infoRow}>
                <label>Email:</label>
                <span>{profile.email}</span>
              </div>
              <div style={styles.infoRow}>
                <label>Role:</label>
                <span style={styles.roleBadge}>{profile.role}</span>
              </div>
              <div style={styles.infoRow}>
                <label>Member Since:</label>
                <span>{new Date(profile.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            {mvccMeta.user && (
              <div style={styles.mvccMetaCard}>
                <div style={styles.mvccMetaRow}>
                  <span>Account Version</span>
                  <strong>{mvccMeta.user.version}</strong>
                </div>
                <div style={styles.mvccMetaRow}>
                  <span>Last Updated</span>
                  <strong>{formatDateTime(mvccMeta.user.lastModifiedAt)}</strong>
                </div>
              </div>
            )}
            {mvccMeta.instructor && (
              <div style={styles.mvccMetaCard}>
                <div style={styles.mvccMetaRow}>
                  <span>Instructor Record Version</span>
                  <strong>{mvccMeta.instructor.version}</strong>
                </div>
                <div style={styles.mvccMetaRow}>
                  <span>Last Updated</span>
                  <strong>{formatDateTime(mvccMeta.instructor.lastModifiedAt)}</strong>
                </div>
              </div>
            )}
          </div>

          <div style={styles.updateCard}>
            <h4>Update Profile</h4>
            <form onSubmit={handleProfileUpdate} style={styles.form}>
              <div style={{ ...styles.formGroup, marginBottom: '12px' }}>
                <label style={{ fontWeight: 600, marginBottom: '8px', display: 'block' }}>Choose what to update:</label>
                <div style={styles.radioGroup}>
                  <label style={styles.radioOption}>
                    <input
                      type="radio"
                      name="updateMode"
                      value="email"
                      checked={updateMode === 'email'}
                      onChange={() => { setUpdateMode('email'); setMessage(''); }}
                      style={styles.radio}
                    />
                    Update Email
                  </label>
                  <label style={styles.radioOption}>
                    <input
                      type="radio"
                      name="updateMode"
                      value="password"
                      checked={updateMode === 'password'}
                      onChange={() => { setUpdateMode('password'); setMessage(''); }}
                      style={styles.radio}
                    />
                    Update Password
                  </label>
                </div>
              </div>

              {updateMode === 'email' && (
                <div style={styles.formGroup}>
                  <label>New Email:</label>
                  <input
                    type="email"
                    placeholder="Enter new email"
                    value={updateForm.newEmail}
                    onChange={(e) => setUpdateForm({...updateForm, newEmail: e.target.value})}
                    style={styles.input}
                    required
                  />
                  {updateErrors.newEmail && (
                    <div style={styles.inputError}>{updateErrors.newEmail}</div>
                  )}
                </div>
              )}

              {updateMode === 'password' && (
                <>
                  <div style={styles.formGroup}>
                    <label>Current Password:</label>
                    <input
                      type="password"
                      placeholder="Enter current password"
                      value={updateForm.currentPassword}
                      onChange={(e) => setUpdateForm({...updateForm, currentPassword: e.target.value})}
                      style={styles.input}
                      required
                    />
                    {updateErrors.currentPassword && (
                      <div style={styles.inputError}>{updateErrors.currentPassword}</div>
                    )}
                  </div>
                  <div style={styles.formGroup}>
                    <label>New Password:</label>
                    <input
                      type="password"
                      placeholder="Enter new password"
                      value={updateForm.newPassword}
                      onChange={(e) => setUpdateForm({...updateForm, newPassword: e.target.value})}
                      style={styles.input}
                      required
                    />
                    {updateErrors.newPassword && (
                      <div style={styles.inputError}>{updateErrors.newPassword}</div>
                    )}
                  </div>
                  <div style={styles.formGroup}>
                    <label>Confirm New Password:</label>
                    <input
                      type="password"
                      placeholder="Re-enter new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      style={styles.input}
                      required
                    />
                    {updateErrors.confirmPassword && (
                      <div style={styles.inputError}>{updateErrors.confirmPassword}</div>
                    )}
                  </div>
                </>
              )}

              <button type="submit" style={styles.updateButton} disabled={!updateMode}>
                Update Profile
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div style={styles.error}>Profile not found</div>
      )}

      {message && (
        <div style={styles.message}>
          {message}
        </div>
      )}
      {conflictDetails && (
        <div style={styles.errorMessage}>
          <strong>Latest version:</strong> {conflictDetails.currentVersion ?? 'unknown'} (you attempted {conflictDetails.attemptedVersion ?? 'unknown'}). Please refresh to load the newest data.
        </div>
      )}
    </div>
  );

  // Render View Students tab
  const renderViewStudents = () => {
    const hasSections = sections.length > 0;
    const isViewingAll = selectedSectionId === ALL_SECTIONS_OPTION;
    const hasSelection = Boolean(selectedSectionId);
    const uniqueSectionNames = Array.from(
      new Set(
        students
          .map((student) => student.sectionId?.sectionCode)
          .filter(Boolean)
      )
    );

    const headerSectionDetails = selectedSection || students[0]?.sectionId || null;

    return (
      <div style={styles.tabContent}>
        <div style={styles.studentHeader}>
          <h3 style={{ margin: 0 }}>Student Management</h3>
          <button
            type="button"
            onClick={() => {
              setShowCreateSectionModal(true);
              setSectionAlert(null);
            }}
            style={styles.createSectionButton}
          >
            + Create Section
          </button>
        </div>

        {sectionBanner && (
          <div style={sectionBanner.type === 'success' ? styles.message : styles.errorMessage}>
            {sectionBanner.text}
          </div>
        )}

        <div style={styles.studentManagementLayout}>
          <div style={styles.addStudentCard}>
            <div style={styles.addStudentHeader}>
              <div>
                <h4 style={{ margin: 0 }}>Add Student</h4>
                <p style={styles.addStudentHelper}>
                  Use this form to enroll a student into one of your sections.
                </p>
              </div>
              <button
                type="button"
                style={styles.toggleAddStudentButton}
                onClick={() => setShowAddStudentForm((prev) => !prev)}
                disabled={!hasSections}
              >
                {showAddStudentForm ? 'Hide Add Student' : '+ Add Student'}
              </button>
            </div>

            {!hasSections && (
              <div style={{ ...styles.message, backgroundColor: '#fff3cd', borderColor: '#ffeaa7', color: '#856404' }}>
                <strong>No sections available.</strong> Create a section first to add students.
              </div>
            )}

            <div
              style={{
                ...styles.collapsible,
                ...(showAddStudentForm ? styles.collapsibleOpen : {}),
              }}
            >
              <form onSubmit={handleAddStudent} style={styles.form}>
                <div style={styles.formGroup}>
                  <label>Section Code *</label>
                  <select
                    value={studentForm.sectionId}
                    onChange={(e) => handleStudentFormChange('sectionId', e.target.value)}
                    style={styles.input}
                    required
                    disabled={!hasSections}
                  >
                    <option value="">
                      {hasSections ? 'Select Section' : 'No sections available'}
                    </option>
                    {sections.map((section) => (
                      <option key={section._id} value={section._id}>
                        {section.sectionCode} - {section.course} ({section.yearLevel}){section.subjectCode ? ` - ${section.subjectCode}` : ''}
                      </option>
                    ))}
                  </select>
                  {studentFormErrors.sectionId && <span style={styles.inputError}>{studentFormErrors.sectionId}</span>}
                </div>

                <div style={styles.formGroup}>
                  <label>Subject Code *</label>
                  <input
                    type="text"
                    value={studentForm.subjectCode}
                    onChange={(e) => handleStudentFormChange('subjectCode', e.target.value)}
                    style={styles.input}
                    placeholder="e.g., IT321"
                    required
                  />
                  {studentFormErrors.subjectCode && <span style={styles.inputError}>{studentFormErrors.subjectCode}</span>}
                </div>

                <div style={styles.formGroup}>
                  <label>Student ID *</label>
                  <input
                    type="text"
                    value={studentForm.studentId}
                    onChange={(e) => handleStudentFormChange('studentId', e.target.value)}
                    style={styles.input}
                    placeholder="e.g., 200310123"
                    required
                  />
                  {studentFormErrors.studentId && <span style={styles.inputError}>{studentFormErrors.studentId}</span>}
                </div>

                <div style={styles.formGroup}>
                  <label>Email *</label>
                  <input
                    type="email"
                    value={studentForm.email}
                    onChange={(e) => handleStudentFormChange('email', e.target.value)}
                    style={styles.input}
                    placeholder="name@example.com"
                    required
                  />
                  {studentFormErrors.email && <span style={styles.inputError}>{studentFormErrors.email}</span>}
                </div>

                <div style={{ display: 'flex', gap: '12px', marginTop: '20px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    style={styles.updateButton}
                    onClick={() => {
                      setStudentForm(initialStudentForm);
                      setStudentFormErrors({});
                    }}
                  >
                    Clear Form
                  </button>
                  <button type="submit" style={styles.addButton} disabled={!hasSections}>
                    Add Student
                  </button>
                </div>
              </form>

              {studentAlert && (
                <div style={studentAlert.type === 'success' ? styles.message : styles.errorMessage}>
                  {studentAlert.text}
                </div>
              )}
            </div>
          </div>

          <div style={styles.studentListCard}>
            <div style={styles.filterCard}>
              <label style={styles.filterLabel}>Select Section Code</label>
              <div style={styles.filterControls}>
                <select
                  value={selectedSectionId}
                  onChange={(e) => handleSectionChange(e.target.value)}
                  style={{ ...styles.input, maxWidth: '400px' }}
                  disabled={!hasSections}
                >
                  <option value="">
                    {hasSections ? '-- Select a Section Code --' : 'No sections available'}
                  </option>
                  {hasSections && (
                    <option value={ALL_SECTIONS_OPTION}>All Students (All Sections)</option>
                  )}
                  {sections.map((section) => (
                    <option key={section._id} value={section._id}>
                    {section.sectionCode} - {section.course} ({section.yearLevel}){section.subjectCode ? ` - ${section.subjectCode}` : ''}
                    </option>
                  ))}
                </select>
                {hasSelection && (
                  <button
                    type="button"
                    onClick={() => handleSectionChange('')}
                    style={styles.clearFilterButton}
                  >
                    Clear Selection
                  </button>
                )}
              </div>
              {!hasSections && (
                <p style={styles.filterHelperText}>
                  You need to create at least one section before adding or viewing students.
                </p>
              )}
            </div>

            {!hasSelection ? (
              <div style={styles.emptyState}>
                <p style={{ margin: 0, fontSize: '18px', color: '#6c757d' }}>
                  Select a section or choose "All Students" to view the roster.
                </p>
              </div>
            ) : studentsLoading ? (
              <div style={styles.loading}>Loading students...</div>
            ) : students.length > 0 ? (
              <div style={styles.studentTable}>
                {isViewingAll ? (
                  <div style={styles.sectionHeader}>
                    <h4 style={{ margin: 0, color: '#667eea' }}>All Students</h4>
                    <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>
                      <span><strong>Sections:</strong> {uniqueSectionNames.join(', ') || '—'}</span>
                      {' | '}
                      <span><strong>Total Students:</strong> {students.length}</span>
                    </div>
                  </div>
                ) : (
                  headerSectionDetails && (
                    <div style={styles.sectionHeader}>
                      <div>
                        <h4 style={{ margin: 0, color: '#667eea' }}>
                          {headerSectionDetails.sectionCode || '—'}
                        </h4>
                        <div style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>
                          <span><strong>Course:</strong> {headerSectionDetails.course || '—'}</span>
                          {' | '}
                          <span><strong>Year Level:</strong> {headerSectionDetails.yearLevel || '—'}</span>
                          {' | '}
                          <span><strong>Subject Code:</strong> {students[0]?.subject || headerSectionDetails.subjectCode || '—'}</span>
                          {' | '}
                          <span><strong>Total Students:</strong> {students.length}</span>
                        </div>
                      </div>
                      <div style={styles.sectionActions} ref={sectionActionRef}>
                        <button
                          type="button"
                          style={styles.sectionMenuButton}
                          onClick={() => setShowSectionActionMenu((prev) => !prev)}
                        >
                          ⋮
                        </button>
                        {showSectionActionMenu && (
                          <div style={styles.sectionMenu}>
                            <button
                              type="button"
                              style={styles.sectionMenuItem}
                              onClick={handleOpenEditSectionModal}
                            >
                              Edit Section Code
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}

                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.tableHeader}>Student ID</th>
                      <th style={styles.tableHeader}>Email</th>
                      <th style={styles.tableHeader}>Section</th>
                      <th style={styles.tableHeader}>Course</th>
                      <th style={styles.tableHeader}>Year Level</th>
                      <th style={styles.tableHeader}>Subject Code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student._id}>
                        <td style={styles.tableCell}>{student.studentId || '—'}</td>
                        <td style={styles.tableCell}>{student.email || '—'}</td>
                        <td style={styles.tableCell}>{student.sectionId?.sectionCode || '—'}</td>
                        <td style={styles.tableCell}>{student.course || student.sectionId?.course || '—'}</td>
                        <td style={styles.tableCell}>{student.yearLevel || student.sectionId?.yearLevel || '—'}</td>
                        <td style={styles.tableCell}>{student.subject || student.sectionId?.subjectCode || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={styles.studentCount}>
                  Total Students: {students.length}
                </div>
              </div>
            ) : (
              <div style={styles.emptyState}>No students found for the current selection.</div>
            )}
          </div>
        </div>

        {showEditSectionModal && (
          <div style={styles.modalOverlay} onClick={closeEditSectionModal}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Edit Section Code</h3>
                <button
                  style={styles.modalCloseButton}
                  onClick={closeEditSectionModal}
                  type="button"
                >
                  ×
                </button>
              </div>
              <div style={styles.modalBody}>
                <form onSubmit={handleUpdateSectionCode}>
                  <div style={styles.formGroup}>
                    <label>Section Code *</label>
                    <input
                      type="text"
                      value={sectionEditValue}
                      onChange={(e) => setSectionEditValue(e.target.value)}
                      style={styles.input}
                      placeholder="Enter new section code"
                      required
                    />
                    {sectionEditError && <span style={styles.inputError}>{sectionEditError}</span>}
                  </div>
                  <div style={styles.modalFooter}>
                    <button
                      type="button"
                      style={styles.cancelButton}
                      onClick={closeEditSectionModal}
                    >
                      Cancel
                    </button>
                    <button type="submit" style={styles.sendFormConfirmButton} disabled={updatingSection}>
                      {updatingSection ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {showCreateSectionModal && (
          <div style={styles.modalOverlay} onClick={() => setShowCreateSectionModal(false)}>
            <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Create Section</h3>
                <button
                  style={styles.modalCloseButton}
                  onClick={() => {
                    setShowCreateSectionModal(false);
                    setSectionForm({ sectionCode: '', course: '', yearLevel: '' });
                    setSectionFormErrors({});
                    setSectionAlert(null);
                  }}
                >
                  ×
                </button>
              </div>
              <div style={styles.modalBody}>
                <form onSubmit={handleCreateSection}>
                  <div style={styles.formGroup}>
                    <label>Section Code *</label>
                    <input
                      type="text"
                      value={sectionForm.sectionCode}
                      onChange={(e) => handleSectionFormChange('sectionCode', e.target.value)}
                      style={styles.input}
                      placeholder="e.g., BSIT-3A"
                      required
                    />
                    {sectionFormErrors.sectionCode && <span style={styles.inputError}>{sectionFormErrors.sectionCode}</span>}
                  </div>

                  <div style={styles.formGroup}>
                    <label>Course *</label>
                    <input
                      type="text"
                      value={sectionForm.course}
                      onChange={(e) => handleSectionFormChange('course', e.target.value)}
                      style={styles.input}
                      placeholder="e.g., BSIT"
                      required
                    />
                    {sectionFormErrors.course && <span style={styles.inputError}>{sectionFormErrors.course}</span>}
                  </div>

                  <div style={styles.formGroup}>
                    <label>Year Level *</label>
                    <select
                      value={sectionForm.yearLevel}
                      onChange={(e) => handleSectionFormChange('yearLevel', e.target.value)}
                      style={styles.input}
                      required
                    >
                      <option value="">Select Year Level</option>
                      <option value="1st Year">1st Year</option>
                      <option value="2nd Year">2nd Year</option>
                      <option value="3rd Year">3rd Year</option>
                      <option value="4th Year">4th Year</option>
                    </select>
                    {sectionFormErrors.yearLevel && <span style={styles.inputError}>{sectionFormErrors.yearLevel}</span>}
                  </div>

                  {sectionAlert && (
                    <div style={sectionAlert.type === 'success' ? styles.message : styles.errorMessage}>
                      {sectionAlert.text}
                    </div>
                  )}

                  <div style={styles.modalFooter}>
                    <button
                      type="button"
                      style={styles.cancelButton}
                      onClick={() => {
                        setShowCreateSectionModal(false);
                        setSectionForm({ sectionCode: '', course: '', yearLevel: '' });
                        setSectionFormErrors({});
                        setSectionAlert(null);
                      }}
                    >
                      Cancel
                    </button>
                    <button type="submit" style={styles.sendFormConfirmButton}>
                      Create Section
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderViewEvaluation = () => (
    <div style={styles.tabContent}>
      <h3>View Evaluation</h3>
      <p style={{ color: '#555', marginTop: '5px' }}>
        Select an evaluation form below to generate a PDF summary of your evaluation results.
      </p>

      <div style={styles.formGroup}>
        <label>Evaluation Form</label>
        {loadingEvaluationForms ? (
          <p style={{ color: '#666', marginTop: '10px' }}>Loading evaluation forms...</p>
        ) : evaluationForms.length === 0 ? (
          <p style={{ color: '#dc3545', marginTop: '10px' }}>
            {evaluationNotice || 'No Google evaluation forms available.'}
          </p>
        ) : (
          <select
            value={selectedEvaluationFormId}
            onChange={(e) => setSelectedEvaluationFormId(e.target.value)}
            style={{ ...styles.input, maxWidth: '400px' }}
          >
            <option value="">-- Select an Evaluation Form --</option>
            {evaluationForms.map((form) => (
              <option key={form._id} value={form.googleFormId}>
                {form.title}
              </option>
            ))}
          </select>
        )}
      </div>

      <button
        style={{ ...styles.addButton, maxWidth: '220px' }}
        onClick={handlePrintInstructorEvaluation}
        disabled={!selectedEvaluationFormId || printingEvaluationReport}
      >
        {printingEvaluationReport ? 'Generating...' : '🖨 Print Report'}
      </button>

      {evaluationNotice && (
        <div style={{ ...styles.message, marginTop: '20px' }}>
          {evaluationNotice}
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
            <p>Instructor Dashboard</p>
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
            ...(activeTab === 'profile' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('profile')}
        >
          Profile Settings
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'students' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('students')}
        >
          View Students
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'evaluation' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('evaluation')}
        >
          View Evaluation
        </button>
      </div>

      <div style={styles.content}>
        {activeTab === 'profile' && renderProfile()}
        {activeTab === 'students' && renderViewStudents()}
        {activeTab === 'evaluation' && renderViewEvaluation()}
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#667eea',
    color: 'white',
    padding: '20px 0',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  headerContent: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 20px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoutButton: {
    background: 'rgba(255,255,255,0.2)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.3)',
    padding: '10px 20px',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
  },
  tabs: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '20px',
    display: 'flex',
    gap: '10px',
  },
  tab: {
    padding: '12px 24px',
    background: 'white',
    border: '1px solid #ddd',
    borderRadius: '5px 5px 0 0',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '500',
  },
  activeTab: {
    background: '#667eea',
    color: 'white',
    borderColor: '#667eea',
  },
  content: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '0 20px 20px 20px',
  },
  tabContent: {
    background: 'white',
    padding: '30px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  studentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '24px',
  },
  studentManagementLayout: {
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  studentListCard: {
    minWidth: 0,
  },
  filterCard: {
    marginBottom: '20px',
    padding: '15px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e9ecef',
  },
  filterLabel: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: 600,
    fontSize: '16px',
  },
  filterControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap',
  },
  filterHelperText: {
    marginTop: '8px',
    fontSize: '14px',
    color: '#6c757d',
  },
  addStudentCard: {
    padding: '24px',
    border: '1px solid #e9ecef',
    borderRadius: '8px',
    backgroundColor: '#f8f9fa',
    height: 'fit-content',
  },
  addStudentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
    flexWrap: 'wrap',
    marginBottom: '8px',
  },
  toggleAddStudentButton: {
    background: '#667eea',
    color: 'white',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background-color 0.2s ease',
  },
  addStudentHelper: {
    color: '#6c757d',
    marginTop: 0,
    marginBottom: '16px',
    fontSize: '14px',
  },
  collapsible: {
    maxHeight: 0,
    opacity: 0,
    overflow: 'hidden',
    transition: 'max-height 0.35s ease, opacity 0.35s ease, margin-top 0.35s ease',
    marginTop: 0,
  },
  collapsibleOpen: {
    maxHeight: '1000px',
    opacity: 1,
    marginTop: '12px',
  },
  loading: {
    textAlign: 'center',
    padding: '40px',
    fontSize: '18px',
    color: '#666',
  },
  profileContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '30px',
  },
  profileCard: {
    padding: '20px',
    border: '1px solid #e9ecef',
    borderRadius: '8px',
    backgroundColor: '#f8f9fa',
  },
  updateCard: {
    padding: '20px',
    border: '1px solid #e9ecef',
    borderRadius: '8px',
    backgroundColor: 'white',
  },
  profileInfo: {
    marginTop: '15px',
  },
  mvccMetaCard: {
    marginTop: '15px',
    padding: '12px',
    borderRadius: '6px',
    backgroundColor: '#eef2ff',
    border: '1px solid #c7d2fe',
  },
  mvccMetaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '14px',
    color: '#312e81',
    marginBottom: '6px',
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #e9ecef',
  },
  roleBadge: {
    background: '#28a745',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
  },
  form: {
    marginTop: '15px',
  },
  formGroup: {
    marginBottom: '20px',
  },
  inputError: {
    display: 'block',
    marginTop: '6px',
    fontSize: '13px',
    color: '#dc3545',
  },
  input: {
    width: '100%',
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    fontSize: '16px',
    marginTop: '5px',
  },
  radioGroup: {
    display: 'flex',
    gap: '20px',
    alignItems: 'center',
  },
  radioOption: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    userSelect: 'none',
  },
  radio: {
    cursor: 'pointer',
  },
  updateButton: {
    background: '#28a745',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '500',
  },
  credentialsCard: {
    padding: '30px',
    border: '1px solid #e9ecef',
    borderRadius: '8px',
    backgroundColor: '#f8f9fa',
  },
  credentialInfo: {
    textAlign: 'center',
  },
  infoText: {
    color: '#666',
    marginBottom: '30px',
    fontSize: '16px',
  },
  credentialDetails: {
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px',
  },
  credentialRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px 0',
    borderBottom: '1px solid #e9ecef',
  },
  credentialValue: {
    fontFamily: 'monospace',
    fontWeight: '600',
    color: '#667eea',
  },
  securityNote: {
    background: '#fff3cd',
    border: '1px solid #ffeaa7',
    borderRadius: '8px',
    padding: '15px',
    textAlign: 'left',
  },
  message: {
    marginTop: '20px',
    padding: '15px',
    borderRadius: '5px',
    backgroundColor: '#d4edda',
    color: '#155724',
    border: '1px solid #c3e6cb',
  },
  error: {
    textAlign: 'center',
    padding: '40px',
    color: '#dc3545',
    fontSize: '18px',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginBottom: '20px',
  },
  addButton: {
    background: '#667eea',
    color: 'white',
    border: 'none',
    padding: '12px 24px',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '16px',
    fontWeight: '500',
    marginTop: '20px',
  },
  errorMessage: {
    marginTop: '20px',
    padding: '15px',
    borderRadius: '5px',
    backgroundColor: '#f8d7da',
    color: '#721c24',
    border: '1px solid #f5c6cb',
  },
  clearFilterButton: {
    background: '#6c757d',
    color: 'white',
    border: 'none',
    padding: '12px 20px',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  studentTable: {
    marginTop: '20px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: 'white',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  tableHeader: {
    backgroundColor: '#667eea',
    color: 'white',
    padding: '15px',
    textAlign: 'left',
    fontWeight: '600',
    borderBottom: '2px solid #5568d3',
  },
  tableCell: {
    padding: '15px',
    borderBottom: '1px solid #e9ecef',
  },
  studentCount: {
    marginTop: '15px',
    padding: '10px',
    backgroundColor: '#f8f9fa',
    borderRadius: '5px',
    textAlign: 'center',
    fontWeight: '600',
    color: '#667eea',
  },
  emptyState: {
    textAlign: 'center',
    padding: '60px 20px',
    color: '#6c757d',
    fontSize: '18px',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
  },
  successMessage: {
    marginTop: '20px',
    padding: '15px',
    borderRadius: '5px',
    backgroundColor: '#d4edda',
    color: '#155724',
    border: '1px solid #c3e6cb',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: '20px',
  },
  modalContent: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
    maxWidth: '600px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '24px 24px 0 24px',
    borderBottom: '1px solid #e9ecef',
    marginBottom: '20px',
  },
  modalTitle: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '600',
    color: '#333',
  },
  modalCloseButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    color: '#999',
    cursor: 'pointer',
    padding: 0,
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '50%',
    transition: 'background-color 0.2s ease',
  },
  modalBody: {
    padding: '0 24px 20px 24px',
  },
  modalText: {
    fontSize: '16px',
    color: '#333',
    marginBottom: '15px',
    lineHeight: '1.5',
  },
  modalInfoBox: {
    background: '#f8f9fa',
    border: '1px solid #e9ecef',
    borderRadius: '8px',
    padding: '15px',
    marginBottom: '20px',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    padding: '20px 24px 24px 24px',
    borderTop: '1px solid #e9ecef',
  },
  cancelButton: {
    padding: '10px 20px',
    background: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background-color 0.2s ease',
  },
  sendFormConfirmButton: {
    padding: '10px 20px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background-color 0.2s ease',
  },
  createSectionButton: {
    background: '#28a745',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background-color 0.2s ease',
  },
  sectionHeader: {
    padding: '15px 20px',
    backgroundColor: '#f8f9fa',
    border: '1px solid #e9ecef',
    borderRadius: '8px 8px 0 0',
    marginBottom: '0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '12px',
  },
  sectionActions: {
    position: 'relative',
  },
  sectionMenuButton: {
    background: 'transparent',
    border: 'none',
    fontSize: '22px',
    cursor: 'pointer',
    padding: '4px 8px',
    borderRadius: '6px',
    lineHeight: 1,
    color: '#4a5568',
  },
  sectionMenu: {
    position: 'absolute',
    top: '32px',
    right: 0,
    backgroundColor: '#ffffff',
    border: '1px solid #e9ecef',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 10,
    minWidth: '180px',
  },
  sectionMenuItem: {
    width: '100%',
    padding: '10px 14px',
    background: 'none',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#1f2933',
  },
};

export default InstructorDashboard;
