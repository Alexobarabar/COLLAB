// Default permissions for Dean role
const DEFAULT_DEAN_PERMISSIONS = {
  // 1. Instructor Management
  createInstructor: true,
  editInstructor: true,
  deleteInstructor: true,
  archiveInstructor: true,
  viewInstructorList: true,
  viewInstructorDetails: true,

  // 2. Student & Section Oversight
  viewInstructorSections: true,
  viewStudentsBySection: true,
  viewStudentsByInstructor: true,
  viewAllStudents: true,

  // 3. Email Distribution
  sendEvalAllStudents: true,
  sendEvalByInstructor: true,
  sendEvalBySection: true,
};

// Default permissions for Instructor role
const DEFAULT_INSTRUCTOR_PERMISSIONS = {
  // 1. Profile Management
  viewProfile: true,
  updateEmail: true,
  changePassword: true,

  // 2. Section Management
  createSection: true,
  viewSections: true,
  viewSectionDetails: true,
  manageSectionInfo: true,

  // 3. Student Management
  addStudents: true,
  viewStudents: true,
  filterBySection: true,
  filterByYear: true,
  filterBySubject: true,
  searchStudents: true,
  sortStudents: true,
  viewStudentCount: true,
};

// Feature labels for UI display
const FEATURE_LABELS = {
  // Dean features
  createInstructor: "Create New Instructors",
  editInstructor: "Edit Instructor Details",
  deleteInstructor: "Delete Instructors",
  archiveInstructor: "Archive/Unarchive Instructors",
  viewInstructorList: "View Instructor List",
  viewInstructorDetails: "View Individual Instructor Details",
  
  viewInstructorSections: "View All Instructor Sections",
  viewStudentsBySection: "View Students by Section",
  viewStudentsByInstructor: "View Students by Instructor",
  viewAllStudents: "View All Students Across System",
  
  sendEvalAllStudents: "Send Evaluation Forms to All Students",
  sendEvalByInstructor: "Send Evaluation Forms by Instructor",
  sendEvalBySection: "Send Evaluation Forms by Section",

  // Instructor features
  viewProfile: "View Own Profile",
  updateEmail: "Update Email Address",
  changePassword: "Change Password",
  
  createSection: "Create New Sections",
  viewSections: "View Own Sections",
  viewSectionDetails: "View Section Details",
  manageSectionInfo: "Manage Section Information",
  
  addStudents: "Add Students to Own Sections",
  viewStudents: "View Own Students",
  filterBySection: "Filter Students by Section",
  filterByYear: "Filter Students by Year Level",
  filterBySubject: "Filter Students by Subject",
  searchStudents: "Search Students",
  sortStudents: "Sort Students",
  viewStudentCount: "View Student Count per Section",
};

// Feature categories for organized display
const DEAN_FEATURE_CATEGORIES = {
  "Instructor Management": [
    "createInstructor",
    "editInstructor",
    "deleteInstructor",
    "archiveInstructor",
    "viewInstructorList",
    "viewInstructorDetails",
  ],
  "Student & Section Oversight": [
    "viewInstructorSections",
    "viewStudentsBySection",
    "viewStudentsByInstructor",
    "viewAllStudents",
  ],
  "Email Distribution": [
    "sendEvalAllStudents",
    "sendEvalByInstructor",
    "sendEvalBySection",
  ],
};

const INSTRUCTOR_FEATURE_CATEGORIES = {
  "Profile Management": [
    "viewProfile",
    "updateEmail",
    "changePassword",
  ],
  "Section Management": [
    "createSection",
    "viewSections",
    "viewSectionDetails",
    "manageSectionInfo",
  ],
  "Student Management": [
    "addStudents",
    "viewStudents",
    "filterBySection",
    "filterByYear",
    "filterBySubject",
    "searchStudents",
    "sortStudents",
    "viewStudentCount",
  ],
};

module.exports = {
  DEFAULT_DEAN_PERMISSIONS,
  DEFAULT_INSTRUCTOR_PERMISSIONS,
  FEATURE_LABELS,
  DEAN_FEATURE_CATEGORIES,
  INSTRUCTOR_FEATURE_CATEGORIES,
};

