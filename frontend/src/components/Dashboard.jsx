import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import EvaluationForm from './EvaluationForm.jsx';
import RBACSettings from './RBACSettings.jsx';
import generateDepartmentPerformancePdf from '../utils/generateDepartmentPerformancePdf';

const describeScore = (score) => {
  const value = Number(score);
  if (!Number.isFinite(value) || value <= 0) return 'No Data';
  if (value >= 4.5) return 'Outstanding';
  if (value >= 4.0) return 'Very Satisfactory';
  if (value >= 3.5) return 'Satisfactory';
  if (value >= 3.0) return 'Fair';
  if (value >= 2.5) return 'Needs Improvement';
  return 'Poor';
};

const roundScore = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
};

const getInstructorKey = (instructor) =>
  instructor?.instructorId || instructor?.instructorEmail || instructor?.instructorName || '';

const normalizeQuestionText = (text = '') =>
  text
    .toString()
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const QUESTION_CATEGORY_DEFINITIONS = [
  {
    key: 'lesson_presentation',
    title: 'Lesson Presentation',
    aliases: ['lesson presentation'],
    keywords: ['lesson presentation', 'module', 'consultations', 'learning outcomes'],
  },
  {
    key: 'management_of_learning',
    title: 'Management of Learning',
    aliases: ['management of learning'],
    keywords: ['management of learning', 'learning styles', 'learning situations', 'management'],
  },
  {
    key: 'innovativeness_creativity',
    title: 'Innovativeness and Creativity',
    aliases: ['innovativeness and creativity', 'innovation', 'creativity'],
    keywords: ['innovative', 'innovation', 'creative', 'creativity', 'hyflex'],
  },
  {
    key: 'mastery_subject_matter',
    title: 'Mastery of the Subject Matter',
    aliases: ['mastery of the subject matter', 'subject mastery'],
    keywords: ['subject matter', 'mastery', 'expertise', 'knowledge'],
  },
  {
    key: 'assessment_of_learning',
    title: 'Assessment of Learning',
    aliases: ['assessment of learning', 'assessment'],
    keywords: ['assessment', 'evaluates', 'measures learning', 'rubric'],
  },
  {
    key: 'general_performance',
    title: 'General Performance Indicators',
    aliases: ['general performance'],
    keywords: [],
  },
];

const findCategoryByPrefix = (prefix) => {
  if (!prefix) return null;
  const normalized = prefix.toLowerCase();
  return (
    QUESTION_CATEGORY_DEFINITIONS.find(
      (definition) =>
        definition.title.toLowerCase() === normalized ||
        definition.aliases?.some((alias) => alias.toLowerCase() === normalized)
    ) || null
  );
};

const findCategoryByKeywords = (questionText = '') => {
  const normalized = questionText.toLowerCase();
  return (
    QUESTION_CATEGORY_DEFINITIONS.find((definition) =>
      definition.keywords.some((keyword) => normalized.includes(keyword))
    ) || null
  );
};

const detectQuestionCategory = (questionText = '') => {
  if (!questionText) {
    return QUESTION_CATEGORY_DEFINITIONS[QUESTION_CATEGORY_DEFINITIONS.length - 1];
  }

  const colonIndex = questionText.indexOf(':');
  if (colonIndex > 0) {
    const prefix = questionText.substring(0, colonIndex);
    const match = findCategoryByPrefix(prefix);
    if (match) {
      return match;
    }
  }

  const categoryFromKeywords = findCategoryByKeywords(questionText);
  if (categoryFromKeywords) {
    return categoryFromKeywords;
  }

  const numberMatch = questionText.match(/^\s*(\d{1,2})[\.\)]/);
  if (numberMatch) {
    const questionNumber = parseInt(numberMatch[1], 10);
    if (questionNumber >= 1 && questionNumber <= 7) {
      return QUESTION_CATEGORY_DEFINITIONS[0];
    }
    if (questionNumber >= 8 && questionNumber <= 12) {
      return QUESTION_CATEGORY_DEFINITIONS[1];
    }
    if (questionNumber >= 13 && questionNumber <= 17) {
      return QUESTION_CATEGORY_DEFINITIONS[2];
    }
    if (questionNumber >= 18 && questionNumber <= 22) {
      return QUESTION_CATEGORY_DEFINITIONS[3];
    }
    if (questionNumber >= 23 && questionNumber <= 30) {
      return QUESTION_CATEGORY_DEFINITIONS[4];
    }
  }

  return QUESTION_CATEGORY_DEFINITIONS[QUESTION_CATEGORY_DEFINITIONS.length - 1];
};

const IGNORED_INDICATOR_KEYWORDS = [
  'student name',
  'course',
  'year level',
  'section code',
  'subject code',
  'select instructor',
];

const shouldIgnoreQuestion = (text = '') => {
  const normalized = text.toLowerCase();
  return IGNORED_INDICATOR_KEYWORDS.some((keyword) => normalized.includes(keyword));
};

const Dashboard = ({ onLogout, userRole }) => {
  const [activeTab, setActiveTab] = useState('evaluate');
  const [evaluations, setEvaluations] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [stats, setStats] = useState({});
  const [instructorStats, setInstructorStats] = useState([]);
  const [summaryStats, setSummaryStats] = useState({});
  const [sheetsSummary, setSheetsSummary] = useState(null);
  const [sheetsLoading, setSheetsLoading] = useState(false);
  const [overallSummary, setOverallSummary] = useState(null);
  const [overallSummaryLoading, setOverallSummaryLoading] = useState(false);
  const [selectedInstructorDetails, setSelectedInstructorDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedFormId, setSelectedFormId] = useState(''); // Selected evaluation form ID
  const [availableForms, setAvailableForms] = useState([]); // List of available evaluation forms
  const [loadingEvaluationForms, setLoadingEvaluationForms] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newInstructor, setNewInstructor] = useState({
    name: '',
    department: '',
    email: ''
  });
  const [addingInstructor, setAddingInstructor] = useState(false);
  const [message, setMessage] = useState('');
  const [studentId, setStudentId] = useState('');
  const [instructorsView, setInstructorsView] = useState('active'); // 'active' | 'archived'
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [instructorToDelete, setInstructorToDelete] = useState(null);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [evaluationForms, setEvaluationForms] = useState([]);
  // Add Evaluation Form (Dean)
  const [showAddEvalForm, setShowAddEvalForm] = useState(false);
  const [newEvalForm, setNewEvalForm] = useState({ title: '', description: '', googleFormLink: '' });
  // Instructor/Section/Students view state
  const [selectedInstructorId, setSelectedInstructorId] = useState('');
  const [instructorSections, setInstructorSections] = useState([]);
  const [selectedSectionId, setSelectedSectionId] = useState('');
  const [sectionStudents, setSectionStudents] = useState([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newEvaluationForm, setNewEvaluationForm] = useState({
    title: '',
    description: '',
    questions: []
  });
  const [createGoogleForm, setCreateGoogleForm] = useState(true); // Default to creating Google Form
  const [createdFormGoogleLink, setCreatedFormGoogleLink] = useState(null);
  const [liveQuestionsByForm, setLiveQuestionsByForm] = useState({});
  const [loadingForms, setLoadingForms] = useState(false);
  const [googleForms, setGoogleForms] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [showAddDepartmentModal, setShowAddDepartmentModal] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState('');
  const [savingDepartment, setSavingDepartment] = useState(false);
  const [departmentError, setDepartmentError] = useState('');
  const [selectedForm, setSelectedForm] = useState(null);
  const [formResponses, setFormResponses] = useState([]);
  const [formSummary, setFormSummary] = useState(null);
  const [deanCreatedForms, setDeanCreatedForms] = useState([]);
  const [newGoogleFormTitle, setNewGoogleFormTitle] = useState('');
  const [creatingGoogleForm, setCreatingGoogleForm] = useState(false);
  const [newGoogleFormDescription, setNewGoogleFormDescription] = useState('');
  const [printInstructorKey, setPrintInstructorKey] = useState('');
  const [printingFormReport, setPrintingFormReport] = useState(false);
  const [printingDepartmentReport, setPrintingDepartmentReport] = useState(false);
  const [selectedDepartmentForPrint, setSelectedDepartmentForPrint] = useState('');
  // Send Evaluation Form state (Dean Dashboard)
  const [showSendFormModal, setShowSendFormModal] = useState(false);
  const [evaluationFormLink, setEvaluationFormLink] = useState('');
  const [sendingEmails, setSendingEmails] = useState(false);
  const [sendFormMode, setSendFormMode] = useState(''); // 'all' | 'instructor' | 'section'
  const [loadingAvailableForms, setLoadingAvailableForms] = useState(false);
  const [selectedFormIdForSend, setSelectedFormIdForSend] = useState('');
  const [instructorSearch, setInstructorSearch] = useState('');
  // Edit instructor state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingInstructor, setEditingInstructor] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: '',
    email: '',
    department: '',
    version: 0
  });
  const [editMenuOpen, setEditMenuOpen] = useState(null);
  const [savingInstructor, setSavingInstructor] = useState(false);
  const [editConflictDetails, setEditConflictDetails] = useState(null);
  
  const location = useLocation();

  const fetchDepartments = useCallback(async () => {
    setLoadingDepartments(true);
    try {
      const response = await axios.get('http://localhost:5000/api/departments');
      setDepartments(response.data.departments || []);
    } catch (error) {
      console.error('Error fetching departments:', error);
      setMessage(error.response?.data?.message || 'Error fetching departments');
    } finally {
      setLoadingDepartments(false);
    }
  }, []);

  useEffect(() => {
    // Check for token from Google OAuth callback
    const urlParams = new URLSearchParams(location.search);
    const token = urlParams.get('token');
    const roleFromUrl = urlParams.get('role');
    
    if (token) {
      // Store the token from Google OAuth
      localStorage.setItem('token', token);
      localStorage.setItem('tokenExpiry', (new Date().getTime() + (24 * 60 * 60 * 1000)).toString());
      
      // Store role if provided in URL
      if (roleFromUrl) {
        localStorage.setItem('selectedRole', roleFromUrl);
      }
      
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
    
    // Set default tab based on user role
    if (userRole === 'dean') {
      setActiveTab('instructorStats');
      // Fetch evaluation forms and Google Sheets data when dean dashboard loads
      fetchEvaluationForms();
      fetchOverallSummary();
    }
    
    fetchData();
  }, [location.search, userRole]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  useEffect(() => {
    if (showAddForm) {
      fetchDepartments();
    }
  }, [showAddForm, fetchDepartments]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (editMenuOpen && !event.target.closest('[data-menu-container]')) {
        setEditMenuOpen(null);
      }
      if (openDropdown && !event.target.closest('[data-dropdown]')) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [openDropdown]);

  useEffect(() => {
    if (overallSummary?.instructors?.length) {
      const hasExistingSelection = overallSummary.instructors.find(
        (instructor) => getInstructorKey(instructor) === printInstructorKey
      );
      if (!printInstructorKey || !hasExistingSelection) {
        setPrintInstructorKey(getInstructorKey(overallSummary.instructors[0]));
      }
    } else if (printInstructorKey) {
      setPrintInstructorKey('');
    }
  }, [overallSummary, printInstructorKey]);

  const fetchData = async (viewType = null) => {
    setLoading(true);
    try {
      // Get auth token
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // Use provided viewType or fallback to current state
      const currentView = viewType || instructorsView;
      const promises = [
        axios.get(`http://localhost:5000/api/instructors?archived=${currentView === 'archived'}`, { headers }),
        axios.get('http://localhost:5000/api/stats', { headers })
      ];

      // Fetch data based on user role
      if (userRole === 'dean') {
        // Deans can see detailed instructor stats
        promises.push(axios.get('http://localhost:5000/api/stats/instructors', { headers }));
        promises.push(axios.get('http://localhost:5000/api/evaluation-forms', { headers }));
      }

      const results = await Promise.all(promises);
      const [instructorsRes, statsRes, instructorStatsRes, evaluationFormsRes] = results;

      setInstructors(instructorsRes.data.instructors || []);
      setStats(statsRes.data.stats || {});
      
      // Set instructor stats for deans
      if (userRole === 'dean' && instructorStatsRes) {
        setInstructorStats(instructorStatsRes.data.data?.instructors || []);
        setSummaryStats(instructorStatsRes.data.data?.summary || {});
        setEvaluationForms(evaluationFormsRes?.data?.evaluationForms || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      // Show user-friendly error message
      if (error.response?.status === 401) {
        setMessage('Please login again. Your session may have expired.');
      } else if (error.response?.status === 403) {
        setMessage('Access denied. This feature may be disabled. Check Access Control settings.');
      } else {
        setMessage(error.response?.data?.message || 'Error fetching data. Please try again.');
      }
      // Set empty arrays on error to prevent UI issues
      setInstructors([]);
      setStats({});
    } finally {
      setLoading(false);
    }
  };

  const fetchSheetsSummary = async () => {
    setSheetsLoading(true);
    try {
      const response = await axios.get('http://localhost:5000/api/evaluations/summary');
      if (response.data.success) {
        setSheetsSummary(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching Google Sheets summary:', error);
      setMessage(error.response?.data?.message || 'Error fetching evaluation summaries from Google Sheets');
    } finally {
      setSheetsLoading(false);
    }
  };

  const fetchOverallSummary = async (formId = null) => {
    setOverallSummaryLoading(true);
    try {
      const url = formId
        ? `http://localhost:5000/api/stats/form/${formId}`
        : 'http://localhost:5000/api/evaluations/overall-summary';
      const response = await axios.get(url);
      if (response.data.success) {
        setOverallSummary(response.data.data);
      }
    } catch (error) {
      console.error('Error fetching overall summary:', error);
      setMessage(error.response?.data?.message || 'Error fetching overall summary from Google Sheets');
    } finally {
      setOverallSummaryLoading(false);
    }
  };

  const fetchEvaluationForms = async () => {
    setLoadingEvaluationForms(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.get('http://localhost:5000/api/evaluation-forms', { headers });
      const forms = response.data.evaluationForms || [];
      // Prefer forms that have a Google Form ID; those are the only ones that support per-form summary
      const googleForms = forms.filter(form => !!form.googleFormId);
      setAvailableForms(googleForms);
    } catch (error) {
      console.error('Error fetching evaluation forms:', error);
      setMessage('Error loading evaluation forms');
    } finally {
      setLoadingEvaluationForms(false);
    }
  };

  const handleFormChange = (formId) => {
    // Only Google Form IDs are supported for per-form summary
    setSelectedFormId(formId);
    fetchOverallSummary(formId || null);
  };

  const handleAddInstructor = async (e) => {
    e.preventDefault();
    setMessage('');

    const cleanedDepartment = newInstructor.department?.trim();
    if (!cleanedDepartment) {
      setMessage('Please select a department or add a new one.');
      return;
    }

    if (addingInstructor) {
      return;
    }

    setAddingInstructor(true);

    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post('http://localhost:5000/api/instructors', { 
        name: newInstructor.name.trim(), 
        email: newInstructor.email.trim(),
        department: cleanedDepartment
      }, { headers });
      setNewInstructor({ name: '', department: '', email: '' });
      setShowAddForm(false);
      setMessage('Instructor added successfully! Login credentials sent to the provided email.');
      fetchData(); // Refresh the list
    } catch (error) {
      setMessage(error.response?.data?.message || 'Error adding instructor');
    } finally {
      setAddingInstructor(false);
    }
  };

  const handleAddDepartment = async (e) => {
    e.preventDefault();
    if (savingDepartment) {
      return;
    }

    const trimmedName = newDepartmentName.trim();
    if (!trimmedName) {
      setDepartmentError('Department name is required');
      return;
    }

    setDepartmentError('');
    setSavingDepartment(true);

    try {
      const response = await axios.post('http://localhost:5000/api/departments', { name: trimmedName });
      await fetchDepartments();
      setShowAddDepartmentModal(false);
      setNewDepartmentName('');
      setNewInstructor((prev) => ({ ...prev, department: response.data?.department?.name || trimmedName }));
      setMessage(response.data?.message || 'Department added successfully');
    } catch (error) {
      setDepartmentError(error.response?.data?.message || 'Error adding department');
    } finally {
      setSavingDepartment(false);
    }
  };

  const closeAddDepartmentModal = () => {
    if (savingDepartment) {
      return;
    }
    setShowAddDepartmentModal(false);
    setDepartmentError('');
    setNewDepartmentName('');
  };

  const handleArchiveToggle = async (instructor, archive) => {
    try {
      setMessage('');
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.patch(
        `http://localhost:5000/api/dean/archive-instructor/${instructor._id}`,
        { isArchived: archive },
        { headers }
      );
      setMessage(response.data.message || (archive ? 'Instructor archived successfully' : 'Instructor restored successfully'));
      fetchData();
    } catch (error) {
      console.error('Archive error:', error);
      setMessage(error.response?.data?.message || 'Error updating instructor');
    }
  };

  const handleEditClick = async (instructor) => {
    try {
      setEditMenuOpen(null);
      // Fetch departments if not already loaded
      if (departments.length === 0) {
        await fetchDepartments();
      }
      // Fetch the latest version of the instructor
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.get(
        `http://localhost:5000/api/instructors/${instructor._id}`,
        { headers }
      );
      
      const latestInstructor = response.data.instructor;
      setEditingInstructor(latestInstructor);
      setEditFormData({
        name: latestInstructor.name || '',
        email: latestInstructor.email || '',
        department: latestInstructor.department || '',
        version: latestInstructor.version || 0
      });
      setEditConflictDetails(null);
      setShowEditModal(true);
    } catch (error) {
      console.error('Error fetching instructor:', error);
      setMessage(error.response?.data?.message || 'Error loading instructor details');
    }
  };

  const handleSaveInstructor = async (e) => {
    e.preventDefault();
    if (savingInstructor) return;

    try {
      setSavingInstructor(true);
      setMessage('');
      setEditConflictDetails(null);

      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const updateData = {
        name: editFormData.name.trim(),
        email: editFormData.email.trim(),
        department: editFormData.department.trim(),
        version: editFormData.version // Include version for MVCC
      };

      const response = await axios.put(
        `http://localhost:5000/api/instructors/${editingInstructor._id}`,
        updateData,
        { headers }
      );

      setMessage('Instructor updated successfully');
      setShowEditModal(false);
      setEditingInstructor(null);
      setEditFormData({ name: '', email: '', department: '', version: 0 });
      fetchData(); // Refresh the list
    } catch (error) {
      console.error('Error updating instructor:', error);
      
      // Handle MVCC version conflict
      if (error.response?.status === 409 && error.response?.data?.error === 'INSTRUCTOR_VERSION_CONFLICT') {
        const conflict = error.response.data.conflict;
        setEditConflictDetails({
          currentVersion: conflict.currentVersion,
          attemptedVersion: conflict.attemptedVersion,
          message: 'This instructor was modified by someone else. Please refresh and try again.'
        });
        setMessage('⚠️ Version conflict: The instructor was updated by another user. Please refresh the data.');
      } else {
        setMessage(error.response?.data?.message || 'Error updating instructor');
      }
    } finally {
      setSavingInstructor(false);
    }
  };

  const handleCloseEditModal = () => {
    if (savingInstructor) return;
    setShowEditModal(false);
    setEditingInstructor(null);
    setEditFormData({ name: '', email: '', department: '', version: 0 });
    setEditConflictDetails(null);
  };

  const handleRefreshInstructor = async () => {
    if (!editingInstructor) return;
    
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.get(
        `http://localhost:5000/api/instructors/${editingInstructor._id}`,
        { headers }
      );
      
      const latestInstructor = response.data.instructor;
      setEditingInstructor(latestInstructor);
      setEditFormData({
        name: latestInstructor.name || '',
        email: latestInstructor.email || '',
        department: latestInstructor.department || '',
        version: latestInstructor.version || 0
      });
      setEditConflictDetails(null);
      setMessage('Instructor data refreshed');
    } catch (error) {
      console.error('Error refreshing instructor:', error);
      setMessage(error.response?.data?.message || 'Error refreshing instructor data');
    }
  };

  const handleDeleteClick = (instructor) => {
    // Deprecated: replaced by archive
    setOpenDropdown(null);
  };

  const confirmDelete = async () => {};

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setInstructorToDelete(null);
  };

  const toggleDropdown = (instructorId) => {
    setOpenDropdown(openDropdown === instructorId ? null : instructorId);
  };

  // Evaluation Form Management Functions
  const addQuestion = () => {
    const newQuestion = {
      questionText: '',
      questionType: 'rating',
      ratingScale: {
        min: 0,
        max: 5,
        labels: {
          min: 'Poor',
          max: 'Excellent'
        }
      },
      required: true,
      order: newEvaluationForm.questions.length + 1
    };
    setNewEvaluationForm({
      ...newEvaluationForm,
      questions: [...newEvaluationForm.questions, newQuestion]
    });
  };

  const updateQuestion = (index, field, value) => {
    const updatedQuestions = [...newEvaluationForm.questions];
    if (field.includes('.')) {
      const parts = field.split('.');
      let target = updatedQuestions[index];
      for (let i = 0; i < parts.length - 1; i++) {
        target = target[parts[i]];
      }
      target[parts[parts.length - 1]] = value;
    } else {
      updatedQuestions[index][field] = value;
    }
    setNewEvaluationForm({
      ...newEvaluationForm,
      questions: updatedQuestions
    });
  };

  const removeQuestion = (index) => {
    const updatedQuestions = newEvaluationForm.questions.filter((_, i) => i !== index);
    // Update order numbers
    updatedQuestions.forEach((question, i) => {
      question.order = i + 1;
    });
    setNewEvaluationForm({
      ...newEvaluationForm,
      questions: updatedQuestions
    });
  };

  const handleCreateEvaluationForm = async (e) => {
    e.preventDefault();
    setMessage('');
    setCreatedFormGoogleLink(null);

    if (!newEvaluationForm.title || newEvaluationForm.questions.length === 0) {
      setMessage('Title and at least one question are required');
      return;
    }

    // Validate questions
    for (let i = 0; i < newEvaluationForm.questions.length; i++) {
      const question = newEvaluationForm.questions[i];
      if (!question.questionText.trim()) {
        setMessage(`Question ${i + 1} text is required`);
        return;
      }
    }

    try {
      const token = localStorage.getItem('token');
      const userId = token ? token.split('_')[1] : null;
      
      const formData = {
        ...newEvaluationForm,
        createdBy: userId
      };

      // First, create the evaluation form in the database
      const createResponse = await axios.post('http://localhost:5000/api/evaluation-forms', formData);
      const createdFormId = createResponse.data.evaluationForm._id;

      // If user wants to create a Google Form, create it and link it
      if (createGoogleForm) {
        try {
          const googleFormResponse = await axios.post(
            'http://localhost:5000/api/google-forms/create',
            {
              title: newEvaluationForm.title,
              description: newEvaluationForm.description || 'Official evaluation form created by the Dean.',
              createdBy: userId
            }
          );

          // The Google Form creation endpoint creates a new EvaluationForm, but we already have one
          // So we'll delete the duplicate and update our original form with the Google Form link
          if (googleFormResponse.data.evaluationForm?.googleFormLink) {
            const googleFormData = googleFormResponse.data.evaluationForm;
            const duplicateFormId = googleFormData._id;
            
            // Delete the duplicate EvaluationForm created by Google Form creation
            if (duplicateFormId && duplicateFormId !== createdFormId) {
              try {
                await axios.delete(`http://localhost:5000/api/evaluation-forms/${duplicateFormId}`);
              } catch (deleteError) {
                console.warn('Could not delete duplicate form:', deleteError);
                // Continue anyway
              }
            }

            // Update our original evaluation form with Google Form link
            await axios.put(
              `http://localhost:5000/api/evaluation-forms/${createdFormId}`,
              {
                googleFormId: googleFormData.googleFormId,
                googleFormLink: googleFormData.googleFormLink,
                googleResponderLink: googleFormData.googleResponderLink
              }
            );
            setMessage('✅ Evaluation form created successfully! Google Form has been created and linked.');
            // Clear the createdFormGoogleLink state since buttons will be in the card
            setCreatedFormGoogleLink(null);
          } else {
            setMessage('✅ Evaluation form created successfully! However, Google Form creation failed.');
          }
        } catch (googleError) {
          console.error('Error creating Google Form:', googleError);
          setMessage('⚠️ Evaluation form created in database, but Google Form creation failed: ' + (googleError.response?.data?.message || googleError.message));
        }
      } else {
        setMessage('✅ Evaluation form created successfully!');
      }

      setNewEvaluationForm({ title: '', description: '', questions: [] });
      setCreateGoogleForm(true); // Reset to default
      setShowCreateForm(false);
      // Refresh the list to show the updated form with Google Form link
      await fetchData();
    } catch (error) {
      setMessage('❌ ' + (error.response?.data?.message || 'Error creating evaluation form'));
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

  const getPerformanceColor = (grade) => {
    switch (grade) {
      case 'Excellent': return '#28a745';
      case 'Very Good': return '#20c997';
      case 'Good': return '#17a2b8';
      case 'Satisfactory': return '#ffc107';
      case 'Needs Improvement': return '#fd7e14';
      case 'Poor': return '#dc3545';
      case 'No Evaluations': return '#6c757d';
      default: return '#6c757d';
    }
  };

  const getSelectedInstructorForPrint = () => {
    if (!overallSummary?.instructors) {
      return null;
    }
    return overallSummary.instructors.find(
      (instructor) => getInstructorKey(instructor) === printInstructorKey
    ) || null;
  };

  const buildPrintPayload = (instructor, individualResponses = []) => {
    if (!instructor) return null;
    const selectedFormDefinition = selectedFormId
      ? availableForms.find((form) => form.googleFormId === selectedFormId)
      : null;
    return buildInstructorPrintPayload({
      instructor,
      summary: overallSummary,
      formDefinition: selectedFormDefinition,
      individualResponses,
    });
  };

  const departmentOptions = useMemo(() => {
    if (!overallSummary?.instructors) {
      return [];
    }
    const unique = new Set();
    overallSummary.instructors.forEach((instructor) => {
      const name = (instructor.department || '').trim() || 'Unspecified Department';
      unique.add(name);
    });
    return Array.from(unique);
  }, [overallSummary?.instructors]);

  useEffect(() => {
    if (!departmentOptions.length) {
      if (selectedDepartmentForPrint) {
        setSelectedDepartmentForPrint('');
      }
      return;
    }
    if (!selectedDepartmentForPrint || !departmentOptions.includes(selectedDepartmentForPrint)) {
      setSelectedDepartmentForPrint(departmentOptions[0]);
    }
  }, [departmentOptions, selectedDepartmentForPrint]);

  const handleOpenPrintReport = async () => {
    const instructor = getSelectedInstructorForPrint();
    if (!instructor) {
      setMessage('Please select an instructor to print.');
      return;
    }
    
    if (!selectedFormId) {
      setMessage('Please select an evaluation form to print the report.');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const instructorEmail = instructor.instructorEmail || instructor.email || '';

      if (!instructorEmail) {
        setMessage('Unable to determine instructor email.');
        return;
      }

      const response = await axios.post(
        'http://localhost:5000/api/reports/instructor-evaluation',
        { formId: selectedFormId, email: instructorEmail },
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        }
      );

      const blob = new Blob([response.data], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      // Try to open in a new tab for preview, like other PDFs
      const popup = window.open(blobUrl);

      if (!popup) {
        // Fallback to direct download if pop‑ups are blocked
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = 'instructor-performance-report.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      // Clean up the object URL after a short delay
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);

      setMessage('Instructor performance PDF generated.');
    } catch (error) {
      console.error('Failed to generate instructor PDF report:', error);
      setMessage(error.response?.data?.message || 'Unable to generate the instructor PDF. Please try again.');
    }
  };

  const handlePrintDepartmentReport = async () => {
    if (!overallSummary?.instructors?.length) {
      setMessage('No instructor data available to print.');
      return;
    }
    if (!selectedDepartmentForPrint) {
      setMessage('Please select a department to print.');
      return;
    }
    try {
      setPrintingDepartmentReport(true);
      const departmentMap = new Map();
      overallSummary.instructors.forEach((instructor) => {
        const departmentName = (instructor.department || '').trim() || 'Unspecified Department';
        const totalAverage =
          typeof instructor.totalAverage === 'number'
            ? instructor.totalAverage
            : instructor.categoryBreakdown?.totalAverage;
        const ratingEquivalent =
          instructor.descriptiveRating ||
          instructor.categoryBreakdown?.descriptiveRating ||
          describeScore(totalAverage);
        const reclassification =
          typeof instructor.facultyReclassificationScore === 'number'
            ? instructor.facultyReclassificationScore
            : instructor.categoryBreakdown?.facultyReclassificationScore ??
              (Number.isFinite(totalAverage) ? Math.round(((totalAverage || 0) / 5) * 100) : null);

        if (!departmentMap.has(departmentName)) {
          departmentMap.set(departmentName, []);
        }
        departmentMap.get(departmentName).push({
          name: instructor.instructorName || 'Unknown Instructor',
          totalAverage,
          ratingEquivalent,
          reclassification,
        });
      });

      const departments = Array.from(departmentMap.entries())
        .filter(([name]) => name === selectedDepartmentForPrint)
        .map(([name, instructors]) => ({
          name,
          instructors,
        }));

      if (!departments.length) {
        setMessage('No department data available to print.');
        return;
      }

      await generateDepartmentPerformancePdf({
        formTitle: overallSummary?.formTitle || 'Evaluation Form',
        generatedAt: new Date().toLocaleString(),
        departments,
      });
      setMessage('Department performance PDF generated.');
    } catch (error) {
      console.error('Failed to generate department performance PDF:', error);
      setMessage(error.response?.data?.message || 'Unable to generate the department PDF. Please try again.');
    } finally {
      setPrintingDepartmentReport(false);
    }
  };

  const handlePrintFormSummary = async () => {
    if (!selectedFormId) {
      setMessage('Please select an evaluation form to print the per-college report.');
      return;
    }
    if (!overallSummary?.instructors?.length) {
      setMessage('No instructor data available for the selected evaluation form.');
      return;
    }
    try {
      setPrintingFormReport(true);
      console.log('[Per College Report] Processing instructors:', overallSummary.instructors.length);
      console.log('[Per College Report] Sample instructors:', overallSummary.instructors.slice(0, 5).map(i => ({
        name: i.instructorName,
        email: i.instructorEmail,
        department: i.department,
        totalAverage: i.totalAverage
      })));
      const departmentMap = new Map();
      overallSummary.instructors.forEach((instructor) => {
        const departmentName = (instructor.department || '').trim() || 'Unspecified Department';
        const totalAverage =
          typeof instructor.totalAverage === 'number'
            ? instructor.totalAverage
            : instructor.categoryBreakdown?.totalAverage;
        const ratingEquivalent =
          instructor.descriptiveRating ||
          instructor.categoryBreakdown?.descriptiveRating ||
          describeScore(totalAverage);
        const reclassification =
          typeof instructor.facultyReclassificationScore === 'number'
            ? instructor.facultyReclassificationScore
            : instructor.categoryBreakdown?.facultyReclassificationScore ??
              (Number.isFinite(totalAverage) ? Math.round(((totalAverage || 0) / 5) * 100) : null);

        if (!departmentMap.has(departmentName)) {
          departmentMap.set(departmentName, []);
        }
        departmentMap.get(departmentName).push({
          name: instructor.instructorName || 'Unknown Instructor',
          totalAverage,
          ratingEquivalent,
          reclassification,
        });
      });

    const departments = Array.from(departmentMap.entries()).map(([name, instructors]) => ({
      name,
      instructors,
    }));

    console.log('[Per College Report] Grouped into departments:', departments.length);
    departments.forEach(dept => {
      console.log(`[Per College Report] Department "${dept.name}": ${dept.instructors.length} instructors`);
      dept.instructors.forEach(inst => {
        console.log(`  - ${inst.name} (${inst.totalAverage || 'N/A'})`);
      });
    });

    if (!departments.length) {
      setMessage('No department data available to print.');
      return;
    }

      await generateDepartmentPerformancePdf({
        formTitle: overallSummary?.formTitle || 'Evaluation Form',
        generatedAt: new Date().toLocaleString(),
        departments,
      });
      setMessage('Per-college performance PDF generated.');
    } catch (error) {
      console.error('Failed to generate per-college performance PDF:', error);
      setMessage('Unable to generate the per-college report PDF. Please try again.');
    } finally {
      setPrintingFormReport(false);
    }
  };

  const renderInstructorStatistics = () => {
    return (
      <div style={styles.tabContent}>
        <div style={styles.statsHeader}>
          <div style={styles.filtersPanel}>
            <div style={styles.filtersHeaderRow}>
              <div>
                <h3 style={{ margin: 0 }}>Instructor Performance Overview</h3>
                <p style={styles.filterHint}>
                  Use the filters below to refresh data or generate printable reports.
                </p>
              </div>
            </div>
            <div style={styles.filtersGrid}>
              <div style={styles.filterCard}>
                <label style={styles.filterLabel}>Evaluation Form</label>
                {loadingEvaluationForms ? (
                  <select style={{ ...styles.input, minWidth: '200px' }} disabled>
                    <option>Loading forms...</option>
                  </select>
                ) : (
                  <select
                    value={selectedFormId}
                    onChange={(e) => handleFormChange(e.target.value)}
                    style={{ ...styles.input, minWidth: '200px', cursor: 'pointer' }}
                  >
                    <option value="">All Forms</option>
                    {availableForms.map((form) => (
                      <option key={form._id} value={form.googleFormId}>
                        {form.title} {form.googleFormId ? '' : '(no Google ID)'}
                      </option>
                    ))}
                  </select>
                )}
                <div style={styles.filterActions}>
                  <button
                    style={{
                      ...styles.filterButton,
                      ...(overallSummaryLoading ? styles.filterButtonDisabled : {}),
                    }}
                    onClick={() => fetchOverallSummary(selectedFormId || null)}
                    disabled={overallSummaryLoading}
                  >
                    {overallSummaryLoading ? 'Loading…' : 'Refresh Data'}
                  </button>
                  <button
                    style={{
                      ...styles.filterButton,
                      ...styles.filterButtonPrimary,
                      ...((!selectedFormId || printingFormReport) ? styles.filterButtonDisabled : {}),
                    }}
                    onClick={handlePrintFormSummary}
                    disabled={!selectedFormId || printingFormReport}
                  >
                    {printingFormReport ? 'Printing…' : 'Per College Report'}
                  </button>
                </div>
              </div>

              <div style={styles.filterCard}>
                <label style={styles.filterLabel}>Department Report</label>
                {departmentOptions.length > 0 ? (
                  <select
                    value={selectedDepartmentForPrint}
                    onChange={(e) => setSelectedDepartmentForPrint(e.target.value)}
                    style={{ ...styles.input, minWidth: '200px', cursor: 'pointer' }}
                  >
                    {departmentOptions.map((department) => (
                      <option key={department} value={department}>
                        {department}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={styles.filterHint}>No department data available.</p>
                )}
                <div style={styles.filterActions}>
                  <button
                    style={{
                      ...styles.filterButton,
                      ...styles.filterButtonPrimary,
                      ...(
                        !overallSummary?.instructors?.length ||
                        !selectedDepartmentForPrint ||
                        printingDepartmentReport
                          ? styles.filterButtonDisabled
                          : {}
                      ),
                    }}
                    onClick={handlePrintDepartmentReport}
                    disabled={
                      !overallSummary?.instructors?.length ||
                      !selectedDepartmentForPrint ||
                      printingDepartmentReport
                    }
                  >
                    {printingDepartmentReport ? 'Printing…' : 'Department Report'}
                  </button>
                </div>
              </div>

              <div style={styles.filterCard}>
                <label style={styles.filterLabel}>Print Instructor</label>
                {overallSummary?.instructors?.length ? (
                  <select
                    value={printInstructorKey}
                    onChange={(e) => setPrintInstructorKey(e.target.value)}
                    style={{ ...styles.input, minWidth: '220px', cursor: 'pointer' }}
                  >
                    {overallSummary.instructors.map((instructor) => (
                      <option key={getInstructorKey(instructor)} value={getInstructorKey(instructor)}>
                        {(instructor.instructorName || 'Unknown Instructor')} ({instructor.totalResponses || 0} responses)
                      </option>
                    ))}
                  </select>
                ) : (
                  <p style={styles.filterHint}>Select a form to load instructors.</p>
                )}
                <div style={styles.filterActions}>
                  <button
                    style={{
                      ...styles.filterButton,
                      ...styles.filterButtonPrimary,
                    }}
                    onClick={handleOpenPrintReport}
                    // Keep handler-level checks instead of disabling the button,
                    // so the Dean sees feedback messages instead of a dead button.
                    disabled={false}
                  >
                    Instructor Report
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {overallSummaryLoading ? (
          <div style={styles.loading}>Loading evaluation summary from Google Sheets...</div>
        ) : !overallSummary ? (
          <div style={styles.empty}>
            No evaluation data found in Google Sheets. Make sure evaluations have been submitted and the spreadsheet is properly configured.
          </div>
        ) : (
            <div>
              {/* Overall Summary Cards */}
              <div style={styles.summaryCards}>
                <div style={styles.summaryCard}>
                  <h4>Total Responses</h4>
                  <p style={styles.summaryNumber}>{overallSummary.totalResponses || 0}</p>
                </div>
                <div style={styles.summaryCard}>
                  <h4>Total Instructors</h4>
                  <p style={styles.summaryNumber}>{overallSummary.totalInstructors || 0}</p>
                </div>
              </div>

              {/* Questions and Answers Summary - Grouped by Instructor */}
              {overallSummary.instructors && overallSummary.instructors.length > 0 && (
                <div style={{ marginTop: '30px' }}>
                  <h4 style={{ marginBottom: '20px', color: '#333' }}>Questions and Answers Summary (by Instructor)</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                    {overallSummary.instructors.map((instructor, instructorIndex) => (
                      <div key={instructorIndex} style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', border: '2px solid #667eea' }}>
                        <div style={{ marginBottom: '20px', paddingBottom: '15px', borderBottom: '2px solid #e9ecef' }}>
                          <h5 style={{ margin: '0 0 5px 0', color: '#667eea', fontSize: '18px', fontWeight: 'bold' }}>
                            {instructor.instructorName || 'Unknown Instructor'}
                          </h5>
                          {instructor.instructorEmail && (
                            <p style={{ margin: '0', fontSize: '14px', color: '#666' }}>
                              {instructor.instructorEmail}
                            </p>
                          )}
                          <p style={{ margin: '5px 0 0 0', fontSize: '14px', color: '#666' }}>
                            <strong>Total Responses:</strong> {instructor.totalResponses || 0}
                          </p>
                        </div>
                        
                        {instructor.questions && instructor.questions.length > 0 ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            {instructor.questions.map((q, questionIndex) => (
                              <div key={questionIndex} style={{ padding: '15px', background: '#f8f9fa', borderRadius: '6px', border: '1px solid #e9ecef' }}>
                                <h6 style={{ margin: '0 0 12px 0', color: '#333', fontSize: '15px', fontWeight: '600' }}>
                                  {q.question}
                                </h6>
                                <div style={{ display: 'flex', gap: '15px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '13px', color: '#666' }}>
                                    <strong>Total Answers:</strong> {q.totalAnswers}
                                  </span>
                                  {q.stats.numericCount > 0 && (
                                    <>
                                      <span style={{ fontSize: '13px', color: '#666' }}>
                                        <strong>Average:</strong> {q.stats.average}
                                      </span>
                                      <span style={{ fontSize: '13px', color: '#666' }}>
                                        <strong>Range:</strong> {q.stats.min} - {q.stats.max}
                                      </span>
                                    </>
                                  )}
                                </div>
                                
                                {/* Show answers */}
                                {q.answers && q.answers.length > 0 && (
                                  <div>
                                    <h6 style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#333', fontWeight: '500' }}>Sample Answers:</h6>
                                    <div style={{ 
                                      display: 'flex', 
                                      flexWrap: 'wrap', 
                                      gap: '8px',
                                      maxHeight: '200px',
                                      overflowY: 'auto',
                                      padding: '10px',
                                      background: 'white',
                                      borderRadius: '6px',
                                      border: '1px solid #dee2e6'
                                    }}>
                                      {q.answers.slice(0, 20).map((answer, idx) => (
                                        <span 
                                          key={idx}
                                          style={{
                                            padding: '6px 12px',
                                            background: '#e7f3ff',
                                            borderRadius: '4px',
                                            fontSize: '12px',
                                            color: '#333',
                                            border: '1px solid #b3d9ff',
                                            display: 'inline-block'
                                          }}
                                        >
                                          {answer}
                                        </span>
                                      ))}
                                      {q.answers.length > 20 && (
                                        <span style={{ fontSize: '12px', color: '#666', padding: '6px 12px', alignSelf: 'center' }}>
                                          +{q.answers.length - 20} more answers
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p style={{ color: '#666', fontSize: '14px', fontStyle: 'italic' }}>
                            No questions found for this instructor.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Average Ratings Table (if available) */}
              {overallSummary.avgRatings && Object.values(overallSummary.avgRatings).some(v => v > 0) && (
                <div style={{ marginTop: '30px', background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                  <h4 style={{ marginBottom: '15px', color: '#333' }}>Average Ratings by Category</h4>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.tableHeader}>Category</th>
                        <th style={styles.tableHeader}>Average Rating</th>
                      </tr>
                    </thead>
                    <tbody>
                      {overallSummary.avgRatings.teachingEffectiveness > 0 && (
                        <tr>
                          <td style={styles.tableCell}>Teaching Effectiveness</td>
                          <td style={styles.tableCell}>{overallSummary.avgRatings.teachingEffectiveness}/5</td>
                        </tr>
                      )}
                      {overallSummary.avgRatings.communicationSkills > 0 && (
                        <tr>
                          <td style={styles.tableCell}>Communication Skills</td>
                          <td style={styles.tableCell}>{overallSummary.avgRatings.communicationSkills}/5</td>
                        </tr>
                      )}
                      {overallSummary.avgRatings.subjectKnowledge > 0 && (
                        <tr>
                          <td style={styles.tableCell}>Subject Knowledge</td>
                          <td style={styles.tableCell}>{overallSummary.avgRatings.subjectKnowledge}/5</td>
                        </tr>
                      )}
                      {overallSummary.avgRatings.punctuality > 0 && (
                        <tr>
                          <td style={styles.tableCell}>Punctuality</td>
                          <td style={styles.tableCell}>{overallSummary.avgRatings.punctuality}/5</td>
                        </tr>
                      )}
                      {overallSummary.avgRatings.availability > 0 && (
                        <tr>
                          <td style={styles.tableCell}>Availability</td>
                          <td style={styles.tableCell}>{overallSummary.avgRatings.availability}/5</td>
                        </tr>
                      )}
                      {overallSummary.avgRatings.overallRating > 0 && (
                        <tr>
                          <td style={styles.tableCell}><strong>Overall Rating</strong></td>
                          <td style={styles.tableCell}><strong>{overallSummary.avgRatings.overallRating}/5</strong></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
      </div>
    );
  };

  // Fetch sections for selected instructor
  const fetchInstructorSections = async (instructorId) => {
    if (!instructorId) {
      setInstructorSections([]);
      setSelectedSectionId('');
      setSectionStudents([]);
      return;
    }

    setLoadingSections(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.get(`http://localhost:5000/api/dean/instructors/${instructorId}/sections`, { headers });
      setInstructorSections(response.data.sections || []);
      setSelectedSectionId(''); // Reset section selection
      setSectionStudents([]); // Clear students
    } catch (error) {
      console.error('Error fetching sections:', error);
      setMessage(error.response?.data?.message || 'Error fetching sections');
      setInstructorSections([]);
    } finally {
      setLoadingSections(false);
    }
  };

  // Fetch students for selected section
  const fetchSectionStudents = async (sectionId) => {
    if (!sectionId) {
      setSectionStudents([]);
      return;
    }

    setLoadingStudents(true);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.get(`http://localhost:5000/api/dean/sections/${sectionId}/students`, { headers });
      setSectionStudents(response.data.students || []);
    } catch (error) {
      console.error('Error fetching students:', error);
      setMessage(error.response?.data?.message || 'Error fetching students');
      setSectionStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  };

  // Fetch available evaluation forms for sending
  const fetchAvailableForms = async () => {
    try {
      setLoadingAvailableForms(true);
      const response = await axios.get('http://localhost:5000/api/evaluation-forms');
      const forms = response.data.evaluationForms || [];
      
      // Filter to only show forms that have Google Form links
      const googleForms = forms.filter(form => form.googleFormId || form.googleFormLink);
      setAvailableForms(googleForms);
      
      if (googleForms.length === 0 && forms.length > 0) {
        setMessage('No Google Forms available. Please create forms via Google Forms API.');
      }
    } catch (error) {
      console.error('Error fetching available forms:', error);
      setMessage('Error loading evaluation forms');
    } finally {
      setLoadingAvailableForms(false);
    }
  };

  // Handle form selection - automatically set the link
  const handleFormSelectionForSend = (formId) => {
    setSelectedFormIdForSend(formId);
    const selectedForm = availableForms.find(f => f._id === formId);
    
    if (selectedForm) {
      // Prefer server-provided responder link if available
      if (selectedForm.googleResponderLink) {
        setEvaluationFormLink(selectedForm.googleResponderLink);
        return;
      }

      // If we have an edit link, convert /edit -> /viewform
      if (selectedForm.googleFormLink) {
        let link = selectedForm.googleFormLink;
        const editMatch = link.match(/\/forms\/d\/([a-zA-Z0-9_-]+)\/edit/);
        if (editMatch && editMatch[1]) {
          setEvaluationFormLink(`https://docs.google.com/forms/d/${editMatch[1]}/viewform`);
          return;
        }
        setEvaluationFormLink(link);
        return;
      }
    }
  };

  // Handle sending evaluation form based on mode
  const handleSendEvaluationForm = async () => {
    if (!evaluationFormLink.trim()) {
      setMessage('Please enter an evaluation form link.');
      return;
    }

    setSendingEmails(true);
    setMessage('');

    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      let response;
      const payload = { evaluationFormLink: evaluationFormLink.trim() };

      if (sendFormMode === 'all') {
        // Send to all students
        response = await axios.post('http://localhost:5000/api/dean/send-evaluation-form/all', payload, { headers });
      } else if (sendFormMode === 'instructor') {
        // Send to all students under selected instructor
        if (!selectedInstructorId) {
          setMessage('Please select an instructor first.');
          setSendingEmails(false);
          return;
        }
        response = await axios.post(
          `http://localhost:5000/api/dean/send-evaluation-form/instructor/${selectedInstructorId}`,
          payload,
          { headers }
        );
      } else if (sendFormMode === 'section') {
        // Send to specific section
        if (!selectedSectionId || selectedSectionId === 'ALL') {
          setMessage('Please select a specific section first.');
          setSendingEmails(false);
          return;
        }
        response = await axios.post(
          `http://localhost:5000/api/dean/send-evaluation-form/section/${selectedSectionId}`,
          payload,
          { headers }
        );
      } else {
        setMessage('Invalid send mode.');
        setSendingEmails(false);
        return;
      }

      // Show success message
      if (response.data.results.failed.length === 0) {
        setMessage(`✅ ${response.data.message}`);
      } else {
        // Some emails failed
        const failedEmails = response.data.results.failed.map(f => f.email).join(', ');
        setMessage(`⚠️ ${response.data.message} Failed to send to: ${failedEmails}`);
      }

      // Close modal and reset form
      setShowSendFormModal(false);
      setEvaluationFormLink('');
      setSelectedFormIdForSend('');
      setSendFormMode('');
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Error sending evaluation forms';
      if (error.response?.data?.results) {
        // Partial success - some emails sent, some failed
        const failedEmails = error.response.data.results.failed.map(f => f.email).join(', ');
        setMessage(`⚠️ ${error.response.data.message} Failed to send to: ${failedEmails}`);
        setShowSendFormModal(false);
        setEvaluationFormLink('');
        setSelectedFormIdForSend('');
        setSendFormMode('');
      } else {
        setMessage(`❌ ${errorMessage}`);
      }
    } finally {
      setSendingEmails(false);
    }
  };

  // Fetch all students for an instructor (across all sections)
  const fetchAllInstructorStudents = async (instructorId) => {
    if (!instructorId) {
      setSectionStudents([]);
      return;
    }

    setLoadingStudents(true);
    try {
      const response = await axios.get(`http://localhost:5000/api/dean/instructors/${instructorId}/students`);
      setSectionStudents(response.data.students || []);
    } catch (error) {
      console.error('Error fetching all students:', error);
      setMessage(error.response?.data?.message || 'Error fetching students');
      setSectionStudents([]);
    } finally {
      setLoadingStudents(false);
    }
  };

  // Handle instructor selection
  const handleInstructorChange = (instructorId) => {
    setSelectedInstructorId(instructorId);
    setSelectedSectionId(''); // Reset section selection
    setSectionStudents([]); // Clear students
    fetchInstructorSections(instructorId);
  };

  // Handle section selection
  const handleSectionChange = (sectionId) => {
    setSelectedSectionId(sectionId);
    
    // If "ALL" is selected, fetch all students for the instructor
    if (sectionId === 'ALL') {
      fetchAllInstructorStudents(selectedInstructorId);
    } else if (sectionId) {
      // Otherwise, fetch students for the specific section
      fetchSectionStudents(sectionId);
    } else {
      // Clear students if no section is selected
      setSectionStudents([]);
    }
  };

  const renderStats = () => (
    <div style={styles.tabContent}>
      {/* Header Section */}
      <div style={{ marginBottom: '30px', paddingBottom: '20px', borderBottom: '2px solid #e9ecef' }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#667eea', fontSize: '28px', fontWeight: 'bold' }}>
          📧 Send Evaluation
        </h3>
        <p style={{ margin: 0, fontSize: '16px', color: '#6c757d' }}>
          Send evaluation forms to students. Choose to send to all students, or filter by instructor and section.
        </p>
      </div>

      {/* Quick Send Option - Send to All Students */}
      <div style={{ 
        marginBottom: '30px', 
        padding: '25px', 
        backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        background: '#667eea',
        borderRadius: '12px', 
        border: 'none',
        boxShadow: '0 4px 15px rgba(102, 126, 234, 0.3)',
        color: 'white'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontSize: '24px', marginRight: '12px' }}>⚡</span>
          <h4 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>Quick Send to All Students</h4>
        </div>
        <p style={{ fontSize: '15px', margin: '0 0 20px 0', opacity: 0.95, lineHeight: '1.6' }}>
          Send the evaluation form to every student in the database (regardless of instructor or section).
        </p>
        <button
          onClick={() => {
            fetchAvailableForms();
            setSendFormMode('all');
            setShowSendFormModal(true);
          }}
          style={{ 
            padding: '12px 30px',
            backgroundColor: 'white',
            color: '#667eea',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            transition: 'all 0.3s ease'
          }}
          onMouseOver={(e) => {
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
          }}
          onMouseOut={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
          }}
        >
          📧 Send to All Students
        </button>
      </div>

      {/* Divider */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        margin: '35px 0',
        textAlign: 'center'
      }}>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#dee2e6' }}></div>
        <span style={{ 
          padding: '0 20px', 
          color: '#6c757d', 
          fontSize: '14px', 
          fontWeight: '500',
          backgroundColor: '#fff'
        }}>
          OR Filter by Instructor
        </span>
        <div style={{ flex: 1, height: '1px', backgroundColor: '#dee2e6' }}></div>
      </div>

      {/* Step-by-Step Flow */}
      <div style={{ marginBottom: '30px' }}>
        {/* Step 1: Select Instructor */}
        <div style={{ 
          marginBottom: '25px', 
          padding: '25px', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '12px',
          border: selectedInstructorId ? '2px solid #667eea' : '2px solid #e9ecef',
          transition: 'all 0.3s ease',
          boxShadow: selectedInstructorId ? '0 4px 12px rgba(102, 126, 234, 0.1)' : 'none'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: selectedInstructorId ? '#667eea' : '#dee2e6',
              color: selectedInstructorId ? 'white' : '#6c757d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '16px',
              marginRight: '15px'
            }}>
              1
            </div>
            <label style={{ 
              display: 'block', 
              margin: 0,
              fontWeight: '600', 
              fontSize: '18px',
              color: '#333'
            }}>
              Select Instructor
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <select
              value={selectedInstructorId}
              onChange={(e) => handleInstructorChange(e.target.value)}
              style={{ 
                ...styles.input, 
                maxWidth: '500px',
                padding: '12px 16px',
                fontSize: '15px',
                borderRadius: '8px',
                border: '2px solid #dee2e6',
                backgroundColor: 'white',
                flex: '1',
                minWidth: '300px'
              }}
            >
              <option value="">-- Choose an Instructor --</option>
              {instructors.filter(inst => !inst.isArchived).map((instructor) => (
                <option key={instructor._id} value={instructor._id}>
                  {instructor.name} ({instructor.email})
                </option>
              ))}
            </select>
            {selectedInstructorId && (
              <button
                type="button"
                onClick={() => handleInstructorChange('')}
                style={{ 
                  padding: '10px 20px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                ✕ Clear
              </button>
            )}
          </div>
          {selectedInstructorId && (
            <div style={{ 
              marginTop: '15px', 
              padding: '12px', 
              backgroundColor: '#e7f3ff', 
              borderRadius: '8px',
              border: '1px solid #b3d9ff'
            }}>
              <p style={{ margin: 0, fontSize: '14px', color: '#0066cc' }}>
                ✓ Selected: <strong>{instructors.find(i => i._id === selectedInstructorId)?.name || 'Instructor'}</strong>
              </p>
            </div>
          )}
        </div>

        {/* Step 2: Send to All Students of Instructor */}
        {selectedInstructorId && (
          <div style={{ 
            marginBottom: '25px', 
            padding: '20px', 
            backgroundColor: '#e3f2fd', 
            borderRadius: '12px', 
            border: '2px solid #90caf9',
            boxShadow: '0 2px 8px rgba(33, 150, 243, 0.15)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '20px', marginRight: '10px' }}>📬</span>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#1976d2' }}>
                Send to All Students of This Instructor
              </h4>
            </div>
            <p style={{ fontSize: '14px', color: '#555', margin: '0 0 15px 0', lineHeight: '1.5' }}>
              Send the evaluation form to all students under <strong>{instructors.find(i => i._id === selectedInstructorId)?.name || 'this instructor'}</strong> (across all sections).
            </p>
            <button
              onClick={() => {
                fetchAvailableForms();
                setSendFormMode('instructor');
                setShowSendFormModal(true);
              }}
              style={{ 
                padding: '10px 24px',
                backgroundColor: '#2196f3',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(33, 150, 243, 0.3)'
              }}
            >
              📧 Send to All Students
            </button>
          </div>
        )}

        {/* Step 3: Select Section */}
        {selectedInstructorId && (
          <div style={{ 
            marginBottom: '25px', 
            padding: '25px', 
            backgroundColor: '#f8f9fa', 
            borderRadius: '12px',
            border: selectedSectionId ? '2px solid #667eea' : '2px solid #e9ecef',
            boxShadow: selectedSectionId ? '0 4px 12px rgba(102, 126, 234, 0.1)' : 'none'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: selectedSectionId ? '#667eea' : '#dee2e6',
                color: selectedSectionId ? 'white' : '#6c757d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 'bold',
                fontSize: '16px',
                marginRight: '15px'
              }}>
                2
              </div>
              <label style={{ 
                display: 'block', 
                margin: 0,
                fontWeight: '600', 
                fontSize: '18px',
                color: '#333'
              }}>
                Select Section (Optional)
              </label>
            </div>
            {loadingSections ? (
              <div style={{ padding: '15px', textAlign: 'center' }}>
                <p style={{ color: '#666', margin: 0 }}>⏳ Loading sections...</p>
              </div>
            ) : instructorSections.length > 0 ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <select
                    value={selectedSectionId}
                    onChange={(e) => handleSectionChange(e.target.value)}
                    style={{ 
                      ...styles.input, 
                      maxWidth: '500px',
                      padding: '12px 16px',
                      fontSize: '15px',
                      borderRadius: '8px',
                      border: '2px solid #dee2e6',
                      backgroundColor: 'white',
                      flex: '1',
                      minWidth: '300px'
                    }}
                  >
                    <option value="">-- Choose a Section (Optional) --</option>
                    <option value="ALL">📋 View All Students</option>
                    {instructorSections.map((section) => (
                      <option key={section._id} value={section._id}>
                        {section.sectionCode} - {section.course} ({section.yearLevel}){section.subjectCode ? ` - ${section.subjectCode}` : ''}
                      </option>
                    ))}
                  </select>
                  {selectedSectionId && (
                    <button
                      type="button"
                      onClick={() => handleSectionChange('')}
                      style={{ 
                        padding: '10px 20px',
                        backgroundColor: '#dc3545',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      ✕ Clear
                    </button>
                  )}
                </div>
                {selectedSectionId && selectedSectionId !== 'ALL' && (
                  <div style={{ 
                    marginTop: '15px', 
                    padding: '12px', 
                    backgroundColor: '#fff3e0', 
                    borderRadius: '8px',
                    border: '1px solid #ffcc80'
                  }}>
                    <p style={{ margin: 0, fontSize: '14px', color: '#e65100' }}>
                      ✓ Selected Section: <strong>{instructorSections.find(s => s._id === selectedSectionId)?.sectionCode || 'Section'}</strong>
                    </p>
                  </div>
                )}
              </>
            ) : (
              <div style={{ padding: '15px', backgroundColor: '#fff3cd', borderRadius: '8px', border: '1px solid #ffc107' }}>
                <p style={{ margin: 0, color: '#856404', fontSize: '14px' }}>
                  ⚠️ No sections found for this instructor.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Send to Specific Section */}
        {selectedInstructorId && selectedSectionId && selectedSectionId !== 'ALL' && (
          <div style={{ 
            marginBottom: '25px', 
            padding: '20px', 
            backgroundColor: '#fff3e0', 
            borderRadius: '12px', 
            border: '2px solid #ffcc80',
            boxShadow: '0 2px 8px rgba(255, 152, 0, 0.15)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '20px', marginRight: '10px' }}>📮</span>
              <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#e65100' }}>
                Send to This Section Only
              </h4>
            </div>
            <p style={{ fontSize: '14px', color: '#555', margin: '0 0 15px 0', lineHeight: '1.5' }}>
              Send the evaluation form only to students in section <strong>{instructorSections.find(s => s._id === selectedSectionId)?.sectionCode || 'this section'}</strong>.
            </p>
            <button
              onClick={() => {
                fetchAvailableForms();
                setSendFormMode('section');
                setShowSendFormModal(true);
              }}
              style={{ 
                padding: '10px 24px',
                backgroundColor: '#ff9800',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(255, 152, 0, 0.3)'
              }}
            >
              📧 Send to Section
            </button>
          </div>
        )}
      </div>

      {/* Show message if no instructor or section selected */}
      {(!selectedInstructorId || !selectedSectionId) && (
        <div style={{ 
          padding: '50px 30px', 
          textAlign: 'center',
          backgroundColor: '#f8f9fa',
          borderRadius: '12px',
          border: '2px dashed #dee2e6',
          marginTop: '20px'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '15px' }}>
            {!selectedInstructorId ? '👤' : '📚'}
          </div>
          <p style={{ fontSize: '18px', color: '#6c757d', margin: 0, fontWeight: '500' }}>
            {!selectedInstructorId 
              ? 'Select an instructor above to view their sections and students'
              : 'Select a section code above to view students'}
          </p>
          <p style={{ fontSize: '14px', color: '#adb5bd', margin: '10px 0 0 0' }}>
            {!selectedInstructorId 
              ? 'You can then send evaluation forms to specific groups of students'
              : 'Or choose "View All Students" to see all students under this instructor'}
          </p>
        </div>
      )}

      {/* Students Table */}
      {selectedInstructorId && selectedSectionId && (
        <div style={{ marginTop: '30px' }}>
          {loadingStudents ? (
            <div style={{ 
              padding: '40px', 
              textAlign: 'center',
              backgroundColor: '#f8f9fa',
              borderRadius: '12px',
              border: '2px dashed #dee2e6'
            }}>
              <div style={{ fontSize: '36px', marginBottom: '15px' }}>⏳</div>
              <p style={{ fontSize: '16px', color: '#6c757d', margin: 0 }}>Loading students...</p>
            </div>
          ) : sectionStudents.length > 0 ? (
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
              overflow: 'hidden',
              border: '1px solid #e9ecef'
            }}>
              {/* Section Info Header */}
              {selectedSectionId !== 'ALL' && sectionStudents.length > 0 && sectionStudents[0].sectionId && (
                <div style={{
                  padding: '20px 25px',
                  backgroundColor: '#667eea',
                  color: 'white',
                  borderBottom: '2px solid #5568d3'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '24px', marginRight: '12px' }}>📚</span>
                    <h4 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
                      {sectionStudents[0].sectionId.sectionCode}
                    </h4>
                  </div>
                  <div style={{ 
                    fontSize: '14px', 
                    opacity: 0.95,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '15px'
                  }}>
                    <span><strong>Course:</strong> {sectionStudents[0].sectionId.course || '—'}</span>
                    <span><strong>Year Level:</strong> {sectionStudents[0].sectionId.yearLevel || '—'}</span>
                    <span><strong>Subject Code:</strong> {sectionStudents[0].subject || sectionStudents[0].sectionId?.subjectCode || '—'}</span>
                    <span><strong>Total Students:</strong> {sectionStudents.length}</span>
                  </div>
                </div>
              )}
              {/* Header for "View All Students" */}
              {selectedSectionId === 'ALL' && (
                <div style={{
                  padding: '20px 25px',
                  backgroundColor: '#667eea',
                  color: 'white',
                  borderBottom: '2px solid #5568d3'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
                    <span style={{ fontSize: '24px', marginRight: '12px' }}>👥</span>
                    <h4 style={{ margin: 0, fontSize: '20px', fontWeight: '600' }}>
                      All Students
                    </h4>
                  </div>
                  <div style={{ fontSize: '14px', opacity: 0.95 }}>
                    <span><strong>Total Students:</strong> {sectionStudents.length}</span>
                  </div>
                </div>
              )}
              
              {/* Table Container with Scroll */}
              <div style={{ 
                maxHeight: '500px',
                overflowY: 'auto',
                overflowX: 'auto'
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  backgroundColor: 'white'
                }}>
                  <thead style={{ 
                    backgroundColor: '#f8f9fa',
                    position: 'sticky',
                    top: 0,
                    zIndex: 10
                  }}>
                    <tr>
                      <th style={{
                        padding: '15px 20px',
                        textAlign: 'left',
                        fontWeight: '600',
                        fontSize: '14px',
                        color: '#495057',
                        borderBottom: '2px solid #dee2e6',
                        backgroundColor: '#f8f9fa'
                      }}>👤 Student Name</th>
                      <th style={{
                        padding: '15px 20px',
                        textAlign: 'left',
                        fontWeight: '600',
                        fontSize: '14px',
                        color: '#495057',
                        borderBottom: '2px solid #dee2e6',
                        backgroundColor: '#f8f9fa'
                      }}>📧 Email</th>
                      <th style={{
                        padding: '15px 20px',
                        textAlign: 'left',
                        fontWeight: '600',
                        fontSize: '14px',
                        color: '#495057',
                        borderBottom: '2px solid #dee2e6',
                        backgroundColor: '#f8f9fa'
                      }}>🎓 Course</th>
                      <th style={{
                        padding: '15px 20px',
                        textAlign: 'left',
                        fontWeight: '600',
                        fontSize: '14px',
                        color: '#495057',
                        borderBottom: '2px solid #dee2e6',
                        backgroundColor: '#f8f9fa'
                      }}>📅 Year Level</th>
                      <th style={{
                        padding: '15px 20px',
                        textAlign: 'left',
                        fontWeight: '600',
                        fontSize: '14px',
                        color: '#495057',
                        borderBottom: '2px solid #dee2e6',
                        backgroundColor: '#f8f9fa'
                      }}>📋 Section Code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionStudents.map((student, index) => {
                      const studentName = [student.firstName, student.lastName].filter(Boolean).join(' ') || student.email;
                      const sectionCode = student.sectionId?.sectionCode || student.section || '—';
                      return (
                        <tr 
                          key={student._id}
                          style={{
                            backgroundColor: index % 2 === 0 ? 'white' : '#f8f9fa',
                            transition: 'background-color 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = '#e7f3ff';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = index % 2 === 0 ? 'white' : '#f8f9fa';
                          }}
                        >
                          <td style={{
                            padding: '12px 20px',
                            fontSize: '14px',
                            color: '#333',
                            borderBottom: '1px solid #e9ecef'
                          }}>{studentName}</td>
                          <td style={{
                            padding: '12px 20px',
                            fontSize: '14px',
                            color: '#666',
                            borderBottom: '1px solid #e9ecef'
                          }}>{student.email || '—'}</td>
                          <td style={{
                            padding: '12px 20px',
                            fontSize: '14px',
                            color: '#666',
                            borderBottom: '1px solid #e9ecef'
                          }}>{student.course || '—'}</td>
                          <td style={{
                            padding: '12px 20px',
                            fontSize: '14px',
                            color: '#666',
                            borderBottom: '1px solid #e9ecef'
                          }}>{student.yearLevel || '—'}</td>
                          <td style={{
                            padding: '12px 20px',
                            fontSize: '14px',
                            color: '#666',
                            borderBottom: '1px solid #e9ecef'
                          }}>{sectionCode}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              
              {/* Footer with Count */}
              <div style={{
                padding: '15px 25px',
                backgroundColor: '#f8f9fa',
                borderTop: '2px solid #e9ecef',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ fontSize: '14px', color: '#6c757d', fontWeight: '500' }}>
                  <span style={{ fontSize: '18px', marginRight: '8px' }}>📊</span>
                  Total Students: <strong style={{ color: '#667eea' }}>{sectionStudents.length}</strong>
                </div>
                <div style={{ fontSize: '12px', color: '#adb5bd' }}>
                  Scroll to view all students
                </div>
              </div>
            </div>
          ) : (
            <div style={{ 
              padding: '50px 30px', 
              textAlign: 'center',
              backgroundColor: '#f8f9fa',
              borderRadius: '12px',
              border: '2px dashed #dee2e6'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '15px' }}>📭</div>
              <p style={{ fontSize: '18px', color: '#6c757d', margin: 0, fontWeight: '500' }}>
                No students found
              </p>
              <p style={{ fontSize: '14px', color: '#adb5bd', margin: '10px 0 0 0' }}>
                No students are assigned to this instructor or section.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Send Evaluation Form Modal */}
      {showSendFormModal && (
        <div style={styles.modalOverlay} onClick={() => !sendingEmails && setShowSendFormModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Send Evaluation Form</h3>
              <button
                style={styles.modalCloseButton}
                onClick={() => {
                  if (!sendingEmails) {
                    setShowSendFormModal(false);
                    setEvaluationFormLink('');
                    setSelectedFormIdForSend('');
                    setSendFormMode('');
                  }
                }}
                disabled={sendingEmails}
              >
                ×
              </button>
            </div>
            <div style={styles.modalBody}>
              <p style={styles.modalText}>
                {sendFormMode === 'all' && 'Send evaluation form to all students in the database.'}
                {sendFormMode === 'instructor' && `Send evaluation form to all students under ${instructors.find(i => i._id === selectedInstructorId)?.name || 'the selected instructor'}.`}
                {sendFormMode === 'section' && `Send evaluation form to students in section ${instructorSections.find(s => s._id === selectedSectionId)?.sectionCode || 'the selected section'}.`}
              </p>
              
              <div style={styles.formGroup}>
                <label>Select Evaluation Form *</label>
                {loadingAvailableForms ? (
                  <p style={{ fontSize: '14px', color: '#666', marginTop: '5px' }}>Loading forms...</p>
                ) : availableForms.length === 0 ? (
                  <p style={{ fontSize: '14px', color: '#dc3545', marginTop: '5px' }}>
                    No evaluation forms available. Please create forms first.
                  </p>
                ) : (
                  <>
                    <select
                      value={selectedFormIdForSend}
                      onChange={(e) => handleFormSelectionForSend(e.target.value)}
                      style={styles.input}
                      disabled={sendingEmails}
                      required
                    >
                      <option value="">Choose an evaluation form...</option>
                      {availableForms.map((form) => (
                        <option key={form._id} value={form._id}>
                          {form.title} {form.googleFormId ? `(Google Form ID: ${form.googleFormId})` : form.googleFormLink ? '(Google Form)' : ''}
                        </option>
                      ))}
                    </select>
                    {selectedFormIdForSend && evaluationFormLink && (
                      <div style={{ marginTop: '10px', padding: '10px', background: '#f8f9fa', borderRadius: '5px' }}>
                        <p style={{ fontSize: '12px', color: '#666', margin: '0 0 5px 0' }}>
                          <strong>Form Link:</strong>
                        </p>
                        <p style={{ fontSize: '12px', color: '#667eea', wordBreak: 'break-all', margin: 0 }}>
                          {evaluationFormLink}
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div style={styles.formGroup}>
                <label>Evaluation Form Link *</label>
                <input
                  type="url"
                  placeholder="Enter or paste the evaluation form link here"
                  value={evaluationFormLink}
                  onChange={(e) => setEvaluationFormLink(e.target.value)}
                  style={styles.input}
                  disabled={sendingEmails}
                  required
                />
                <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                  {selectedFormIdForSend 
                    ? 'The link above is auto-filled from the selected form. You can edit it if needed.'
                    : 'Enter the Google Form link or evaluation form URL to send to students.'}
                </p>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button
                style={styles.cancelButton}
                onClick={() => {
                  setShowSendFormModal(false);
                  setEvaluationFormLink('');
                  setSelectedFormIdForSend('');
                  setSendFormMode('');
                }}
                disabled={sendingEmails}
              >
                Cancel
              </button>
              <button
                style={styles.sendFormConfirmButton}
                onClick={handleSendEvaluationForm}
                disabled={sendingEmails || !selectedFormIdForSend || !evaluationFormLink.trim()}
              >
                {sendingEmails ? 'Sending...' : 
                  sendFormMode === 'all' ? 'Send to All Students' :
                  sendFormMode === 'instructor' ? 'Send to All Students of This Instructor' :
                  'Send to This Section Only'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderInstructors = () => {
    const query = instructorSearch.trim().toLowerCase();
    const filteredInstructors = instructors.filter((instructor) => {
      if (!query) return true;
      const fields = [
        instructor.name || '',
        instructor.email || '',
        instructor.department || '',
      ];
      return fields.some((field) => field.toLowerCase().includes(query));
    });

    return (
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

      <div style={{ display: 'flex', gap: '8px', margin: '10px 0' }}>
        <button
          style={{
            ...styles.tab,
            ...(instructorsView === 'active' ? styles.activeTab : {}),
            minWidth: 'auto'
          }}
          onClick={() => { setInstructorsView('active'); fetchData('active'); }}
        >
          Active Instructors
        </button>
        <button
          style={{
            ...styles.tab,
            ...(instructorsView === 'archived' ? styles.activeTab : {}),
            minWidth: 'auto'
          }}
          onClick={() => { setInstructorsView('archived'); fetchData('archived'); }}
        >
          Archived Instructors
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleAddInstructor} style={styles.form}>
          <div style={styles.formRow}>
            <input
              type="text"
              placeholder="Instructor Name"
              value={newInstructor.name}
              onChange={(e) => setNewInstructor({...newInstructor, name: e.target.value})}
              style={styles.input}
              disabled={addingInstructor}
              required
            />
          </div>
          <div style={styles.formRow}>
            <div style={styles.departmentFieldGroup}>
              <select
                value={newInstructor.department}
                onChange={(e) => setNewInstructor({ ...newInstructor, department: e.target.value })}
                style={styles.input}
                disabled={loadingDepartments || departments.length === 0 || addingInstructor}
                required={departments.length > 0}
              >
                <option value="">Select department...</option>
                {departments.map((dept) => (
                  <option key={dept._id} value={dept.name}>
                    {dept.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                style={styles.addDepartmentButton}
                onClick={() => {
                  setDepartmentError('');
                  setNewDepartmentName('');
                  setShowAddDepartmentModal(true);
                }}
                disabled={savingDepartment}
              >
                + Add Department
              </button>
            </div>
          </div>
          <div>
            {loadingDepartments ? (
              <p style={styles.helperText}>Loading departments...</p>
            ) : departments.length === 0 ? (
              <p style={styles.helperText}>
                No departments found. Please add one to proceed.
              </p>
            ) : null}
          </div>
          <div style={styles.formRow}>
            <input
              type="email"
              placeholder="Email"
              value={newInstructor.email}
              onChange={(e) => setNewInstructor({...newInstructor, email: e.target.value})}
              style={styles.input}
              disabled={addingInstructor}
              required
            />
          </div>
          <button
            type="submit"
            style={styles.submitButton}
            disabled={
              addingInstructor ||
              !newInstructor.name.trim() ||
              !newInstructor.email.trim() ||
              !newInstructor.department.trim()
            }
          >
            {addingInstructor ? 'Adding...' : 'Add Instructor'}
          </button>
        </form>
      )}

      {message && (
        <div style={styles.message}>
          {message}
        </div>
      )}

      <div style={styles.instructorFiltersRow}>
        <div style={styles.searchGroup}>
          <label style={styles.filterLabel}>Search</label>
          <input
            type="text"
            placeholder="Search by name, email, or department"
            value={instructorSearch}
            onChange={(e) => setInstructorSearch(e.target.value)}
            style={styles.input}
          />
        </div>
      </div>

      {loading ? (
        <div style={styles.loading}>Loading...</div>
      ) : (
        <>
          {filteredInstructors.length === 0 ? (
            <div style={styles.empty}>No instructors found.</div>
          ) : (
            <div style={styles.tableWrapper}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.tableHeader}>Instructor</th>
                    <th style={styles.tableHeader}>Department</th>
                    <th style={styles.tableHeader}>Email</th>
                    <th style={styles.tableHeader}>Total Students</th>
                    <th style={styles.tableHeader}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInstructors.map((instructor) => (
                    <tr key={instructor._id}>
                      <td style={styles.tableCell}>
                        <div style={styles.instructorNameCell}>
                          <span style={styles.instructorName}>{instructor.name}</span>
                        </div>
                      </td>
                      <td style={styles.tableCell}>{instructor.department || '—'}</td>
                      <td style={styles.tableCell}>
                        <span style={styles.instructorEmail}>{instructor.email}</span>
                      </td>
                      <td style={styles.tableCell}>
                        {instructor.totalStudents !== undefined ? instructor.totalStudents : 0}
                      </td>
                      <td style={styles.tableCell}>
                        <div style={styles.instructorMenuContainer} data-menu-container>
                          <button
                            style={styles.instructorMenuButton}
                            onClick={() => setEditMenuOpen(editMenuOpen === instructor._id ? null : instructor._id)}
                            title="More options"
                          >
                            ⋯
                          </button>
                          {editMenuOpen === instructor._id && (
                            <div style={styles.instructorMenuDropdown}>
                              <button
                                style={styles.instructorMenuItem}
                                onClick={() => handleEditClick(instructor)}
                              >
                                ✏️ Edit
                              </button>
                              {instructorsView === 'active' ? (
                                <button
                                  style={styles.instructorMenuItem}
                                  onClick={() => {
                                    setEditMenuOpen(null);
                                    handleArchiveToggle(instructor, true);
                                  }}
                                >
                                  🗂️ Archive
                                </button>
                              ) : (
                                <button
                                  style={styles.instructorMenuItem}
                                  onClick={() => {
                                    setEditMenuOpen(null);
                                    handleArchiveToggle(instructor, false);
                                  }}
                                >
                                  🔄 Restore
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showEditModal && editingInstructor && (
        <div style={styles.modalOverlay} onClick={() => !savingInstructor && handleCloseEditModal()}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Edit Instructor</h3>
              <button
                style={styles.modalCloseButton}
                onClick={handleCloseEditModal}
                disabled={savingInstructor}
                type="button"
              >
                ×
              </button>
            </div>
            {editConflictDetails && (
              <div style={styles.conflictWarning}>
                <p style={styles.conflictMessage}>⚠️ {editConflictDetails.message}</p>
                <p style={styles.conflictDetails}>
                  Current version: {editConflictDetails.currentVersion} | 
                  Your version: {editConflictDetails.attemptedVersion}
                </p>
                <button
                  type="button"
                  style={styles.refreshButton}
                  onClick={handleRefreshInstructor}
                >
                  🔄 Refresh Data
                </button>
              </div>
            )}
            <form onSubmit={handleSaveInstructor} style={styles.modalForm}>
              <div style={styles.formRow}>
                <label>Instructor Name *</label>
                <input
                  type="text"
                  placeholder="Instructor Name"
                  value={editFormData.name}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                  style={styles.input}
                  disabled={savingInstructor}
                  required
                />
              </div>
              <div style={styles.formRow}>
                <label>Email *</label>
                <input
                  type="email"
                  placeholder="Email"
                  value={editFormData.email}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  style={styles.input}
                  disabled={savingInstructor}
                  required
                />
              </div>
              <div style={styles.formRow}>
                <label>Department *</label>
                <div style={styles.departmentFieldGroup}>
                  <select
                    value={editFormData.department}
                    onChange={(e) => setEditFormData({ ...editFormData, department: e.target.value })}
                    style={styles.input}
                    disabled={loadingDepartments || departments.length === 0 || savingInstructor}
                    required={departments.length > 0}
                  >
                    <option value="">Select department...</option>
                    {departments.map((dept) => (
                      <option key={dept._id} value={dept.name}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    style={styles.addDepartmentButton}
                    onClick={() => {
                      setDepartmentError('');
                      setNewDepartmentName('');
                      setShowAddDepartmentModal(true);
                    }}
                    disabled={savingDepartment || savingInstructor}
                  >
                    + Add Department
                  </button>
                </div>
              </div>
              <div style={styles.mvccInfo}>
                <small style={styles.mvccText}>
                  Version: {editFormData.version} | 
                  Last Modified: {editingInstructor.lastModifiedAt ? new Date(editingInstructor.lastModifiedAt).toLocaleString() : 'N/A'}
                </small>
              </div>
              <div style={styles.modalFooter}>
                <button
                  type="button"
                  style={styles.cancelButton}
                  onClick={handleCloseEditModal}
                  disabled={savingInstructor}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={styles.submitButton}
                  disabled={
                    savingInstructor ||
                    !editFormData.name.trim() ||
                    !editFormData.email.trim() ||
                    !editFormData.department.trim()
                  }
                >
                  {savingInstructor ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddDepartmentModal && (
        <div style={styles.modalOverlay} onClick={() => !savingDepartment && closeAddDepartmentModal()}>
          <div style={styles.smallModalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Add Department</h3>
              <button
                style={styles.modalCloseButton}
                onClick={closeAddDepartmentModal}
                disabled={savingDepartment}
                type="button"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleAddDepartment} style={styles.modalForm}>
              <label>Department Name *</label>
              <input
                type="text"
                placeholder="Enter department name"
                value={newDepartmentName}
                onChange={(e) => setNewDepartmentName(e.target.value)}
                style={styles.input}
                disabled={savingDepartment}
                required
              />
              {departmentError && <p style={styles.errorText}>{departmentError}</p>}
              <div style={styles.modalFooter}>
                <button
                  type="button"
                  style={styles.cancelButton}
                  onClick={closeAddDepartmentModal}
                  disabled={savingDepartment}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={styles.sendFormConfirmButton}
                  disabled={savingDepartment}
                >
                  {savingDepartment ? 'Saving...' : 'Save Department'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
  };

  const fetchGoogleForms = async () => {
    setLoadingForms(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:5000/api/google-forms', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setGoogleForms(response.data.forms || []);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Error fetching Google Forms');
    } finally {
      setLoadingForms(false);
    }
  };

  const fetchDeanCreatedForms = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:5000/api/dean/evaluation-forms', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDeanCreatedForms(response.data.forms || []);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Error fetching created forms');
    }
  };

  const fetchFormResponses = async (formId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`http://localhost:5000/api/google-forms/${formId}/responses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFormResponses(response.data.responses || []);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Error fetching form responses');
    }
  };

  const fetchFormSummary = async (formId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`http://localhost:5000/api/google-forms/${formId}/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFormSummary(response.data.summary);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Error fetching form summary');
    }
  };

  const handleExportCSV = async (formId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`http://localhost:5000/api/google-forms/${formId}/export`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob'
      });
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `form-${formId}-responses.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      setMessage('CSV exported successfully');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Error exporting CSV');
    }
  };

  const renderGoogleForms = () => (
    <div style={styles.tabContent}>
      <div style={styles.header}>
        <h3>Google Forms - Evaluation Forms</h3>
        <button
          style={styles.addButton}
          onClick={fetchGoogleForms}
          disabled={loadingForms}
        >
          {loadingForms ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {loadingForms ? (
        <div style={styles.loading}>Loading Google Forms...</div>
      ) : googleForms.length > 0 ? (
        <div style={styles.googleFormsList}>
          {googleForms.map(form => (
            <div key={form._id || form.formId} style={styles.googleFormCard}>
              <div style={styles.formCardHeader}>
                <div style={{ flex: 1 }}>
                  <h4>{form.currentTitle || form.title}</h4>
                  <p style={styles.formMeta}>
                    <strong>Instructor:</strong> {form.instructorName || form.instructorId?.name} ({form.instructorEmail || form.instructorId?.email})
                  </p>
                  <p style={styles.formMeta}>
                    <strong>Course:</strong> {form.subject} | <strong>Year:</strong> {form.yearLevel} | <strong>Section:</strong> {form.section}
                  </p>
                  <p style={styles.formMeta}>
                    <strong>Sent to:</strong> {form.totalSent} students | <strong>Created:</strong> {new Date(form.createdAt).toLocaleDateString()}
                  </p>
                  {form.formId && (
                    <p style={styles.formMeta}>
                      <strong>Form ID:</strong> <code style={{ fontSize: '12px', background: '#f0f0f0', padding: '2px 4px' }}>{form.formId}</code>
                    </p>
                  )}
                </div>
              </div>
              
              <div style={styles.formActions}>
                <button
                  style={styles.actionButton}
                  onClick={() => window.open(form.currentFormUrl || form.formUrl, '_blank')}
                  title="Open form in new tab"
                >
                  🔗 View Form
                </button>
                <button
                  style={styles.actionButton}
                  onClick={async () => {
                    setSelectedForm(form);
                    await Promise.all([
                      fetchFormResponses(form.formId),
                      fetchFormSummary(form.formId)
                    ]);
                  }}
                  title="View responses"
                >
                  📊 View Responses
                </button>
                <button
                  style={styles.actionButton}
                  onClick={() => handleExportCSV(form.formId)}
                  title="Export as CSV"
                >
                  📥 Export CSV
                </button>
              </div>

              {selectedForm && selectedForm.formId === form.formId && (
                <div style={styles.responsesContainer}>
                  <div style={styles.responsesHeader}>
                    <h5>Form Responses</h5>
                    <button
                      style={styles.closeButton}
                      onClick={() => {
                        setSelectedForm(null);
                        setFormResponses([]);
                        setFormSummary(null);
                      }}
                    >
                      ×
                    </button>
                  </div>
                  
                  {formSummary && (
                    <div style={styles.summaryBox}>
                      <h6>Summary Statistics</h6>
                      <p><strong>Total Responses:</strong> {formSummary.totalResponses}</p>
                      {Object.keys(formSummary.averageRatings || {}).length > 0 && (
                        <div>
                          <strong>Average Ratings:</strong>
                          <ul>
                            {Object.entries(formSummary.averageRatings).map(([question, rating]) => (
                              <li key={question}>{question}: {rating}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {formResponses.length > 0 ? (
                    <div style={styles.responsesTable}>
                      <table style={styles.table}>
                        <thead>
                          <tr>
                            <th style={styles.tableHeader}>Response #</th>
                            <th style={styles.tableHeader}>Submitted At</th>
                            <th style={styles.tableHeader}>Answers</th>
                          </tr>
                        </thead>
                        <tbody>
                          {formResponses.slice(0, 10).map((response, idx) => (
                            <tr key={idx}>
                              <td style={styles.tableCell}>{idx + 1}</td>
                              <td style={styles.tableCell}>
                                {response.submittedAt ? new Date(response.submittedAt).toLocaleString() : 'N/A'}
                              </td>
                              <td style={styles.tableCell}>
                                <pre style={{ fontSize: '12px', margin: 0 }}>
                                  {JSON.stringify(response.answers, null, 2)}
                                </pre>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {formResponses.length > 10 && (
                        <p style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                          Showing first 10 of {formResponses.length} responses. Export CSV to see all.
                        </p>
                      )}
                    </div>
                  ) : (
                    <p style={styles.emptyState}>No responses yet.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div style={styles.emptyState}>
          No Google Forms found. Instructors can send Google Forms to students from their dashboard.
        </div>
      )}

      {message && (
        <div style={message.includes('✅') || message.includes('success') ? styles.successMessage : styles.errorMessage}>
          {message}
        </div>
      )}
    </div>
  );

  const handleCreateGoogleForm = async (e) => {
    e.preventDefault();
    setMessage('');
    setCreatingGoogleForm(true);

    if (!newGoogleFormTitle.trim()) {
      setMessage('Please enter a form title');
      setCreatingGoogleForm(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        'http://localhost:5000/api/dean/evaluation-forms/create-google-form',
        {
          title: newGoogleFormTitle.trim(),
          description: newGoogleFormDescription.trim()
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setMessage('✅ ' + response.data.message);
      setNewGoogleFormTitle('');
      setNewGoogleFormDescription('');
      fetchData(); // Refresh the list
    } catch (error) {
      setMessage('❌ ' + (error.response?.data?.message || 'Error creating Google Form'));
    } finally {
      setCreatingGoogleForm(false);
    }
  };

  const renderDeanCreatedForms = () => (
    <div style={styles.tabContent}>
      <div style={styles.header}>
        <h3>View Created Evaluation Forms</h3>
        <button
          style={styles.addButton}
          onClick={fetchDeanCreatedForms}
        >
          Refresh
        </button>
      </div>

      {deanCreatedForms.length > 0 ? (
        <div style={styles.evaluationFormsList}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.tableHeader}>Title</th>
                <th style={styles.tableHeader}>Google Form Link</th>
                <th style={styles.tableHeader}>Date Created</th>
                <th style={styles.tableHeader}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {deanCreatedForms.map(form => (
                <tr key={form._id}>
                  <td style={styles.tableCell}>{form.title}</td>
                  <td style={styles.tableCell}>
                    <a
                      href={form.googleFormLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#667eea', textDecoration: 'underline' }}
                    >
                      {form.googleFormLink}
                    </a>
                  </td>
                  <td style={styles.tableCell}>
                    {new Date(form.createdAt).toLocaleDateString()}
                  </td>
                  <td style={styles.tableCell}>
                    <button
                      style={styles.actionButton}
                      onClick={() => window.open(form.googleFormLink, '_blank')}
                    >
                      Open Form
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={styles.emptyState}>
          No evaluation forms created yet. Create your first form using the "Create Google Form" tab.
        </div>
      )}

      {message && (
        <div style={message.includes('✅') || message.includes('success') ? styles.successMessage : styles.errorMessage}>
          {message}
        </div>
      )}
    </div>
  );

  const renderCreateGoogleForm = () => (
    <div style={styles.tabContent}>
      <div style={styles.header}>
        <h3>Create Evaluation Form via Google Forms</h3>
      </div>

      <form onSubmit={handleCreateGoogleForm} style={styles.form}>
        <div style={styles.formSection}>
          <h4>Form Details</h4>
          <div style={styles.formGroup}>
            <label>Form Title *</label>
            <input
              type="text"
              placeholder="e.g., Course Evaluation 2024"
              value={newGoogleFormTitle}
              onChange={(e) => setNewGoogleFormTitle(e.target.value)}
              style={styles.input}
              required
              disabled={creatingGoogleForm}
            />
            <p style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              The form will be created as: "Evaluation Form - [Your Title]"
            </p>
          </div>
          
          <div style={styles.formGroup}>
            <label>Description (Optional)</label>
            <textarea
              placeholder="Official evaluation form created by the Dean."
              value={newGoogleFormDescription}
              onChange={(e) => setNewGoogleFormDescription(e.target.value)}
              style={styles.textarea}
              rows="3"
              disabled={creatingGoogleForm}
            />
          </div>

          <div style={styles.infoBox}>
            <h5>Sample Questions Included:</h5>
            <ul style={{ margin: '10px 0', paddingLeft: '20px' }}>
              <li>Rate your instructor's teaching effectiveness. (1-5 rating)</li>
              <li>What did you like most about this subject? (Paragraph)</li>
              <li>Suggestions for improvement? (Paragraph)</li>
            </ul>
            <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
              These questions will be automatically added to your Google Form.
            </p>
          </div>
        </div>

        <button
          type="submit"
          style={styles.submitButton}
          disabled={creatingGoogleForm || !newGoogleFormTitle.trim()}
        >
          {creatingGoogleForm ? 'Creating Form...' : 'Create Google Form'}
        </button>
      </form>

      {message && (
        <div style={message.includes('✅') ? styles.successMessage : styles.errorMessage}>
          {message}
        </div>
      )}
    </div>
  );

  const renderEvaluationForms = () => (
    <div style={styles.tabContent}>
      <div style={styles.header}>
        <h3>Evaluation Forms Management</h3>
        <div>
          <button
            style={styles.sendFormButton}
            onClick={() => { setShowAddEvalForm(!showAddEvalForm); setMessage(''); }}
          >
            {showAddEvalForm ? 'Cancel' : 'Add Evaluation Form'}
          </button>
        </div>
      </div>

      {showAddEvalForm && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setMessage('');
            try {
              const payload = {
                title: newEvalForm.title.trim(),
                description: newEvalForm.description.trim(),
              };
              const token = localStorage.getItem('token');
              await axios.post('http://localhost:5000/api/evaluation-forms', payload, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
              });
              setMessage('✅ New evaluation form successfully added and linked to Google Forms.');
              setNewEvalForm({ title: '', description: '', googleFormLink: '' });
              setShowAddEvalForm(false);
              // Refresh list
              fetchData();
            } catch (error) {
              const msg = error.response?.data?.message || 'Failed to create Google Form. Please check API credentials or quota.';
              setMessage(`❌ ${msg}`);
            }
          }}
          style={styles.form}
        >
          <div style={styles.formRow}>
            <input
              type="text"
              placeholder="Evaluation Form Title"
              value={newEvalForm.title}
              onChange={(e) => setNewEvalForm({ ...newEvalForm, title: e.target.value })}
              style={styles.input}
              required
            />
          </div>
          <div style={styles.formRow}>
            <input
              type="text"
              placeholder="Description"
              value={newEvalForm.description}
              onChange={(e) => setNewEvalForm({ ...newEvalForm, description: e.target.value })}
              style={styles.input}
            />
          </div>
          <button type="submit" style={styles.submitButton}>
            Save
          </button>
        </form>
      )}

      {message && (
        <div style={message.includes('✅') || message.includes('success') ? styles.successMessage : (message.includes('❌') || message.includes('Error') || message.includes('failed') ? styles.errorMessage : styles.message)}>
          {message}
        </div>
      )}

      {loading ? (
        <div style={styles.loading}>Loading evaluation forms...</div>
      ) : (
        <div style={styles.evaluationFormsList}>
          {evaluationForms.map(form => (
            <div key={form._id} style={styles.evaluationFormCard}>
              <div style={styles.formCardHeader}>
                <div style={{ flex: 1 }}>
                  <h4>{form.title}</h4>
                  {form.description && <p style={styles.formDescription}>{form.description}</p>}
                  <p style={styles.formMeta}>
                    Created: {new Date(form.createdAt).toLocaleDateString()} | 
                    Questions: {form.questions.length}
                  </p>
                  {form.googleFormLink && (
                    <p style={styles.formMeta}>
                      <strong>Google Form:</strong> <a href={form.googleFormLink} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea', textDecoration: 'underline' }}>Edit in Google Forms</a>
                    </p>
                  )}
                </div>
                <div style={styles.formStatus}>
                  <span style={styles.statusBadge}>
                    {form.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              
              <div style={{ marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                {form.googleFormLink ? (
                  <>
                    <button
                      style={styles.actionButton}
                      onClick={() => {
                        const popup = window.open(
                          form.googleFormLink,
                          'EditGoogleForm',
                          'width=1280,height=800,left=100,top=100,resizable=yes,scrollbars=yes'
                        );
                        if (popup) {
                          setMessage('Form editor opened in a new window.');
                        } else {
                          setMessage('Popup blocked. Please allow popups for this site.');
                        }
                      }}
                      title="Open form editor in Google Forms"
                    >
                      ✏️ Edit Evaluation Form
                    </button>
                    {form.googleFormId && (
                      <button
                        style={{ ...styles.actionButton, ...styles.smallButton }}
                        onClick={async () => {
                          try {
                            const resp = await axios.get(`http://localhost:5000/api/google-forms/form/${form.googleFormId}`);
                            const liveQs = (resp.data.questions || []).map((q, i) => ({ questionText: q.title, questionType: q.type, required: q.required, order: i + 1 }));
                            setLiveQuestionsByForm(prev => ({ ...prev, [form._id]: liveQs }));
                            setMessage('Preview refreshed from Google Forms');
                          } catch (e) {
                            setMessage('Error refreshing preview');
                          }
                        }}
                        title="Refresh preview from Google Forms"
                      >
                        🔄 Refresh Preview
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    style={styles.actionButton}
                    onClick={async () => {
                      try {
                        setMessage('Creating Google Form...');
                        const token = localStorage.getItem('token');
                        const userId = token ? token.split('_')[1] : null;
                        
                        // Extract the base title (remove "Evaluation Form - " prefix if present)
                        let baseTitle = form.title;
                        if (baseTitle.startsWith('Evaluation Form - ')) {
                          baseTitle = baseTitle.replace('Evaluation Form - ', '');
                        }
                        
                        const googleFormResponse = await axios.post(
                          'http://localhost:5000/api/google-forms/create',
                          {
                            title: baseTitle,
                            description: form.description || 'Official evaluation form created by the Dean.',
                            createdBy: userId
                          }
                        );

                        if (googleFormResponse.data.evaluationForm?.googleFormLink) {
                          const googleFormData = googleFormResponse.data.evaluationForm;
                          const duplicateFormId = googleFormData._id;
                          
                          // Delete the duplicate EvaluationForm created by Google Form creation
                          if (duplicateFormId && duplicateFormId !== form._id) {
                            try {
                              await axios.delete(`http://localhost:5000/api/evaluation-forms/${duplicateFormId}`);
                            } catch (deleteError) {
                              console.warn('Could not delete duplicate form:', deleteError);
                            }
                          }

                          // Update this evaluation form with Google Form link
                          await axios.put(
                            `http://localhost:5000/api/evaluation-forms/${form._id}`,
                            {
                              googleFormId: googleFormData.googleFormId,
                              googleFormLink: googleFormData.googleFormLink,
                              googleResponderLink: googleFormData.googleResponderLink
                            }
                          );
                          
                          setMessage('✅ Google Form created and linked successfully! The form will now show edit options.');
                          // Force a refresh to update the UI immediately
                          setTimeout(() => {
                            fetchData();
                          }, 500);
                        } else {
                          setMessage('❌ Google Form creation failed: No Google Form link returned.');
                        }
                      } catch (error) {
                        console.error('Error creating Google Form:', error);
                        setMessage('❌ Error creating Google Form: ' + (error.response?.data?.message || error.message));
                      }
                    }}
                    title="Create and link a Google Form for this evaluation form"
                  >
                    ➕ Create Google Form
                  </button>
                )}
                {form.responseSheetId && (
                  <button
                    style={{ ...styles.actionButton, ...styles.smallButton }}
                    onClick={() => {
                      const sheetUrl = `https://docs.google.com/spreadsheets/d/${form.responseSheetId}/edit${form.responseSheetTabId ? `#gid=${form.responseSheetTabId}` : ''}`;
                      window.open(sheetUrl, '_blank', 'noopener,noreferrer');
                    }}
                    title="Open linked Google Sheet responses"
                  >
                    📄 View Response Sheet
                  </button>
                )}
              </div>
              
              <div style={styles.questionsPreview}>
                <h5>Questions Preview:</h5>
                {(liveQuestionsByForm[form._id] || form.questions).slice(0, 3).map((question, index) => (
                  <div key={index} style={styles.questionPreview}>
                    <span style={styles.questionText}>{question.questionText || question.title}</span>
                    {question.ratingScale ? (
                      <span style={styles.questionType}>Rating: {question.ratingScale.min}-{question.ratingScale.max}</span>
                    ) : (
                      <span style={styles.questionType}>{question.type || question.questionType}</span>
                    )}
                  </div>
                ))}
                {form.questions.length > 3 && (
                  <p style={styles.moreQuestions}>+{form.questions.length - 3} more questions</p>
                )}
              </div>
            </div>
          ))}
          
          {evaluationForms.length === 0 && (
            <div style={styles.empty}>
              No evaluation forms created yet. Create your first form to get started.
            </div>
          )}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div style={styles.container}>
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Delete Instructor</h3>
              <button style={styles.modalCloseButton} onClick={cancelDelete}>
                ×
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={styles.warningIcon}>⚠️</div>
              <p style={styles.modalText}>
                Are you sure you want to delete <strong>"{instructorToDelete?.name}"</strong>?
              </p>
              <div style={styles.warningBox}>
                <p style={styles.warningText}>
                  This action will permanently remove:
                </p>
                <ul style={styles.warningList}>
                  <li>The instructor record</li>
                  <li>All related evaluations</li>
                  <li>All associated data</li>
                </ul>
                <p style={styles.warningText}>
                  <strong>This action cannot be undone.</strong>
                </p>
              </div>
            </div>
            <div style={styles.modalFooter}>
              <button style={styles.cancelButton} onClick={cancelDelete}>
                Cancel
              </button>
              <button style={styles.deleteConfirmButton} onClick={confirmDelete}>
                Delete Instructor
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={styles.header}>
        <div style={styles.headerContent}>
          <div>
            <h1>IT Instructor Evaluation System</h1>
            <p>College of Technology - {userRole === 'dean' ? 'Dean Dashboard' : 'Dashboard'}</p>
          </div>
          <button style={styles.logoutButton} onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <div style={styles.tabs}>
        {userRole === 'dean' && (
          <>
            <button
              style={{
                ...styles.tab,
                ...(activeTab === 'instructorStats' ? styles.activeTab : {})
              }}
              onClick={() => setActiveTab('instructorStats')}
            >
              Instructor Performance
            </button>
            <button
              style={{
                ...styles.tab,
                ...(activeTab === 'stats' ? styles.activeTab : {})
              }}
              onClick={() => setActiveTab('stats')}
            >
              Send Evaluation
            </button>
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
                ...(activeTab === 'evaluationForms' ? styles.activeTab : {})
              }}
              onClick={() => setActiveTab('evaluationForms')}
            >
              Evaluation Forms
            </button>
            <button
              style={{
                ...styles.tab,
                ...(activeTab === 'rbacSettings' ? styles.activeTab : {})
              }}
              onClick={() => setActiveTab('rbacSettings')}
            >
              🔒 Access Control
            </button>
            
          </>
        )}
      </div>

      <div style={styles.content}>
        {activeTab === 'instructorStats' && renderInstructorStatistics()}
        {activeTab === 'stats' && renderStats()}
        {activeTab === 'instructors' && renderInstructors()}
        {activeTab === 'evaluationForms' && renderEvaluationForms()}
        {activeTab === 'rbacSettings' && <RBACSettings />}
      </div>
      </div>
    </>
  );
};

// Styles object defined outside component
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
    fontWeight: '700',
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
  instructorCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  menuContainer: {
    position: 'relative',
  },
  menuButton: {
    background: 'transparent',
    border: 'none',
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    cursor: 'pointer',
    fontSize: '18px',
    color: '#666',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },
  dropdownMenu: {
    position: 'absolute',
    top: '100%',
    right: '0',
    background: 'white',
    border: '1px solid #e1e5e9',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    zIndex: 1000,
    minWidth: '160px',
    overflow: 'hidden',
  },
  dropdownItem: {
    width: '100%',
    padding: '12px 16px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: '14px',
    color: '#dc3545',
    textAlign: 'left',
    transition: 'background-color 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
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
  sectionCard: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
    padding: '20px',
    marginBottom: '20px',
  },
  instructorHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '15px',
    flexWrap: 'wrap',
    marginBottom: '15px',
  },
  instructorControlsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '15px',
  },
  instructorControlCard: {
    background: '#f8f9ff',
    borderRadius: '10px',
    border: '1px solid #e3e8ff',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  successBanner: {
    background: '#e8f5e9',
    borderColor: '#c8e6c9',
  },
  infoBanner: {
    background: '#e3f2fd',
    borderColor: '#bbdefb',
  },
  warningBanner: {
    background: '#fff3e0',
    borderColor: '#ffe0b2',
    marginTop: '20px',
  },
  instructorFiltersRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '20px',
    margin: '15px 0',
  },
  searchGroup: {
    flex: '1',
    minWidth: '220px',
  },
  sectionDescription: {
    margin: '4px 0 0 0',
    color: '#6b7280',
    fontSize: '13px',
  },
  tableWrapper: {
    overflowX: 'auto',
    borderRadius: '12px',
    border: '1px solid #e5e7eb',
    background: 'white',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  tableHeader: {
    textAlign: 'left',
    padding: '12px 16px',
    background: '#eef2ff',
    color: '#4a55a2',
    fontWeight: 600,
    fontSize: '14px',
    borderBottom: '1px solid #dde3f8',
  },
  tableCell: {
    padding: '12px 16px',
    borderBottom: '1px solid #f0f0f5',
    fontSize: '14px',
    color: '#444',
  },
  instructorNameCell: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  instructorName: {
    fontWeight: 600,
    color: '#1f2937',
  },
  instructorEmail: {
    fontSize: '13px',
    color: '#6b7280',
  },
  instructorMenuContainer: {
    position: 'relative',
    display: 'inline-block',
  },
  instructorMenuButton: {
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid #ddd',
    background: 'white',
    cursor: 'pointer',
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#666',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '36px',
    height: '36px',
    transition: 'all 0.2s ease',
  },
  instructorMenuDropdown: {
    position: 'absolute',
    top: '100%',
    right: '0',
    marginTop: '4px',
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    border: '1px solid #e0e0e0',
    zIndex: 1000,
    minWidth: '150px',
    overflow: 'hidden',
  },
  instructorMenuItem: {
    width: '100%',
    padding: '10px 16px',
    border: 'none',
    background: 'white',
    cursor: 'pointer',
    textAlign: 'left',
    fontSize: '14px',
    color: '#333',
    transition: 'background-color 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  actionButton: {
    padding: '7px 14px',
    borderRadius: '6px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
  },
  archiveButton: {
    background: '#fdeaea',
    color: '#c62828',
  },
  restoreButton: {
    background: '#e8f5e9',
    color: '#2e7d32',
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
  departmentFieldGroup: {
    display: 'flex',
    flex: 1,
    gap: '10px',
    alignItems: 'center',
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
  addDepartmentButton: {
    padding: '10px 16px',
    borderRadius: '5px',
    border: '1px dashed #667eea',
    background: '#f4f6ff',
    color: '#667eea',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
    minWidth: '150px',
  },
  helperText: {
    fontSize: '13px',
    color: '#6c757d',
    margin: '5px 0 10px 0',
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
  // Instructor Statistics Styles
  statsHeader: {
    marginBottom: '30px',
  },
  filtersPanel: {
    background: 'white',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
  },
  filtersHeaderRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '15px',
    gap: '10px',
  },
  filtersGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: '15px',
  },
  filterCard: {
    background: '#f9f9ff',
    border: '1px solid #e4e7fb',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  filterLabel: {
    fontSize: '13px',
    fontWeight: '600',
    color: '#4b4f6c',
  },
  filterActions: {
    display: 'flex',
    gap: '10px',
    flexWrap: 'wrap',
  },
  filterButton: {
    flex: '1',
    minWidth: '120px',
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid #d9defd',
    background: '#eef1ff',
    color: '#4a55a2',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  filterButtonPrimary: {
    background: '#667eea',
    borderColor: '#667eea',
    color: '#fff',
  },
  filterButtonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  filterHint: {
    fontSize: '12px',
    color: '#6b7280',
    margin: '4px 0 0 0',
  },
  summaryCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
    marginTop: '20px',
  },
  summaryCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '10px',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
    textAlign: 'center',
    border: '2px solid #e9ecef',
  },
  summaryNumber: {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#667eea',
    margin: '10px 0 0 0',
  },
  instructorStatsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
    gap: '25px',
  },
  instructorStatsCard: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 6px 20px rgba(0,0,0,0.1)',
    padding: '25px',
    border: '1px solid #e9ecef',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
  },
  instructorStatsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
    paddingBottom: '15px',
    borderBottom: '2px solid #f8f9fa',
  },
  instructorName: {
    margin: '0 0 8px 0',
    color: '#333',
    fontSize: '20px',
    fontWeight: '600',
  },
  instructorDept: {
    margin: '0 0 5px 0',
    color: '#667eea',
    fontSize: '14px',
    fontWeight: '500',
  },
  instructorEmail: {
    margin: '0',
    color: '#666',
    fontSize: '13px',
  },
  performanceBadge: {
    display: 'flex',
    alignItems: 'center',
  },
  performanceGrade: {
    padding: '6px 12px',
    borderRadius: '20px',
    color: 'white',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  ratingSummary: {
    marginBottom: '20px',
    padding: '15px',
    background: '#f8f9ff',
    borderRadius: '8px',
  },
  overallRating: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  ratingLabel: {
    fontSize: '16px',
    fontWeight: '500',
    color: '#333',
  },
  ratingValue: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#667eea',
  },
  ratingRange: {
    textAlign: 'right',
  },
  rangeText: {
    fontSize: '12px',
    color: '#666',
  },
  detailedRatings: {
    marginBottom: '20px',
  },
  ratingItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #f0f0f0',
  },
  ratingScore: {
    fontWeight: '600',
    color: '#333',
  },
  evaluationInfo: {
    marginBottom: '20px',
  },
  evaluationCount: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  countLabel: {
    fontSize: '14px',
    color: '#666',
  },
  countValue: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#333',
  },
  coursesList: {
    marginTop: '10px',
  },
  coursesLabel: {
    fontSize: '14px',
    color: '#666',
    marginBottom: '8px',
    display: 'block',
  },
  coursesTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  courseTag: {
    background: '#e3f2fd',
    color: '#1976d2',
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
  },
  recentEvaluations: {
    borderTop: '2px solid #f8f9fa',
    paddingTop: '15px',
  },
  recentTitle: {
    margin: '0 0 15px 0',
    fontSize: '16px',
    fontWeight: '600',
    color: '#333',
  },
  recentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  recentItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px',
    background: '#f8f9fa',
    borderRadius: '6px',
  },
  recentInfo: {
    display: 'flex',
    flexDirection: 'column',
  },
  recentCourse: {
    fontSize: '14px',
    fontWeight: '500',
    color: '#333',
  },
  recentSemester: {
    fontSize: '12px',
    color: '#666',
  },
  recentRating: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  recentScore: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#667eea',
  },
  recentDate: {
    fontSize: '11px',
    color: '#999',
  },
  noEvaluationsMessage: {
    marginBottom: '20px',
    padding: '20px',
    background: '#f8f9fa',
    borderRadius: '8px',
    textAlign: 'center',
    border: '2px dashed #dee2e6',
  },
  noEvaluationsText: {
    margin: '0',
    color: '#6c757d',
    fontSize: '14px',
    fontStyle: 'italic',
  },
  // Modal Styles
  modalOverlay: {
    position: 'fixed',
    top: '0',
    left: '0',
    right: '0',
    bottom: '0',
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
    maxWidth: '500px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  smallModalContent: {
    background: 'white',
    borderRadius: '12px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
    maxWidth: '420px',
    width: '100%',
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
    margin: '0',
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
    padding: '0',
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
  modalForm: {
    padding: '0 24px 24px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  warningIcon: {
    fontSize: '48px',
    marginBottom: '16px',
  },
  modalText: {
    fontSize: '16px',
    color: '#333',
    marginBottom: '20px',
    lineHeight: '1.5',
  },
  warningBox: {
    background: '#fff3cd',
    border: '1px solid #ffeaa7',
    borderRadius: '8px',
    padding: '16px',
    textAlign: 'left',
  },
  warningText: {
    margin: '0 0 8px 0',
    fontSize: '14px',
    color: '#856404',
  },
  warningList: {
    margin: '8px 0',
    paddingLeft: '20px',
    color: '#856404',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    padding: '20px 24px 24px 24px',
    borderTop: '1px solid #e9ecef',
  },
  conflictWarning: {
    background: '#fff3cd',
    border: '1px solid #ffc107',
    borderRadius: '8px',
    padding: '16px',
    margin: '0 24px 20px 24px',
  },
  conflictMessage: {
    margin: '0 0 8px 0',
    color: '#856404',
    fontWeight: '600',
    fontSize: '14px',
  },
  conflictDetails: {
    margin: '0 0 12px 0',
    color: '#856404',
    fontSize: '12px',
  },
  refreshButton: {
    padding: '6px 12px',
    background: '#ffc107',
    color: '#856404',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '600',
  },
  mvccInfo: {
    padding: '8px 0',
    marginTop: '8px',
    borderTop: '1px solid #e9ecef',
  },
  mvccText: {
    color: '#6c757d',
    fontSize: '11px',
    fontStyle: 'italic',
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
  deleteConfirmButton: {
    padding: '10px 20px',
    background: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background-color 0.2s ease',
  },
  sendFormButton: {
    padding: '12px 24px',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '16px',
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
  formGroup: {
    marginBottom: '20px',
    textAlign: 'left',
  },
  // Evaluation Forms Styles
  formSection: {
    marginBottom: '30px',
    padding: '20px',
    background: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e9ecef',
  },
  sectionHeader: {
    padding: '15px 20px',
    backgroundColor: '#f8f9fa',
    border: '1px solid #e9ecef',
    borderRadius: '8px 8px 0 0',
    marginBottom: '0',
  },
  textarea: {
    width: '100%',
    padding: '12px',
    border: '1px solid #ddd',
    borderRadius: '5px',
    fontSize: '16px',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  addQuestionButton: {
    padding: '8px 16px',
    background: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
  },
  errorText: {
    fontSize: '13px',
    color: '#dc3545',
    margin: '0',
  },
  questionCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    border: '1px solid #e9ecef',
    marginBottom: '15px',
  },
  questionHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
  },
  questionNumber: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#667eea',
  },
  removeQuestionButton: {
    background: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
    fontSize: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingSettings: {
    marginTop: '15px',
    padding: '15px',
    background: '#f8f9fa',
    borderRadius: '6px',
  },
  ratingRow: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '10px',
    gap: '10px',
  },
  ratingInputs: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  ratingInput: {
    width: '60px',
    padding: '6px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    textAlign: 'center',
  },
  labelInputs: {
    display: 'flex',
    gap: '10px',
  },
  labelInput: {
    flex: 1,
    padding: '6px 8px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
  },
  emptyQuestions: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
    fontStyle: 'italic',
  },
  evaluationFormsList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
    gap: '20px',
  },
  evaluationFormCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    border: '1px solid #e9ecef',
  },
  formCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '15px',
  },
  formDescription: {
    color: '#666',
    fontSize: '14px',
    margin: '5px 0',
  },
  formMeta: {
    color: '#999',
    fontSize: '12px',
    margin: '5px 0 0 0',
  },
  formStatus: {
    display: 'flex',
    alignItems: 'center',
  },
  statusBadge: {
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: '500',
    background: '#d4edda',
    color: '#155724',
  },
  questionsPreview: {
    borderTop: '1px solid #e9ecef',
    paddingTop: '15px',
  },
  questionPreview: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
    borderBottom: '1px solid #f0f0f0',
  },
  questionText: {
    fontSize: '14px',
    color: '#333',
    flex: 1,
    marginRight: '10px',
  },
  questionType: {
    fontSize: '12px',
    color: '#667eea',
    fontWeight: '500',
  },
  moreQuestions: {
    fontSize: '12px',
    color: '#999',
    textAlign: 'center',
    margin: '10px 0 0 0',
    fontStyle: 'italic',
  },
  // Google Forms Styles
  googleFormsList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(500px, 1fr))',
    gap: '20px',
  },
  googleFormCard: {
    background: 'white',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    border: '1px solid #e9ecef',
  },
  formActions: {
    display: 'flex',
    gap: '10px',
    marginTop: '15px',
    flexWrap: 'wrap',
  },
  actionButton: {
    padding: '8px 16px',
    background: '#667eea',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '500',
    transition: 'background-color 0.2s ease',
  },
  smallButton: {
    padding: '4px 10px',
    fontSize: '12px',
    borderRadius: '4px',
    background: '#eef2ff',
    color: '#4f46e5',
    border: '1px solid #e0e7ff',
  },
  responsesContainer: {
    marginTop: '20px',
    padding: '15px',
    background: '#f8f9fa',
    borderRadius: '8px',
    border: '1px solid #e9ecef',
  },
  responsesHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '15px',
  },
  closeButton: {
    background: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '50%',
    width: '24px',
    height: '24px',
    cursor: 'pointer',
    fontSize: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBox: {
    background: 'white',
    padding: '15px',
    borderRadius: '6px',
    marginBottom: '15px',
    border: '1px solid #e9ecef',
  },
  responsesTable: {
    overflowX: 'auto',
  },
  infoBox: {
    background: '#e3f2fd',
    border: '1px solid #90caf9',
    borderRadius: '8px',
    padding: '15px',
    marginTop: '15px',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    background: 'white',
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
  emptyState: {
    textAlign: 'center',
    padding: '40px',
    color: '#666',
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  successMessage: {
    padding: '12px',
    borderRadius: '5px',
    textAlign: 'center',
    marginBottom: '20px',
    fontSize: '16px',
    background: '#d4edda',
    color: '#155724',
    border: '1px solid #c3e6cb',
  },
  errorMessage: {
    padding: '12px',
    borderRadius: '5px',
    textAlign: 'center',
    marginBottom: '20px',
    fontSize: '16px',
    background: '#f8d7da',
    color: '#721c24',
    border: '1px solid #f5c6cb',
  },
  studentTable: {
    marginTop: '20px',
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
};

export default Dashboard;
