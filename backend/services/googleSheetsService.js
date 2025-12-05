const { getSheetsClient, getFormsClient } = require("../config/google");
const mongoose = require("mongoose");
const Instructor = require("../models/Instructor");
const User = require("../models/User");
const GoogleForm = require("../models/GoogleForm");
const EvaluationForm = require("../models/EvaluationForm");
const Student = require("../models/Student");
const Section = require("../models/Section");
const { buildCategoryBreakdown } = require("../utils/questionCategories");
const { getDescriptiveRating } = require("../utils/descriptiveRatings");

const SECTION_COLUMN_CANDIDATES = [
  "Section Code",
  "Section",
  "Class Section",
  "Section Name",
  "Section/Code",
];

const SUBJECT_COLUMN_CANDIDATES = [
  "Subject Code",
  "Subject",
  "Course Code",
];

const OVERALL_RATING_COLUMNS = [
  "Overall Rating",
  "Rate the instructor (1-5)",
  "Rating",
  "Instructor Rating",
  "Overall",
];

const SHEET_HEADERS = [
  "Timestamp",
  "Instructor Name",
  "Instructor Email",
  "Course",
  "Semester",
  "Academic Year",
  "Student ID",
  "Student Email",
  "Is Anonymous",
  "Teaching Effectiveness",
  "Communication Skills",
  "Subject Knowledge",
  "Punctuality",
  "Availability",
  "Overall Rating",
  "Feedback: Strengths",
  "Feedback: Areas For Improvement",
  "Feedback: Additional Comments",
];

function getSpreadsheetId() {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GSHEETS_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error(
      "Google Sheets integration misconfigured: set GOOGLE_SHEETS_SPREADSHEET_ID (or GSHEETS_SPREADSHEET_ID)."
    );
  }
  return spreadsheetId;
}

function buildSheetTitle(instructorName = "Unknown") {
  const sanitized = String(instructorName)
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const fallback = sanitized || "Instructor";
  return `Instructor_${fallback}_Sheet`;
}

async function ensureSheetExists(sheetTitle) {
  const spreadsheetId = getSpreadsheetId();
  const sheets = await getSheetsClient({ writable: true });

  const { data } = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = data?.sheets?.some((sheet) => sheet?.properties?.title === sheetTitle);
  if (exists) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetTitle,
            },
          },
        },
      ],
    },
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A1:${String.fromCharCode(64 + SHEET_HEADERS.length)}1`,
    valueInputOption: "RAW",
    requestBody: {
      values: [SHEET_HEADERS],
    },
  });
}

async function resolveSpreadsheetForEvaluationForm(formIdentifier) {
  if (!formIdentifier) return null;

  let evaluationForm = null;
  const isObjectId = /^[a-f\d]{24}$/i.test(String(formIdentifier));
  if (isObjectId) {
    evaluationForm = await EvaluationForm.findById(formIdentifier).lean();
  }
  if (!evaluationForm) {
    const orQuery = [{ googleFormId: formIdentifier }];
    if (isObjectId) {
      orQuery.push({ _id: formIdentifier });
    }
    evaluationForm = await EvaluationForm.findOne({ $or: orQuery }).lean();
  }
  if (!evaluationForm) {
    throw new Error("Evaluation form not found for the provided identifier.");
  }

  let spreadsheetId = evaluationForm.responseSheetId || null;
  let sheetName = evaluationForm.responseSheetName || "Form Responses 1";

  if (!spreadsheetId && evaluationForm.googleFormId) {
    const storedGoogleForm = await GoogleForm.findOne({ formId: evaluationForm.googleFormId }).lean();
    if (storedGoogleForm?.spreadsheetId) {
      spreadsheetId = storedGoogleForm.spreadsheetId;
      sheetName = storedGoogleForm.responseSheetName || sheetName;
    }
  }

  if (!spreadsheetId && evaluationForm.googleFormId) {
    try {
      const formsClient = await getFormsClient();
      const formInfo = await formsClient.forms.get({ formId: evaluationForm.googleFormId });
      if (formInfo?.data?.linkedSheetId) {
        spreadsheetId = formInfo.data.linkedSheetId;
        await EvaluationForm.findByIdAndUpdate(
          evaluationForm._id,
          { responseSheetId: spreadsheetId },
          { new: false }
        ).catch(() => {});
      }
    } catch (error) {
      console.warn(
        "Unable to resolve linked sheet via Forms API:",
        error?.response?.data || error?.message || error
      );
    }
  }

  if (!spreadsheetId) {
    throw new Error("Linked Google Sheet not found for the selected evaluation form.");
  }

  // Resolve sheet name by inspecting spreadsheet tabs
  try {
    const sheetsClient = await getSheetsClient();
    const { data: spreadsheetData } = await sheetsClient.spreadsheets.get({
      spreadsheetId,
      includeGridData: false,
    });

    const sheets = spreadsheetData?.sheets || [];

    // Note: We cannot reliably auto-detect which sheet tab belongs to which form
    // without storing responseSheetName when the form is created.
    // The Google Forms API doesn't provide the tab name, only the spreadsheet ID.

    let matchedSheet = null;

    // Attempt to match by stored sheet name first (most reliable)
    if (evaluationForm.responseSheetName) {
      matchedSheet = sheets.find(
        (sheet) => sheet?.properties?.title === evaluationForm.responseSheetName
      );
    }

    // Try to match via developer metadata (preferred if available)
    if (!matchedSheet && evaluationForm.googleFormId) {
      for (const sheet of sheets) {
        const metadataEntries = sheet?.developerMetadata || [];
        const hasMatchingMetadata = metadataEntries.some((meta) => {
          const value = String(meta?.metadataValue || "");
          return value.includes(evaluationForm.googleFormId || "");
        });
        if (hasMatchingMetadata) {
          matchedSheet = sheet;
          break;
        }
      }
    }

    // Fallback: match by stored sheet tab id (if previously persisted)
    if (!matchedSheet && evaluationForm.responseSheetTabId) {
      matchedSheet = sheets.find(
        (sheet) =>
          String(sheet?.properties?.sheetId || "") === String(evaluationForm.responseSheetTabId)
      );
    }

    if (!matchedSheet) {
      throw new Error(
        `Unable to resolve the specific response sheet for form "${evaluationForm.title}". Please ensure responseSheetName is stored in the database for this form.`
      );
    }

    sheetName = matchedSheet.properties.title;
    const sheetTabId = matchedSheet.properties.sheetId;

    // Persist resolved sheet details for future calls
    await EvaluationForm.findByIdAndUpdate(
      evaluationForm._id,
      {
        responseSheetName: sheetName,
        responseSheetTabId: sheetTabId,
      },
      { new: false }
    ).catch(() => {});
  } catch (error) {
    console.warn(
      "Unable to inspect spreadsheet to resolve sheet name:",
      error?.response?.data || error?.message || error
    );
    throw error;
  }

  return {
    spreadsheetId,
    sheetName,
    evaluationForm,
  };
}

async function appendEvaluationRow({
  instructor,
  student,
  evaluation,
}) {
  const spreadsheetId = getSpreadsheetId();
  const sheets = await getSheetsClient({ writable: true });
  const sheetTitle = buildSheetTitle(instructor?.name);

  await ensureSheetExists(sheetTitle);

  const ratings = evaluation?.ratings || {};
  const feedback = evaluation?.feedback || {};

  const values = [
    new Date().toISOString(),
    instructor?.name || "Unknown",
    instructor?.email || "",
    evaluation?.course || "",
    evaluation?.semester || "",
    evaluation?.academicYear || "",
    student?._id ? String(student._id) : "",
    evaluation?.isAnonymous ? "Anonymous" : student?.email || "",
    evaluation?.isAnonymous ? "Yes" : "No",
    ratings.teachingEffectiveness ?? "",
    ratings.communicationSkills ?? "",
    ratings.subjectKnowledge ?? "",
    ratings.punctuality ?? "",
    ratings.availability ?? "",
    ratings.overallRating ?? "",
    feedback.strengths || "",
    feedback.areasForImprovement || "",
    feedback.additionalComments || "",
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetTitle}!A:A`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: {
      values: [values],
    },
  });

  return {
    spreadsheetId,
    sheetTitle,
  };
}

async function fetchInstructorResponses(instructor) {
  const spreadsheetId = getSpreadsheetId();
  const sheets = await getSheetsClient();
  const sheetTitle = buildSheetTitle(instructor?.name);

  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetTitle}!A:Z`,
    });
    const rows = data.values || [];
    return {
      headers: rows[0] || [],
      rows: rows.slice(1),
      sheetTitle,
    };
  } catch (error) {
    if (error?.code === 404) {
      return {
        headers: SHEET_HEADERS,
        rows: [],
        sheetTitle,
      };
    }
    throw error;
  }
}

async function getAllInstructorSheets() {
  const spreadsheetId = getSpreadsheetId();
  const sheets = await getSheetsClient();

  try {
    const { data } = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheets = data.sheets || [];
    
    // Filter only instructor sheets (those starting with "Instructor_" and ending with "_Sheet")
    const instructorSheets = allSheets
      .map((sheet) => ({
        title: sheet.properties?.title || "",
        sheetId: sheet.properties?.sheetId,
      }))
      .filter((sheet) => 
        sheet.title.startsWith("Instructor_") && sheet.title.endsWith("_Sheet")
      );

    return instructorSheets;
  } catch (error) {
    console.error("Error fetching all sheets:", error);
    throw error;
  }
}

function parseEvaluationRow(headers, row) {
  if (!headers || !row || row.length === 0) return null;

  const rowData = {};
  headers.forEach((header, index) => {
    rowData[header] = row[index] || "";
  });

  // Extract instructor name from sheet title or row data
  const instructorName = rowData["Instructor Name"] || "";
  const instructorEmail = rowData["Instructor Email"] || "";

  // Parse ratings (convert to numbers)
  const ratings = {
    teachingEffectiveness: parseFloat(rowData["Teaching Effectiveness"]) || 0,
    communicationSkills: parseFloat(rowData["Communication Skills"]) || 0,
    subjectKnowledge: parseFloat(rowData["Subject Knowledge"]) || 0,
    punctuality: parseFloat(rowData["Punctuality"]) || 0,
    availability: parseFloat(rowData["Availability"]) || 0,
    overallRating: parseFloat(rowData["Overall Rating"]) || 0,
  };

  return {
    timestamp: rowData["Timestamp"] || "",
    instructorName,
    instructorEmail,
    course: rowData["Course"] || "",
    semester: rowData["Semester"] || "",
    academicYear: rowData["Academic Year"] || "",
    studentId: rowData["Student ID"] || "",
    studentEmail: rowData["Student Email"] || "",
    isAnonymous: rowData["Is Anonymous"] === "Yes",
    ratings,
    feedback: {
      strengths: rowData["Feedback: Strengths"] || "",
      areasForImprovement: rowData["Feedback: Areas For Improvement"] || "",
      additionalComments: rowData["Feedback: Additional Comments"] || "",
    },
  };
}

async function computeInstructorSummary(sheetTitle) {
  const spreadsheetId = getSpreadsheetId();
  const sheets = await getSheetsClient();

  try {
    const { data } = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetTitle}!A:Z`,
    });

    const rows = data.values || [];
    if (rows.length < 2) {
      // Only headers, no data
      return null;
    }

    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Parse all rows
    const evaluations = dataRows
      .map((row) => parseEvaluationRow(headers, row))
      .filter((eval) => eval !== null);

    if (evaluations.length === 0) {
      return null;
    }

    // Extract instructor info from first evaluation
    const firstEval = evaluations[0];
    const instructorName = firstEval.instructorName || sheetTitle.replace("Instructor_", "").replace("_Sheet", "");
    const instructorEmail = firstEval.instructorEmail || "";

    // Compute statistics
    const totalResponses = evaluations.length;
    
    // Calculate averages for each rating category
    const avgRatings = {
      teachingEffectiveness: 0,
      communicationSkills: 0,
      subjectKnowledge: 0,
      punctuality: 0,
      availability: 0,
      overallRating: 0,
    };

    const ratingKeys = Object.keys(avgRatings);
    ratingKeys.forEach((key) => {
      const sum = evaluations.reduce((acc, eval) => acc + (eval.ratings[key] || 0), 0);
      avgRatings[key] = totalResponses > 0 ? sum / totalResponses : 0;
    });

    // Calculate overall performance score (average of all ratings)
    const overallPerformanceScore = 
      Object.values(avgRatings).reduce((sum, val) => sum + val, 0) / ratingKeys.length;

    // Get min and max overall ratings
    const overallRatings = evaluations.map((e) => e.ratings.overallRating).filter((r) => r > 0);
    const minOverallRating = overallRatings.length > 0 ? Math.min(...overallRatings) : 0;
    const maxOverallRating = overallRatings.length > 0 ? Math.max(...overallRatings) : 0;

    // Performance grade
    const getPerformanceGrade = (score) => {
      if (score >= 4.5) return "Excellent";
      if (score >= 4.0) return "Very Good";
      if (score >= 3.5) return "Good";
      if (score >= 3.0) return "Satisfactory";
      if (score >= 2.5) return "Needs Improvement";
      return "Poor";
    };

    return {
      instructorName,
      instructorEmail,
      sheetTitle,
      totalResponses,
      avgRatings: {
        teachingEffectiveness: Math.round(avgRatings.teachingEffectiveness * 100) / 100,
        communicationSkills: Math.round(avgRatings.communicationSkills * 100) / 100,
        subjectKnowledge: Math.round(avgRatings.subjectKnowledge * 100) / 100,
        punctuality: Math.round(avgRatings.punctuality * 100) / 100,
        availability: Math.round(avgRatings.availability * 100) / 100,
        overallRating: Math.round(avgRatings.overallRating * 100) / 100,
      },
      overallPerformanceScore: Math.round(overallPerformanceScore * 100) / 100,
      minOverallRating: Math.round(minOverallRating * 100) / 100,
      maxOverallRating: Math.round(maxOverallRating * 100) / 100,
      performanceGrade: getPerformanceGrade(overallPerformanceScore),
      lastUpdated: evaluations.length > 0 ? evaluations[evaluations.length - 1].timestamp : "",
    };
  } catch (error) {
    if (error?.code === 404) {
      return null; // Sheet doesn't exist
    }
    console.error(`Error computing summary for ${sheetTitle}:`, error);
    throw error;
  }
}

async function getAllInstructorSummaries() {
  try {
    const instructorSheets = await getAllInstructorSheets();
    const summaries = [];

    // Process each instructor sheet
    for (const sheet of instructorSheets) {
      try {
        const summary = await computeInstructorSummary(sheet.title);
        if (summary) {
          summaries.push(summary);
        }
      } catch (error) {
        console.error(`Error processing sheet ${sheet.title}:`, error);
        // Continue with other sheets even if one fails
      }
    }

    // Sort by overall performance score (descending)
    summaries.sort((a, b) => b.overallPerformanceScore - a.overallPerformanceScore);

    return summaries;
  } catch (error) {
    console.error("Error fetching all instructor summaries:", error);
    throw error;
  }
}

/**
 * Get overall summary from all sheets in the spreadsheet
 * Reads all data from all instructor sheets and calculates overall statistics
 * Also extracts questions and answers from the sheet
 * @param {string} [formId] - Optional Google Form ID to filter by specific form's spreadsheet
 */
async function getOverallSummary(formId = null) {
  let spreadsheetId = getSpreadsheetId();
  let targetSheetTitles = null;
  let resolvedEvaluationForm = null;
  let resolvedSheetName = null;

  if (formId) {
    try {
      const resolved = await resolveSpreadsheetForEvaluationForm(formId);
      spreadsheetId = resolved.spreadsheetId;
      targetSheetTitles = [resolved.sheetName || "Form Responses 1"];
      resolvedEvaluationForm = resolved.evaluationForm || null;
      resolvedSheetName = resolved.sheetName || null;
      console.log(
        `[Form Filter] Using spreadsheet ${spreadsheetId} (sheet: ${targetSheetTitles[0]}) for form ${formId}`
      );
    } catch (error) {
      console.error(`[Form Filter] Unable to resolve spreadsheet for form ${formId}:`, error.message || error);
      throw error;
    }
  }

  const sheets = await getSheetsClient();

  try {
    // Get all sheets in the spreadsheet
    const { data: spreadsheetData } = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheets = spreadsheetData.sheets || [];

    let sheetsToProcess;
    if (targetSheetTitles && targetSheetTitles.length) {
      sheetsToProcess = allSheets
        .map((sheet) => sheet?.properties?.title || "")
        .filter((title) => targetSheetTitles.includes(title));

      if (sheetsToProcess.length === 0) {
        // Don't silently fallback - throw an error so the user knows the sheet mapping is wrong
        throw new Error(
          `The specified response sheet "${targetSheetTitles[0]}" was not found in the spreadsheet. ` +
          `Please update the responseSheetName field for this evaluation form in the database.`
        );
      }
    } else {
      // Get all sheets - prioritize instructor sheets, but also include Google Form response sheets
      const instructorSheets = allSheets
        .map((sheet) => sheet?.properties?.title || "")
        .filter((title) => {
          // Include instructor sheets
          if (title.startsWith("Instructor_") && title.endsWith("_Sheet")) {
            return true;
          }
          // Also include standard Google Form response sheets
          if (title.toLowerCase().includes("form responses") || title.toLowerCase().includes("responses")) {
            return true;
          }
          return false;
        });

      // If no instructor sheets found, try to use the first sheet (might be a single response sheet)
      sheetsToProcess =
        instructorSheets.length > 0
          ? instructorSheets
          : allSheets.length > 0
          ? [allSheets[0].properties?.title || ""]
          : [];
    }

    if (sheetsToProcess.length === 0) {
      return {
        totalResponses: 0,
        totalInstructors: 0,
        questions: [],
        avgRatings: {
          teachingEffectiveness: 0,
          communicationSkills: 0,
          subjectKnowledge: 0,
          punctuality: 0,
          availability: 0,
          overallRating: 0,
        },
        overallAverageScore: 0,
        minRating: 0,
        maxRating: 0,
      };
    }

    // Collect all data from all sheets, grouped by instructor
    const allRows = [];
    const allHeaders = new Set();
    const instructorData = new Map(); // Map instructor key -> { name, email, questions: Map }
    const instructorCounts = new Map(); // Track unique instructors

    for (const sheetTitle of sheetsToProcess) {
      try {
        // Read a wider range to capture all columns (questions)
        const { data } = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetTitle}!A1:ZZ1000`, // Read up to column ZZ and 1000 rows
        });

        const rows = data.values || [];
        if (rows.length < 2) continue; // Skip if no data rows

        const headers = rows[0] || [];
        const dataRows = rows.slice(1);

        // Log headers for debugging (only once per sheet)
        if (headers.length > 0) {
          console.log(`[${sheetTitle}] Found headers:`, headers.map(h => h.trim()).filter(h => h));
        }

        // Track all headers (questions)
        headers.forEach((header) => {
          if (header && header.trim()) {
            allHeaders.add(header.trim());
          }
        });

        // Helper function to find column value (case-insensitive, flexible matching)
        const findColumnValue = (rowData, possibleNames) => {
          for (const name of possibleNames) {
            // Try exact match first
            if (rowData[name]) return rowData[name];
            // Try case-insensitive match
            const found = Object.keys(rowData).find(key => 
              key.toLowerCase() === name.toLowerCase()
            );
            if (found && rowData[found]) return rowData[found];
          }
          return "";
        };

        const getOverallRatingFromRow = (rowData) => {
          for (const column of OVERALL_RATING_COLUMNS) {
            if (rowData[column]) {
              const numeric = parseFloat(rowData[column]);
              if (!Number.isNaN(numeric) && numeric > 0) {
                return numeric;
              }
            }
          }
          return null;
        };

        // Extract instructor name from sheet title as fallback
        const extractInstructorFromSheetTitle = (sheetTitle) => {
          if (sheetTitle.startsWith("Instructor_") && sheetTitle.endsWith("_Sheet")) {
            return sheetTitle.replace("Instructor_", "").replace("_Sheet", "").replace(/_/g, " ");
          }
          return "";
        };

        const sheetInstructorName = extractInstructorFromSheetTitle(sheetTitle);

        // Process each row
        dataRows.forEach((row) => {
          const rowData = {};
          
          // Handle case where headers might be empty or row might be empty
          if (headers.length === 0 || row.length === 0) {
            console.log(`[${sheetTitle}] Warning: Empty headers or row data. Headers: ${headers.length}, Row: ${row.length}`);
            return; // Skip this row
          }
          
          headers.forEach((header, index) => {
            if (header && header.trim()) {
              rowData[header.trim()] = row[index] || "";
            }
          });
          
          // If rowData is empty after processing, skip this row
          if (Object.keys(rowData).length === 0) {
            console.log(`[${sheetTitle}] Warning: Row data is empty after processing. Skipping row.`);
            return;
          }

          // Get instructor info - try multiple column name variations
          // First check for Instructor ID (most reliable)
          const instructorId = findColumnValue(rowData, [
            "Instructor ID",
            "InstructorId",
            "Instructor_Id",
            "InstructorID",
            "instructor_id"
          ]) || "";

        let instructorName = findColumnValue(rowData, [
            "Instructor Name",
            "Instructor",
            "Name",
            "Instructor's Name",
            "Teacher Name",
            "Professor Name"
        ]) || sheetInstructorName || "";

        let instructorEmail = findColumnValue(rowData, [
            "Instructor Email",
            "Instructor Email Address",
            "Email",
            "Instructor's Email",
            "Teacher Email",
            "Professor Email"
          ]) || "";

        // For newer forms that use "Select Instructor" dropdown (e.g., "Name (email)")
        const selectedInstructor = rowData["Select Instructor"] || rowData["Instructor (Select)"] || "";
        if (selectedInstructor) {
          // Try multiple parsing patterns
          // Pattern 1: "Name (email@domain.com)"
          let match = selectedInstructor.match(/^\s*([^()]+?)(?:\s*\(([^)]+)\))?\s*$/);
          if (match) {
            const parsedName = match[1]?.trim();
            const parsedEmail = match[2]?.trim();
            if (parsedName && parsedName.length > 0) {
              instructorName = parsedName;
            }
            if (parsedEmail && parsedEmail.length > 0 && parsedEmail.includes('@')) {
              instructorEmail = parsedEmail;
            }
          }
          // If parsing failed or didn't extract email, try to extract email from the whole string
          if (!instructorEmail || !instructorEmail.includes('@')) {
            const emailMatch = selectedInstructor.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
            if (emailMatch) {
              instructorEmail = emailMatch[1];
              // If we found email but no name, try to extract name before the email
              if (!instructorName || instructorName === "Unknown") {
                const namePart = selectedInstructor.substring(0, emailMatch.index).trim();
                if (namePart.length > 0) {
                  instructorName = namePart.replace(/[()]/g, '').trim();
                }
              }
            }
          }
          // Final fallback: if we still don't have a name, use the whole string (minus email if found)
          if (!instructorName || instructorName === "Unknown" || instructorName.length === 0) {
            let nameCandidate = selectedInstructor.trim();
            if (instructorEmail) {
              nameCandidate = nameCandidate.replace(instructorEmail, '').replace(/[()]/g, '').trim();
            }
            if (nameCandidate.length > 0) {
              instructorName = nameCandidate;
            }
          }
        }

          // Use sheet title as fallback if no instructor name found
          const finalInstructorName = instructorName || sheetInstructorName || "Unknown";
          // Normalize email for consistent grouping (lowercase, trim)
          const normalizedEmail = instructorEmail ? instructorEmail.toLowerCase().trim() : "";
          // Create a more robust key that handles variations
          // Use email as primary identifier if available, otherwise use name
          const fullKey = instructorId 
            ? `ID_${instructorId}` 
            : normalizedEmail
            ? `EMAIL_${normalizedEmail}`
            : `NAME_${finalInstructorName.toLowerCase().trim()}`;

          // Log instructor info found (for debugging - only first row of each sheet)
          if (dataRows.indexOf(row) === 0) {
            console.log(`[${sheetTitle}] First row - Instructor found:`, {
              instructorId: instructorId || 'none',
              instructorName: instructorName || 'none',
              instructorEmail: instructorEmail || 'none',
              finalInstructorName,
              availableColumns: Object.keys(rowData)
            });
          }
          
          // Log if instructor name is not found (for debugging)
          if (!instructorName && !sheetInstructorName && !instructorId && dataRows.indexOf(row) === 0) {
            console.log(`[${sheetTitle}] Warning: Instructor name/ID not found in row data. Available columns:`, Object.keys(rowData));
            console.log(`[${sheetTitle}] Using fallback instructor name: "${finalInstructorName}"`);
          }

          // Track unique instructors
          if (instructorId || finalInstructorName || instructorEmail) {
            if (!instructorCounts.has(fullKey)) {
              instructorCounts.set(fullKey, true);
            }
          }

          // Initialize instructor data if not exists
          if (!instructorData.has(fullKey)) {
            instructorData.set(fullKey, {
              instructorId: instructorId || "",
              instructorName: finalInstructorName,
              instructorEmail: instructorEmail || "",
              questionAnswers: new Map(), // Map question -> array of answers
              totalResponses: 0,
              respondentIds: new Set(),
              courseSet: new Set(),
              department: "",
              levelTally: {
                undergrad: 0,
                graduate: 0,
              },
              sectionStats: new Map(),
            });
          }

          const instructorInfo = instructorData.get(fullKey);
          instructorInfo.totalResponses++;

          const courseValue = findColumnValue(rowData, [
            "Course",
            "Program",
            "Course/Department",
            "Course & Department",
            "Program/Department",
          ]);
          if (courseValue) {
            instructorInfo.courseSet.add(courseValue.trim());
          }

          const respondentIdentifier =
            findColumnValue(rowData, [
              "Student ID",
              "Student Email",
              "Email Address",
              "Student Name",
              "Name",
            ]) || "";

          if (respondentIdentifier) {
            instructorInfo.respondentIds.add(respondentIdentifier.trim().toLowerCase());
          } else if (rowData["Timestamp"]) {
            instructorInfo.respondentIds.add(`timestamp_${rowData["Timestamp"]}`);
          }

          const levelValue = findColumnValue(rowData, [
            "Student Type",
            "Program Level",
            "Level",
            "Program",
          ]);
          if (levelValue) {
            const normalizedLevel = levelValue.toLowerCase();
            if (normalizedLevel.includes("grad")) {
              instructorInfo.levelTally.graduate += 1;
            } else {
              instructorInfo.levelTally.undergrad += 1;
            }
          }

          // Collect answers for each question, grouped by instructor
          headers.forEach((header, index) => {
            if (header && header.trim() && header.trim() !== "Timestamp") {
              const answer = row[index] || "";
              if (answer && answer.trim()) {
                const question = header.trim();
                if (!instructorInfo.questionAnswers.has(question)) {
                  instructorInfo.questionAnswers.set(question, []);
                }
                instructorInfo.questionAnswers.get(question).push(answer.trim());
              }
            }
          });

          const sectionValue = findColumnValue(rowData, SECTION_COLUMN_CANDIDATES);
          const normalizedSection = sectionValue?.trim() || "Unspecified";
          const overallRatingValue = getOverallRatingFromRow(rowData);
          if (!instructorInfo.sectionStats.has(normalizedSection)) {
            instructorInfo.sectionStats.set(normalizedSection, { sectionCode: normalizedSection, respondents: 0, ratingSum: 0 });
          }
          const sectionStat = instructorInfo.sectionStats.get(normalizedSection);
          sectionStat.respondents += 1;
          if (Number.isFinite(overallRatingValue)) {
            sectionStat.ratingSum += overallRatingValue;
          }

          allRows.push(rowData);
        });
      } catch (error) {
        console.error(`Error reading sheet ${sheetTitle}:`, error);
        // Continue with other sheets even if one fails
      }
    }

    if (allRows.length === 0) {
      return {
        totalResponses: 0,
        totalInstructors: 0,
        instructors: [],
        avgRatings: {
          teachingEffectiveness: 0,
          communicationSkills: 0,
          subjectKnowledge: 0,
          punctuality: 0,
          availability: 0,
          overallRating: 0,
        },
        overallAverageScore: 0,
        minRating: 0,
        maxRating: 0,
      };
    }

    // Calculate overall statistics
    const totalResponses = allRows.length;
    const totalInstructors = instructorCounts.size;

    // Calculate averages for rating categories (if they exist)
    const avgRatings = {
      teachingEffectiveness: 0,
      communicationSkills: 0,
      subjectKnowledge: 0,
      punctuality: 0,
      availability: 0,
      overallRating: 0,
    };

    const ratingKeys = Object.keys(avgRatings);
    ratingKeys.forEach((key) => {
      const headerName = key
        .replace(/([A-Z])/g, " $1")
        .trim()
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(" ");
      
      // Try multiple possible column name variations
      const possibleColumnNames = [
        headerName,
        key,
        `Rate the instructor (1-5)`, // Common Google Form rating column
        `Rating`,
        `Instructor Rating`,
      ];
      
      let values = [];
      for (const colName of possibleColumnNames) {
        const foundValues = allRows
          .map((row) => {
            const val = row[colName] || "";
            return parseFloat(val) || 0;
          })
          .filter((v) => v > 0);
        if (foundValues.length > 0) {
          values = foundValues;
          break; // Use the first column that has values
        }
      }
      
      if (values.length > 0) {
        avgRatings[key] = values.reduce((sum, val) => sum + val, 0) / values.length;
      }
    });

    // Calculate overall average score
    const ratingValues = Object.values(avgRatings).filter((v) => v > 0);
    const overallAverageScore =
      ratingValues.length > 0
        ? ratingValues.reduce((sum, val) => sum + val, 0) / ratingValues.length
        : 0;

    // Get min and max overall ratings
    // Try multiple possible column names for ratings
    const ratingColumnNames = [
      "Overall Rating",
      "Rate the instructor (1-5)",
      "Rating",
      "Instructor Rating",
      "Overall",
    ];
    
    let overallRatings = [];
    for (const colName of ratingColumnNames) {
      const ratings = allRows
        .map((row) => {
          const val = row[colName] || "";
          return parseFloat(val) || 0;
        })
        .filter((r) => r > 0);
      if (ratings.length > 0) {
        overallRatings = ratings;
        break; // Use the first column that has ratings
      }
    }
    
    const minRating = overallRatings.length > 0 ? Math.min(...overallRatings) : 0;
    const maxRating = overallRatings.length > 0 ? Math.max(...overallRatings) : 0;

    // Build questions summary grouped by instructor
    const excludeHeaders = [
      "Timestamp",
      "Instructor Name",
      "Instructor",
      "Instructor Email",
      "Instructor Email Address",
      "Instructor ID",
      "InstructorId",
      "Instructor_Id",
      "InstructorID",
      "instructor_id",
      "Name", // Student name
      "Course",
      "Semester",
      "Academic Year",
      "Student ID",
      "Student Email",
      "Is Anonymous",
      "Subject", // Subject is metadata, not a question
    ];

    // Try to find instructor IDs in the data and fetch from database
    try {
      // First, try to match spreadsheet to GoogleForm records to get instructor info
      const googleForms = await GoogleForm.find({ 
        spreadsheetId: spreadsheetId 
      }).populate('instructorId', 'name email');
      
      // Create a map of sheet title to instructor (if forms are linked to specific sheets)
      const sheetToInstructorMap = new Map();
      googleForms.forEach(form => {
        if (form.spreadsheetId === spreadsheetId && form.instructorId) {
          // If form has instructor info, map it
          const instructor = form.instructorId;
          sheetToInstructorMap.set(form.formId, {
            instructorId: instructor._id.toString(),
            instructorName: form.instructorName || (instructor.name || 'Unknown'),
            instructorEmail: form.instructorEmail || instructor.email || ''
          });
        }
      });
      
      // If we have Google Forms linked to this spreadsheet, use the first one's instructor as default
      let defaultInstructor = null;
      if (googleForms.length > 0 && googleForms[0].instructorId) {
        const firstForm = googleForms[0];
        defaultInstructor = {
          instructorId: firstForm.instructorId._id.toString(),
          instructorName: firstForm.instructorName || (firstForm.instructorId.name || 'Unknown'),
          instructorEmail: firstForm.instructorEmail || firstForm.instructorId.email || ''
        };
      }
      
      // Fetch all instructors from database
      const allInstructors = await Instructor.find({});
      const allUsers = await User.find({ role: 'instructor' });
      
      // Create maps for quick lookup
      const instructorByEmail = new Map();
      const instructorByName = new Map();
      const instructorById = new Map();
      
      // Map instructors by email, name, and ID
      allInstructors.forEach(inst => {
        if (inst.email) instructorByEmail.set(inst.email.toLowerCase(), inst);
        if (inst.name) instructorByName.set(inst.name.toLowerCase(), inst);
        instructorById.set(inst._id.toString(), inst);
      });
      
      // Map users by email and ID (User model doesn't have name field)
      allUsers.forEach(user => {
        if (user.email) {
          // Only add if not already in map (prefer Instructor model)
          if (!instructorByEmail.has(user.email.toLowerCase())) {
            instructorByEmail.set(user.email.toLowerCase(), user);
          }
        }
        instructorById.set(user._id.toString(), user);
      });
      
      // If we have a default instructor from Google Forms and no instructor data found, use it
      if (defaultInstructor && instructorData.size === 0) {
        instructorData.set('default', {
          instructorId: defaultInstructor.instructorId,
          instructorName: defaultInstructor.instructorName,
          instructorEmail: defaultInstructor.instructorEmail,
          questionAnswers: new Map(),
          totalResponses: 0,
        });
      }

      // Update instructor data with database information
      Array.from(instructorData.entries()).forEach(([key, instructorInfo]) => {
        // If instructor is "Unknown" and we have a default instructor from Google Forms, use it
        if (instructorInfo.instructorName === "Unknown" && defaultInstructor) {
          instructorInfo.instructorId = defaultInstructor.instructorId;
          instructorInfo.instructorName = defaultInstructor.instructorName;
          instructorInfo.instructorEmail = defaultInstructor.instructorEmail;
        }
        
        // First, try to find instructor by ID (most reliable)
        if (instructorInfo.instructorId) {
          const found = instructorById.get(instructorInfo.instructorId);
          if (found) {
            // Instructor model has 'name', User model doesn't
            if (found.name) {
              instructorInfo.instructorName = found.name;
            }
            if (found.email) {
              instructorInfo.instructorEmail = found.email;
            }
            instructorInfo.instructorId = found._id.toString();
            if (found.department) {
              instructorInfo.department = found.department;
            }
            if (Array.isArray(found.courses)) {
              found.courses.forEach((course) => {
                if (course) {
                  instructorInfo.courseSet.add(course);
                }
              });
            }
          }
        }
        
        // Try to find instructor by email if ID didn't work
        if (!instructorInfo.instructorId && instructorInfo.instructorEmail) {
          const found = instructorByEmail.get(instructorInfo.instructorEmail.toLowerCase());
          if (found) {
            // Instructor model has 'name', User model doesn't
            if (found.name) {
              instructorInfo.instructorName = found.name;
            }
            if (found.email) {
              instructorInfo.instructorEmail = found.email;
            }
            instructorInfo.instructorId = found._id.toString();
            if (found.department) {
              instructorInfo.department = found.department;
            }
            if (Array.isArray(found.courses)) {
              found.courses.forEach((course) => {
                if (course) {
                  instructorInfo.courseSet.add(course);
                }
              });
            }
          }
        }
        
        // Try to find by name if email didn't work (only works with Instructor model)
        if (!instructorInfo.instructorId && instructorInfo.instructorName && instructorInfo.instructorName !== "Unknown") {
          const found = instructorByName.get(instructorInfo.instructorName.toLowerCase());
          if (found) {
            instructorInfo.instructorName = found.name || instructorInfo.instructorName;
            if (found.email) {
              instructorInfo.instructorEmail = found.email;
            }
            instructorInfo.instructorId = found._id.toString();
            if (found.department) {
              instructorInfo.department = found.department;
            }
            if (Array.isArray(found.courses)) {
              found.courses.forEach((course) => {
                if (course) {
                  instructorInfo.courseSet.add(course);
                }
              });
            }
          }
        }
        
        // Final fallback: if still "Unknown" and we have default instructor, use it
        if (instructorInfo.instructorName === "Unknown" && defaultInstructor) {
          instructorInfo.instructorId = defaultInstructor.instructorId;
          instructorInfo.instructorName = defaultInstructor.instructorName;
          instructorInfo.instructorEmail = defaultInstructor.instructorEmail;
        }
      });
    } catch (error) {
      console.error("Error fetching instructor details from database:", error);
      // Continue without database lookup
    }

    const instructorIdsForTotals = Array.from(instructorData.values())
      .map((info) => info.instructorId)
      .filter((id) => id && mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    // Helper function to normalize section codes for matching
    const normalizeSectionCode = (code) => {
      if (!code) return "";
      return String(code).trim().toLowerCase();
    };

    let sectionTotalsMap = new Map();
    let instructorSectionsMap = new Map(); // Map instructorId -> Map(normalizedSectionCode -> originalSectionCode)
    let studentSectionCodeMap = new Map(); // Map instructorId -> Map(normalizedSectionCode -> originalSectionCode) from Student collection
    if (instructorIdsForTotals.length > 0) {
      try {
        // Fetch all sections from Section model for each instructor (with original case)
        const allSections = await Section.find({
          instructorId: { $in: instructorIdsForTotals },
        }).lean();

        allSections.forEach((section) => {
          const instructorId = section.instructorId.toString();
          const normalizedSectionCode = normalizeSectionCode(section.sectionCode);
          if (!instructorSectionsMap.has(instructorId)) {
            instructorSectionsMap.set(instructorId, new Map());
          }
          // Store original section code for display
          instructorSectionsMap.get(instructorId).set(normalizedSectionCode, section.sectionCode);
        });

        // Fetch total students per section from Student collection
        const totals = await Student.aggregate([
          { $match: { instructorId: { $in: instructorIdsForTotals } } },
          {
            $group: {
              _id: { instructorId: "$instructorId", section: "$section" },
              totalStudents: { $sum: 1 },
            },
          },
        ]);

        sectionTotalsMap = new Map(
          totals.map((row) => {
            const normalizedSection = normalizeSectionCode(row._id.section || "Unspecified");
            return [
              `${row._id.instructorId.toString()}__${normalizedSection}`,
              row.totalStudents,
            ];
          })
        );

        // Fetch all student section codes once to get original case
        const studentsWithSections = await Student.find({
          instructorId: { $in: instructorIdsForTotals },
          section: { $exists: true, $ne: null, $ne: "" },
        })
          .select("instructorId section")
          .lean();

        studentsWithSections.forEach((student) => {
          if (student.section) {
            const instructorId = student.instructorId.toString();
            const normalized = normalizeSectionCode(student.section);
            if (!studentSectionCodeMap.has(instructorId)) {
              studentSectionCodeMap.set(instructorId, new Map());
            }
            if (!studentSectionCodeMap.get(instructorId).has(normalized)) {
              studentSectionCodeMap.get(instructorId).set(normalized, student.section);
            }
          }
        });
      } catch (err) {
        console.warn("Unable to aggregate student totals per section:", err?.message || err);
      }
    }

    // Debug: Log all instructor keys found
    console.log(`[getOverallSummary] Found ${instructorData.size} unique instructor groups:`, 
      Array.from(instructorData.keys()).slice(0, 10)); // Log first 10 keys
    
    const instructors = Array.from(instructorData.entries()).map(([key, instructorInfo]) => {
      const questions = Array.from(instructorInfo.questionAnswers.entries())
        .map(([question, answers]) => {
          // Calculate statistics for numeric answers
          const numericAnswers = answers
            .map((a) => parseFloat(a))
            .filter((a) => !isNaN(a) && a > 0);
          
          const stats = {
            totalAnswers: answers.length,
            numericCount: numericAnswers.length,
            average: 0,
            min: 0,
            max: 0,
          };

          if (numericAnswers.length > 0) {
            stats.average = Math.round((numericAnswers.reduce((sum, val) => sum + val, 0) / numericAnswers.length) * 100) / 100;
            stats.min = Math.min(...numericAnswers);
            stats.max = Math.max(...numericAnswers);
          }

          // Get unique text answers (for non-numeric questions)
          const uniqueTextAnswers = [...new Set(answers.filter((a) => {
            const num = parseFloat(a);
            return isNaN(num) || num === 0;
          }))];

          return {
            question,
            totalAnswers: answers.length,
            answers: answers.slice(0, 50), // Limit to first 50 answers for display
            allAnswersCount: answers.length,
            stats,
            uniqueTextAnswers: uniqueTextAnswers.slice(0, 20), // Show up to 20 unique text answers
          };
        })
        .filter((q) => {
          // Exclude metadata columns, but be more lenient - include rating columns even if they match some metadata names
          const questionLower = q.question.toLowerCase();
          // Don't exclude if it's clearly a rating/question column
          if (questionLower.includes('rating') || questionLower.includes('rate') || questionLower.includes('(1-5)') || questionLower.includes('effectiveness') || questionLower.includes('skills') || questionLower.includes('knowledge') || questionLower.includes('punctuality') || questionLower.includes('availability')) {
            return true;
          }
          return !excludeHeaders.includes(q.question);
        }) // Exclude metadata columns
        .sort((a, b) => b.totalAnswers - a.totalAnswers); // Sort by number of answers

      const categoryBreakdown = buildCategoryBreakdown(questions);
      const facultyReclassificationScore = categoryBreakdown.totalAverage
        ? Math.round((categoryBreakdown.totalAverage / 5) * 100)
        : 0;

      // Build section summary: start with sections that have responses
      const sectionSummaryMap = new Map();
      if (instructorInfo.sectionStats) {
        Array.from(instructorInfo.sectionStats.values()).forEach((section) => {
          const sectionCode = section.sectionCode || "Unspecified";
          const normalizedSection = normalizeSectionCode(sectionCode);
          const instructorIdString = instructorInfo.instructorId?.toString();
          
          // Try to find matching total students using normalized section code
          let totalStudents = 0;
          if (instructorIdString) {
            const totalKey = `${instructorIdString}__${normalizedSection}`;
            if (sectionTotalsMap.has(totalKey)) {
              totalStudents = sectionTotalsMap.get(totalKey);
            } else {
              // Try case-insensitive matching
              for (const [key, value] of sectionTotalsMap.entries()) {
                const [instId, sectionCodeFromKey] = key.split("__");
                if (instId === instructorIdString && normalizeSectionCode(sectionCodeFromKey) === normalizedSection) {
                  totalStudents = value;
                  break;
                }
              }
            }
          }
          
          const average =
            section.respondents > 0
              ? Math.round((section.ratingSum / section.respondents) * 100) / 100
              : 0;
          
          // Store with original section code (not normalized) for display
          sectionSummaryMap.set(normalizedSection, {
            sectionCode: sectionCode, // Keep original case for display
            respondents: section.respondents,
            totalStudents,
            average,
          });
        });
      }

      // Add all sections from Section model and Student collection that don't have responses
      if (instructorInfo.instructorId) {
        const instructorIdString = instructorInfo.instructorId.toString();
        const instructorSectionCodes = instructorSectionsMap.get(instructorIdString) || new Map();
        
        // First, add all sections from Section model (all sections for this instructor)
        instructorSectionCodes.forEach((originalSectionCode, normalizedSectionCode) => {
          if (!sectionSummaryMap.has(normalizedSectionCode)) {
            const totalKey = `${instructorIdString}__${normalizedSectionCode}`;
            const totalStudents = sectionTotalsMap.has(totalKey) ? sectionTotalsMap.get(totalKey) : 0;
            
            sectionSummaryMap.set(normalizedSectionCode, {
              sectionCode: originalSectionCode, // Use original case from Section model
              respondents: 0,
              totalStudents,
              average: 0,
            });
          } else {
            // Update existing entry with original section code if we have it
            const existing = sectionSummaryMap.get(normalizedSectionCode);
            existing.sectionCode = originalSectionCode;
            sectionSummaryMap.set(normalizedSectionCode, existing);
          }
        });
        
        // Then, add sections from Student collection (sections with students but no responses)
        // This handles cases where a section has students but isn't in the Section model
        const studentSectionCodes = studentSectionCodeMap.get(instructorIdString) || new Map();
        sectionTotalsMap.forEach((totalStudents, key) => {
          const [instId, normalizedSectionCode] = key.split("__");
          if (instId === instructorIdString) {
            if (!sectionSummaryMap.has(normalizedSectionCode)) {
              // Get original section code from Student collection if available
              const originalSectionCode = studentSectionCodes.get(normalizedSectionCode) || normalizedSectionCode;
              sectionSummaryMap.set(normalizedSectionCode, {
                sectionCode: originalSectionCode,
                respondents: 0,
                totalStudents,
                average: 0,
              });
            } else {
              const existing = sectionSummaryMap.get(normalizedSectionCode);
              if (!existing.totalStudents || existing.totalStudents === 0) {
                existing.totalStudents = totalStudents;
                sectionSummaryMap.set(normalizedSectionCode, existing);
              }
            }
          }
        });
        
        // Update section codes in summary with original case from Student collection (only if not already set from Section model)
        sectionSummaryMap.forEach((summary, normalizedKey) => {
          if (studentSectionCodes.has(normalizedKey) && !instructorSectionCodes.has(normalizedKey)) {
            summary.sectionCode = studentSectionCodes.get(normalizedKey);
          }
        });
      }

      // Convert to array and sort by section code
      const sectionSummary = Array.from(sectionSummaryMap.values())
        .sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));

      return {
        instructorId: instructorInfo.instructorId || "",
        instructorName: instructorInfo.instructorName,
        instructorEmail: instructorInfo.instructorEmail,
        totalResponses: instructorInfo.totalResponses,
        uniqueRespondents: instructorInfo.respondentIds ? instructorInfo.respondentIds.size : instructorInfo.totalResponses,
        courses: Array.from(instructorInfo.courseSet || []),
        department: instructorInfo.department || "",
        undergradRespondents: instructorInfo.levelTally?.undergrad || 0,
        graduateRespondents: instructorInfo.levelTally?.graduate || 0,
        facultyReclassificationScore,
        categoryBreakdown,
        totalAverage: categoryBreakdown.totalAverage,
        descriptiveRating: categoryBreakdown.descriptiveRating,
        sectionSummary,
        questions,
      };
    })
    .filter((instructor) => {
      // Include instructors that have responses (they should have data even if question parsing failed)
      // Also log if an instructor is being filtered out
      if (instructor.totalResponses === 0) {
        console.log(`[getOverallSummary] Filtering out instructor "${instructor.instructorName}" - no responses`);
        return false;
      }
      if (instructor.questions.length === 0 && instructor.totalResponses > 0) {
        console.log(`[getOverallSummary] Warning: Instructor "${instructor.instructorName}" has ${instructor.totalResponses} responses but no questions parsed. Including anyway.`);
      }
      return instructor.totalResponses > 0; // Include if they have any responses
    })
    .sort((a, b) => b.totalResponses - a.totalResponses); // Sort by total responses

    // Debug: Log final instructor count
    console.log(`[getOverallSummary] Returning ${instructors.length} instructors after filtering (from ${instructorData.size} groups)`);
    if (instructors.length > 0) {
      console.log(`[getOverallSummary] Sample instructors:`, instructors.slice(0, 3).map(i => ({
        name: i.instructorName,
        email: i.instructorEmail,
        department: i.department,
        responses: i.totalResponses,
        questions: i.questions.length
      })));
    }

    return {
      totalResponses,
      totalInstructors: instructors.length, // Use actual filtered count
      instructors, // Grouped by instructor
      avgRatings: {
        teachingEffectiveness: Math.round(avgRatings.teachingEffectiveness * 100) / 100,
        communicationSkills: Math.round(avgRatings.communicationSkills * 100) / 100,
        subjectKnowledge: Math.round(avgRatings.subjectKnowledge * 100) / 100,
        punctuality: Math.round(avgRatings.punctuality * 100) / 100,
        availability: Math.round(avgRatings.availability * 100) / 100,
        overallRating: Math.round(avgRatings.overallRating * 100) / 100,
      },
      overallAverageScore: Math.round(overallAverageScore * 100) / 100,
      minRating: Math.round(minRating * 100) / 100,
      maxRating: Math.round(maxRating * 100) / 100,
      descriptiveRating: getDescriptiveRating(overallAverageScore),
      formTitle:
        resolvedEvaluationForm?.title ||
        (formId ? "Evaluation Form Summary" : "All Evaluation Forms"),
      formDescription: resolvedEvaluationForm?.description || "",
      responseSheetName: resolvedSheetName,
    };
  } catch (error) {
    console.error("Error fetching overall summary:", error);
    throw error;
  }
}

/**
 * Get summary data for a specific evaluation form
 * @param {string} formId - Required Google Form ID or EvaluationForm ID
 * @returns {Promise<Object>} Summary data for the specific form
 */
async function getFormSpecificSummary(formId) {
  if (!formId) {
    throw new Error("Form ID is required for getFormSpecificSummary");
  }

  return await getOverallSummary(formId);
}

/**
 * Get section summary for an instructor's evaluation report
 * Lists all section codes from instructor's students and calculates respondent counts and averages
 * @param {string} formId - Evaluation form ID
 * @param {string} instructorEmail - Instructor email
 * @param {string} [subjectCode] - Optional subject code filter
 * @returns {Promise<Array>} Array of section summary objects
 */
async function getInstructorSectionSummary(formId, instructorEmail, subjectCode = null) {
  if (!formId || !instructorEmail) {
    throw new Error("Form ID and instructor email are required");
  }

  // Find the instructor user
  const instructorUser = await User.findOne({
    email: instructorEmail.toLowerCase().trim(),
    role: "instructor"
  });

  if (!instructorUser) {
    return [];
  }

  // Get all students for this instructor
  const students = await Student.find({ instructorId: instructorUser._id })
    .populate('sectionId', 'sectionCode course yearLevel subjectCode')
    .lean();

  console.log(`[Section Summary] Found ${students.length} students for instructor ${instructorEmail}`);

  // Get all unique section codes from the instructor's students
  // Group by section code only - one row per section code
  const sectionMap = new Map(); // key: sectionCode -> { sectionCode, students: [], subjectCodes: Set }
  
  students.forEach(student => {
    // Get section code from populated sectionId first, then fallback to legacy section field
    const sectionCode = (student.sectionId && student.sectionId.sectionCode) 
      ? student.sectionId.sectionCode.trim() 
      : (student.section ? student.section.trim() : null);
    
    if (!sectionCode) {
      console.warn(`[Section Summary] Student ${student._id} has no valid section code`);
      return;
    }
    
    if (!sectionMap.has(sectionCode)) {
      sectionMap.set(sectionCode, {
        sectionCode,
        students: [],
        subjectCodes: new Set()
      });
    }
    
    const sectionData = sectionMap.get(sectionCode);
    sectionData.students.push(student);
    
    // Track subject codes for this section
    const studentSubjectCode = (student.subject && student.subject.trim()) 
      ? student.subject.trim() 
      : (student.sectionId && student.sectionId.subjectCode 
          ? student.sectionId.subjectCode.trim() 
          : '');
    if (studentSubjectCode) {
      sectionData.subjectCodes.add(studentSubjectCode);
    }
  });

  console.log(`[Section Summary] Found ${sectionMap.size} unique section codes from students:`, Array.from(sectionMap.keys()));
  
  // Log student counts per section
  sectionMap.forEach((sectionData, sectionCode) => {
    console.log(`[Section Summary] Section "${sectionCode}" has ${sectionData.students.length} students`);
  });

  // Get responses from Google Sheets
  let spreadsheetId = getSpreadsheetId();
  let targetSheetTitles = null;
  let sheets = null;

  try {
    const resolved = await resolveSpreadsheetForEvaluationForm(formId);
    spreadsheetId = resolved.spreadsheetId;
    const specifiedSheetName = resolved.sheetName || "Form Responses 1";
    
    // Get all sheets to find all "Form Responses" sheets (data might be in different sheets)
    sheets = await getSheetsClient();
    const { data: spreadsheetData } = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheets = spreadsheetData?.sheets || [];
    
    // Find all "Form Responses" sheets
    const formResponseSheets = allSheets
      .map((sheet) => sheet?.properties?.title || "")
      .filter((title) => {
        const titleLower = title.toLowerCase();
        return titleLower.includes("form responses") || titleLower.includes("responses");
      });
    
    // Use the specified sheet if found, otherwise use all Form Responses sheets
    if (formResponseSheets.includes(specifiedSheetName)) {
      targetSheetTitles = [specifiedSheetName];
      console.log(`[Section Summary] Using specified sheet: ${specifiedSheetName}`);
    } else if (formResponseSheets.length > 0) {
      targetSheetTitles = formResponseSheets;
      console.log(`[Section Summary] Specified sheet "${specifiedSheetName}" not found. Using all Form Responses sheets:`, formResponseSheets);
    } else {
      targetSheetTitles = [specifiedSheetName];
      console.log(`[Section Summary] No Form Responses sheets found, using specified sheet: ${specifiedSheetName}`);
    }
  } catch (error) {
    console.error(`[Section Summary] Unable to resolve spreadsheet for form ${formId}:`, error.message || error);
    // Return section summary with zero respondents if we can't access the sheet
    const sectionSummary = [];
    sectionMap.forEach((sectionData, sectionCode) => {
      // Count students for this section, optionally filtered by subject code
      let studentsForSection = sectionData.students;
      if (subjectCode) {
        studentsForSection = studentsForSection.filter(student => {
          const studentSubjectCode = (student.subject && student.subject.trim()) 
            ? student.subject.trim() 
            : (student.sectionId && student.sectionId.subjectCode 
                ? student.sectionId.subjectCode.trim() 
                : '');
          return studentSubjectCode.toLowerCase().trim() === subjectCode.toLowerCase().trim();
        });
      }
      
      sectionSummary.push({
        sectionCode: sectionCode,
        subjectCode: subjectCode || '',
        totalStudents: studentsForSection.length,
        respondents: 0,
        average: 0
      });
    });
    return sectionSummary.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));
  }

  if (!targetSheetTitles || targetSheetTitles.length === 0) {
    console.error(`[Section Summary] No sheets to process`);
    return Array.from(sectionMap.values()).map((sectionData, sectionCode) => ({
      sectionCode: sectionCode,
      subjectCode: subjectCode || '',
      totalStudents: sectionData.students.length,
      respondents: 0,
      average: 0
    }));
  }

  // Get sheets client if not already obtained
  if (!sheets) {
    sheets = await getSheetsClient();
  }
  
  if (!sheets) {
    console.error(`[Section Summary] Failed to get sheets client`);
    return Array.from(sectionMap.values()).map((sectionData, sectionCode) => ({
      sectionCode: sectionCode,
      subjectCode: subjectCode || '',
      totalStudents: sectionData.students.length,
      respondents: 0,
      average: 0
    }));
  }
  
  const allResponses = [];

  // Read responses from the sheet(s)
  for (const sheetTitle of targetSheetTitles) {
    try {
      if (!sheets) {
        throw new Error('Sheets client is not available');
      }
      const { data } = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${sheetTitle}!A1:ZZ1000`,
      });

      const rows = data.values || [];
      if (rows.length < 2) continue;

      const headers = rows[0] || [];
      const dataRows = rows.slice(1);

      // Helper function to find column value
      const findColumnValue = (rowData, possibleNames) => {
        for (const name of possibleNames) {
          if (rowData[name]) return rowData[name];
          const found = Object.keys(rowData).find(key => 
            key.toLowerCase() === name.toLowerCase()
          );
          if (found && rowData[found]) return rowData[found];
        }
        return "";
      };

      dataRows.forEach((row) => {
        const rowData = {};
        headers.forEach((header, index) => {
          if (header && header.trim()) {
            rowData[header.trim()] = row[index] || "";
          }
        });

        // Check if this response matches the instructor
        // First try to get instructor email from dedicated email columns
        let responseInstructorEmail = findColumnValue(rowData, [
          "Instructor Email",
          "Instructor Email Address",
          "Email",
          "Instructor's Email",
        ]).toLowerCase().trim();

        // If no email found, try to parse from "Select Instructor" column (format: "Name (email)")
        if (!responseInstructorEmail) {
          const selectedInstructor = findColumnValue(rowData, [
            "Select Instructor",
            "Instructor (Select)",
          ]);
          if (selectedInstructor) {
            // Parse format: "Name (email@example.com)" or "Name (email" (handles truncated emails)
            // Try full email first: "Name (email@domain.com)"
            let emailMatch = selectedInstructor.match(/\(([^)]+@[^)]+)\)/);
            if (!emailMatch) {
              // Try truncated email: "Name (email" (no closing parenthesis)
              emailMatch = selectedInstructor.match(/\(([^@)]+@[^)]*)/);
            }
            if (emailMatch && emailMatch[1]) {
              responseInstructorEmail = emailMatch[1].toLowerCase().trim();
              // If email is truncated, try to match by checking if it starts with the instructor email
              if (!responseInstructorEmail.includes('@') || responseInstructorEmail.length < instructorEmail.length) {
                const instructorEmailStart = instructorEmail.toLowerCase().trim().substring(0, responseInstructorEmail.length);
                if (instructorEmailStart === responseInstructorEmail) {
                  responseInstructorEmail = instructorEmail.toLowerCase().trim();
                }
              }
            }
          }
        }

        const normalizedInstructorEmail = instructorEmail.toLowerCase().trim();
        // Check if emails match (handle truncated emails in Google Sheets)
        // Emails match if they're exactly the same, or if one is a prefix of the other
        const emailsMatch = responseInstructorEmail && (
          responseInstructorEmail === normalizedInstructorEmail ||
          normalizedInstructorEmail.startsWith(responseInstructorEmail) ||
          responseInstructorEmail.startsWith(normalizedInstructorEmail)
        );
        
        if (!emailsMatch) {
          // Log first few mismatches for debugging
          if (allResponses.length < 3) {
            console.log(`[Section Summary] Skipping response - email mismatch. Expected: "${normalizedInstructorEmail}", Found: "${responseInstructorEmail || 'none'}"`);
          }
          return; // Skip if not matching instructor
        }
        
        // Log successful match for first few responses
        if (allResponses.length < 3) {
          console.log(`[Section Summary] Matched instructor email: "${responseInstructorEmail}" === "${normalizedInstructorEmail}"`);
        }

        // Get section code and subject code from response
        const responseSectionCode = findColumnValue(rowData, SECTION_COLUMN_CANDIDATES).trim();
        const responseSubjectCode = findColumnValue(rowData, SUBJECT_COLUMN_CANDIDATES).trim();

        // Log first few responses for debugging
        if (allResponses.length < 3) {
          console.log(`[Section Summary] Response ${allResponses.length + 1}: section="${responseSectionCode}", subject="${responseSubjectCode}", instructor="${responseInstructorEmail}"`);
        }

        // If subjectCode filter is provided, only include matching responses
        if (subjectCode && responseSubjectCode.toLowerCase().trim() !== subjectCode.toLowerCase().trim()) {
          return;
        }


        // Get all rating values from the response (ignore comments and metadata)
        const excludeHeaders = [
          "Timestamp",
          "Instructor Name",
          "Instructor",
          "Instructor Email",
          "Instructor Email Address",
          "Instructor ID",
          "InstructorId",
          "Instructor_Id",
          "InstructorID",
          "instructor_id",
          "Name",
          "Course",
          "Semester",
          "Academic Year",
          "Student ID",
          "Student Email",
          "Is Anonymous",
          "Subject",
          "Section Code",
          "Section",
          "Class Section",
          "Section Name",
          "Section/Code",
          "Subject Code",
          "Subject",
          "Course Code",
          "Select Instructor",
          "Instructor (Select)",
        ];
        
        const ratingValues = [];
        headers.forEach((header) => {
          if (!header || !header.trim()) return;
          
          const headerLower = header.toLowerCase().trim();
          const isExcluded = excludeHeaders.some(excluded => 
            headerLower === excluded.toLowerCase() || headerLower.includes(excluded.toLowerCase())
          );
          
          // Also exclude text fields (comments, feedback, etc.)
          const isTextField = headerLower.includes('comment') || 
                             headerLower.includes('feedback') || 
                             headerLower.includes('suggestion') ||
                             headerLower.includes('remark') ||
                             headerLower.includes('note');
          
          if (!isExcluded && !isTextField) {
            const value = rowData[header.trim()];
            if (value) {
              const numeric = parseFloat(value);
              if (!Number.isNaN(numeric) && numeric > 0 && numeric <= 5) {
                ratingValues.push(numeric);
              }
            }
          }
        });

        if (ratingValues.length > 0) {
          allResponses.push({
            sectionCode: responseSectionCode,
            subjectCode: responseSubjectCode,
            ratingValues
          });
          if (allResponses.length <= 3) {
            console.log(`[Section Summary] Added response: section="${responseSectionCode}", subject="${responseSubjectCode}", ${ratingValues.length} rating values:`, ratingValues.slice(0, 5));
          }
        } else {
          console.warn(`[Section Summary] No rating values found for response with section: "${responseSectionCode}", subject: "${responseSubjectCode}"`);
          // Log available headers to help debug
          if (allResponses.length === 0) {
            console.log(`[Section Summary] Available headers in response:`, headers.filter(h => h && h.trim()).slice(0, 20));
          }
        }
      });
    } catch (error) {
      console.error(`[Section Summary] Error reading sheet ${sheetTitle}:`, error);
    }
  }

  console.log(`[Section Summary] Found ${allResponses.length} responses from Google Sheets`);
  
  // Log section codes found in responses
  const responseSectionCodes = new Set();
  allResponses.forEach(response => {
    if (response.sectionCode) {
      responseSectionCodes.add(response.sectionCode.toLowerCase().trim());
    }
  });
  console.log(`[Section Summary] Section codes in responses:`, Array.from(responseSectionCodes));

  // Calculate average per subject code (across all sections for that subject code)
  const subjectCodeAverages = new Map(); // key: subjectCode -> average
  
  // Group all responses by subject code
  const responsesBySubjectCode = new Map();
  allResponses.forEach(response => {
    const subjCode = (response.subjectCode || '').trim();
    if (!responsesBySubjectCode.has(subjCode)) {
      responsesBySubjectCode.set(subjCode, []);
    }
    responsesBySubjectCode.get(subjCode).push(...response.ratingValues);
  });

  // Calculate average for each subject code
  responsesBySubjectCode.forEach((ratingValues, subjCode) => {
    if (ratingValues.length > 0) {
      const average = ratingValues.reduce((sum, val) => sum + val, 0) / ratingValues.length;
      const roundedAverage = Math.round(average * 100) / 100;
      subjectCodeAverages.set(subjCode, roundedAverage);
      console.log(`[Section Summary] Average for subject code "${subjCode}": ${roundedAverage} (from ${ratingValues.length} rating values)`);
    }
  });

  // Build section summary - list ALL section codes (one row per section code)
  const sectionSummary = [];
  sectionMap.forEach((sectionData, sectionCode) => {
    // Count total students for this section, optionally filtered by subject code
    let studentsForSection = sectionData.students;
    if (subjectCode) {
      studentsForSection = studentsForSection.filter(student => {
        const studentSubjectCode = (student.subject && student.subject.trim()) 
          ? student.subject.trim() 
          : (student.sectionId && student.sectionId.subjectCode 
              ? student.sectionId.subjectCode.trim() 
              : '');
        return studentSubjectCode.toLowerCase().trim() === subjectCode.toLowerCase().trim();
      });
    }
    const totalStudents = studentsForSection.length;
    
    // Count respondents for this section from Google Sheets
    // If subject code filter is provided, only count responses with that subject code
    const normalizedSectionCode = sectionCode.toLowerCase().trim();
    const normalizedSubjectCodeFilter = subjectCode ? subjectCode.toLowerCase().trim() : null;
    
    const matchingResponses = allResponses.filter(response => {
      const responseSection = (response.sectionCode || '').toLowerCase().trim();
      const sectionMatch = responseSection === normalizedSectionCode;
      
      // If subject code filter is provided, only match responses with that subject code
      if (normalizedSubjectCodeFilter) {
        const responseSubject = (response.subjectCode || '').toLowerCase().trim();
        return sectionMatch && responseSubject === normalizedSubjectCodeFilter;
      }
      
      return sectionMatch;
    });
    const respondents = matchingResponses.length;
    
    // Log detailed matching info for debugging
    if (respondents === 0 && allResponses.length > 0) {
      const responseSections = allResponses.map(r => r.sectionCode).filter(Boolean);
      console.log(`[Section Summary] WARNING: No responses matched section "${sectionCode}" (normalized: "${normalizedSectionCode}")`);
      console.log(`[Section Summary] Available section codes in responses:`, [...new Set(responseSections)]);
    }
    
    console.log(`[Section Summary] Section "${sectionCode}": ${totalStudents} students, ${respondents} respondents`);
    
    // Calculate average from responses that match THIS specific section code
    // Get all rating values from responses that match this section
    let average = 0;
    const sectionRatingValues = [];
    matchingResponses.forEach(response => {
      sectionRatingValues.push(...response.ratingValues);
    });
    
    if (sectionRatingValues.length > 0) {
      average = sectionRatingValues.reduce((sum, val) => sum + val, 0) / sectionRatingValues.length;
      average = Math.round(average * 100) / 100;
      console.log(`[Section Summary] Calculated average for section "${sectionCode}": ${average} (from ${sectionRatingValues.length} rating values in ${matchingResponses.length} responses)`);
    } else {
      console.log(`[Section Summary] No responses found for section "${sectionCode}", average is 0`);
    }

    sectionSummary.push({
      sectionCode: sectionCode,
      subjectCode: subjectCode || '',
      totalStudents,
      respondents,
      average
    });
  });

  // Sort by section code
  const sortedSummary = sectionSummary.sort((a, b) => a.sectionCode.localeCompare(b.sectionCode));
  
  console.log(`[Section Summary] Final summary: ${sortedSummary.length} sections`);
  sortedSummary.forEach(item => {
    console.log(`  - ${item.sectionCode}: ${item.respondents}/${item.totalStudents} respondents, avg: ${item.average}`);
  });
  
  return sortedSummary;
}

/**
 * Fetch all individual student responses for a specific instructor and formId
 * Returns responses grouped by student/respondent with all their answers
 */
async function getInstructorIndividualResponses(formId, instructorEmail) {
  let spreadsheetId = getSpreadsheetId();
  let targetSheetTitles = null;

  if (formId) {
    try {
      const resolved = await resolveSpreadsheetForEvaluationForm(formId);
      spreadsheetId = resolved.spreadsheetId;
      targetSheetTitles = [resolved.sheetName || "Form Responses 1"];
      console.log(
        `[Individual Responses] Using spreadsheet ${spreadsheetId} (sheet: ${targetSheetTitles[0]}) for form ${formId}`
      );
    } catch (error) {
      console.error(`[Individual Responses] Unable to resolve spreadsheet for form ${formId}:`, error.message || error);
      throw error;
    }
  }

  const sheets = await getSheetsClient();

  try {
    // Get all sheets in the spreadsheet
    const { data: spreadsheetData } = await sheets.spreadsheets.get({ spreadsheetId });
    const allSheets = spreadsheetData.sheets || [];

    let sheetsToProcess;
    if (targetSheetTitles && targetSheetTitles.length) {
      sheetsToProcess = allSheets
        .map((sheet) => sheet?.properties?.title || "")
        .filter((title) => targetSheetTitles.includes(title));

      if (sheetsToProcess.length === 0) {
        throw new Error(
          `The specified response sheet "${targetSheetTitles[0]}" was not found in the spreadsheet.`
        );
      }
    } else {
      // Get all sheets - prioritize instructor sheets, but also include Google Form response sheets
      const instructorSheets = allSheets
        .map((sheet) => sheet?.properties?.title || "")
        .filter((title) => {
          if (title.startsWith("Instructor_") && title.endsWith("_Sheet")) {
            return true;
          }
          if (title.toLowerCase().includes("form responses") || title.toLowerCase().includes("responses")) {
            return true;
          }
          return false;
        });

      sheetsToProcess =
        instructorSheets.length > 0
          ? instructorSheets
          : allSheets.length > 0
          ? [allSheets[0].properties?.title || ""]
          : [];
    }

    if (sheetsToProcess.length === 0) {
      return [];
    }

    const allResponses = [];
    const normalizedInstructorEmail = (instructorEmail || "").toLowerCase().trim();

    // Helper function to find column value (case-insensitive, flexible matching)
    const findColumnValue = (rowData, possibleNames) => {
      for (const name of possibleNames) {
        if (rowData[name]) return rowData[name];
        const found = Object.keys(rowData).find(key => 
          key.toLowerCase() === name.toLowerCase()
        );
        if (found && rowData[found]) return rowData[found];
      }
      return "";
    };

    // Process each sheet
    for (const sheetTitle of sheetsToProcess) {
      try {
        const { data } = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: `${sheetTitle}!A1:ZZ1000`,
        });

        const rows = data.values || [];
        if (rows.length < 2) continue;

        const headers = rows[0] || [];
        const dataRows = rows.slice(1);

        // Process each row
        dataRows.forEach((row) => {
          const rowData = {};
          
          if (headers.length === 0 || row.length === 0) {
            return;
          }
          
          headers.forEach((header, index) => {
            if (header && header.trim()) {
              rowData[header.trim()] = row[index] || "";
            }
          });

          if (Object.keys(rowData).length === 0) {
            return;
          }

          // Check if this row belongs to the target instructor
          // First try to get instructor email from dedicated email columns
          let rowInstructorEmail = findColumnValue(rowData, [
            "Instructor Email",
            "Instructor Email Address",
            "Email",
            "Instructor's Email",
            "InstructorEmail",
            "Instructor_Email"
          ]).toLowerCase().trim();

          // If no email found, try to parse from "Select Instructor" column (format: "Name (email)")
          if (!rowInstructorEmail) {
            const selectedInstructor = findColumnValue(rowData, [
              "Select Instructor",
              "Instructor (Select)",
            ]);
            if (selectedInstructor) {
              // Parse format: "Name (email@example.com)" or "Name (email" (handles truncated emails)
              // Try full email first: "Name (email@domain.com)"
              let emailMatch = selectedInstructor.match(/\(([^)]+@[^)]+)\)/);
              if (!emailMatch) {
                // Try truncated email: "Name (email" (no closing parenthesis)
                emailMatch = selectedInstructor.match(/\(([^@)]+@[^)]*)/);
              }
              if (emailMatch && emailMatch[1]) {
                rowInstructorEmail = emailMatch[1].toLowerCase().trim();
                // If email is truncated, try to match by checking if it starts with the instructor email
                if (!rowInstructorEmail.includes('@') || rowInstructorEmail.length < normalizedInstructorEmail.length) {
                  const instructorEmailStart = normalizedInstructorEmail.substring(0, rowInstructorEmail.length);
                  if (instructorEmailStart === rowInstructorEmail) {
                    rowInstructorEmail = normalizedInstructorEmail;
                  }
                }
              }
            }
          }

          // Also check instructor name as fallback
          const rowInstructorName = findColumnValue(rowData, [
            "Instructor Name",
            "Instructor",
            "Name",
            "Instructor's Name",
            "Teacher Name",
            "Professor Name"
          ]).trim();

          // Skip if this row doesn't match the instructor
          if (normalizedInstructorEmail) {
            const emailsMatch = rowInstructorEmail && (
              rowInstructorEmail === normalizedInstructorEmail ||
              normalizedInstructorEmail.startsWith(rowInstructorEmail) ||
              rowInstructorEmail.startsWith(normalizedInstructorEmail)
            );
            if (!emailsMatch) {
              // Debug logging
              if (allResponses.length === 0 && dataRows.indexOf(row) < 3) {
                console.log(`[Individual Responses] Skipping row - email mismatch. Expected: "${normalizedInstructorEmail}", Found: "${rowInstructorEmail || 'none'}"`);
                const selectedInstructor = findColumnValue(rowData, ["Select Instructor", "Instructor (Select)"]);
                if (selectedInstructor) {
                  console.log(`[Individual Responses] Select Instructor value: "${selectedInstructor}"`);
                }
              }
              return; // Skip this row - doesn't match the target instructor
            }
          }

          // Extract student/respondent information
          const studentId = findColumnValue(rowData, [
            "Student ID",
            "StudentId",
            "Student_Id",
            "StudentID",
            "student_id"
          ]);
          const studentEmail = findColumnValue(rowData, [
            "Student Email",
            "Student Email Address",
            "Email Address",
            "StudentEmail",
            "Student_Email"
          ]);
          const timestamp = findColumnValue(rowData, ["Timestamp", "Date", "Submitted At", "Time"]);
          const sectionCode = findColumnValue(rowData, SECTION_COLUMN_CANDIDATES);
          const subjectCode = findColumnValue(rowData, SUBJECT_COLUMN_CANDIDATES);
          const course = findColumnValue(rowData, ["Course", "Course Name", "Course Code"]);
          const semester = findColumnValue(rowData, ["Semester"]);
          const academicYear = findColumnValue(rowData, ["Academic Year", "Year", "AcademicYear"]);

          // Collect all question-answer pairs (include all headers, even if answer is empty)
          const answers = {};
          headers.forEach((header, index) => {
            if (header && header.trim()) {
              const normalizedHeader = header.trim();
              // Skip metadata columns
              const lowerHeader = normalizedHeader.toLowerCase();
              if (
                lowerHeader !== 'timestamp' &&
                lowerHeader !== 'instructor name' &&
                lowerHeader !== 'instructor email' &&
                lowerHeader !== 'instructor email address' &&
                lowerHeader !== 'student id' &&
                lowerHeader !== 'student email' &&
                lowerHeader !== 'student email address' &&
                lowerHeader !== 'section code' &&
                lowerHeader !== 'subject code' &&
                lowerHeader !== 'course' &&
                lowerHeader !== 'semester' &&
                lowerHeader !== 'academic year' &&
                lowerHeader !== 'year level'
              ) {
                const answer = row[index] || "";
                // Include all questions, even if answer is empty
                answers[normalizedHeader] = answer.trim() || "";
              }
            }
          });

          // Create a unique identifier for this respondent
          const respondentId = studentId || studentEmail || `respondent_${timestamp || Date.now()}`;

          allResponses.push({
            respondentId,
            studentId: studentId || "",
            studentEmail: studentEmail || "",
            timestamp: timestamp || "",
            sectionCode: sectionCode || "",
            subjectCode: subjectCode || "",
            course: course || "",
            semester: semester || "",
            academicYear: academicYear || "",
            answers: answers,
            // Include all raw row data for reference
            rawData: rowData
          });
        });
      } catch (error) {
        console.error(`Error reading sheet ${sheetTitle}:`, error);
        // Continue with other sheets even if one fails
      }
    }

    console.log(`[Individual Responses] Found ${allResponses.length} responses for instructor ${instructorEmail}`);
    if (allResponses.length > 0) {
      console.log(`[Individual Responses] First response has ${Object.keys(allResponses[0].answers || {}).length} answer keys`);
      console.log(`[Individual Responses] Sample answer keys:`, Object.keys(allResponses[0].answers || {}).slice(0, 5));
    }
    return allResponses;
  } catch (error) {
    console.error('Error fetching individual responses:', error);
    throw error;
  }
}

module.exports = {
  appendEvaluationRow,
  fetchInstructorResponses,
  ensureSheetExists,
  buildSheetTitle,
  getAllInstructorSummaries,
  computeInstructorSummary,
  getAllInstructorSheets,
  getOverallSummary,
  getFormSpecificSummary,
  getInstructorSectionSummary,
  getInstructorIndividualResponses,
};

