const EvaluationForm = require("../models/EvaluationForm");
const Instructor = require("../models/Instructor");
const Section = require("../models/Section");
const SubjectCode = require("../models/SubjectCode");
const { getFormsClient, getSheetsClient } = require("../config/google");

const MAX_DROPDOWN_OPTIONS = 200;

const sanitizeOptionLabels = (values = [], fallbackLabel) => {
  const unique = Array.from(
    new Set(
      (values || [])
        .map((value) => {
          if (typeof value === "string") return value.trim();
          if (value === null || value === undefined) return "";
          return String(value).trim();
        })
        .filter(Boolean)
    )
  );

  if (!unique.length && fallbackLabel) {
    return [fallbackLabel];
  }

  return unique.slice(0, MAX_DROPDOWN_OPTIONS);
};

async function computeNextResponseSheetName() {
  const MATCH_REGEX = /^Form Responses (\d+)$/i;
  try {
    const existing = await EvaluationForm.find(
      { responseSheetName: { $exists: true, $ne: null } },
      { responseSheetName: 1 }
    ).lean();
    let maxNumber = 13; // ensures the next default is at least 14
    for (const record of existing) {
      const match = MATCH_REGEX.exec(record.responseSheetName || "");
      if (!match) continue;
      const num = parseInt(match[1], 10);
      if (Number.isFinite(num) && num > maxNumber) {
        maxNumber = num;
      }
    }
    return `Form Responses ${maxNumber + 1}`;
  } catch (error) {
    console.warn("computeNextResponseSheetName fallback due to error:", error?.message || error);
    return "Form Responses 14";
  }
}

exports.computeNextResponseSheetName = computeNextResponseSheetName;

function buildDefaultQuestions(
  instructorOptions = [],
  sectionOptions = [],
  subjectOptions = []
) {
  const ratingOptions = {
    type: "RADIO",
    options: [{ value: "1" }, { value: "2" }, { value: "3" }, { value: "4" }, { value: "5" }],
    shuffle: false,
  };

  const textQuestions = [
    "Student Name",
    "Course",
    "Year Level",
  ];

  const requests = textQuestions.map((title, index) => ({
    createItem: {
      item: {
        title,
        questionItem: {
          question: {
            required: true,
            textQuestion: { paragraph: false },
          },
        },
      },
      location: { index },
    },
  }));

  let currentIndex = textQuestions.length;

  const sectionOptionsList =
    Array.isArray(sectionOptions) && sectionOptions.length > 0
      ? sectionOptions
      : ["Section Code"];
  requests.push({
    createItem: {
      item: {
        title: "Section Code",
        questionItem: {
          question: {
            required: true,
            choiceQuestion: {
              type: "DROP_DOWN",
              options: sectionOptionsList.map((value) => ({ value })),
              shuffle: false,
            },
          },
        },
      },
      location: { index: currentIndex },
    },
  });
  currentIndex += 1;

  const subjectOptionsList =
    Array.isArray(subjectOptions) && subjectOptions.length > 0
      ? subjectOptions
      : ["Subject Code"];
  requests.push({
    createItem: {
      item: {
        title: "Subject Code",
        questionItem: {
          question: {
            required: true,
            choiceQuestion: {
              type: "DROP_DOWN",
              options: subjectOptionsList.map((value) => ({ value })),
              shuffle: false,
            },
          },
        },
      },
      location: { index: currentIndex },
    },
  });
  currentIndex += 1;

  // Insert Select Instructor MC question (required, even if no instructor list yet)
  const instructorOptionsList =
    Array.isArray(instructorOptions) && instructorOptions.length > 0
      ? instructorOptions
      : ["Instructor"];

  requests.push({
    createItem: {
      item: {
        title: "Select Instructor",
        questionItem: {
          question: {
            required: true,
            choiceQuestion: {
              type: "DROP_DOWN",
              options: instructorOptionsList.map((label) => ({ value: label })),
              shuffle: false,
            },
          },
        },
      },
      location: { index: currentIndex },
    },
  });
  currentIndex += 1;

  // Determine start index for rating questions based on previously added questions
  const startIdx = currentIndex;

  // Five rating questions (1–5)
  requests.push(
    {
      createItem: {
        item: {
          title: "Teaching Effectiveness (1–5)",
          questionItem: {
            question: {
              required: true,
              choiceQuestion: ratingOptions,
            },
          },
        },
        location: { index: startIdx + 0 },
      },
    },
    {
      createItem: {
        item: {
          title: "Communication Skills (1–5)",
          questionItem: {
            question: {
              required: true,
              choiceQuestion: ratingOptions,
            },
          },
        },
        location: { index: startIdx + 1 },
      },
    },
    {
      createItem: {
        item: {
          title: "Subject Knowledge (1–5)",
          questionItem: {
            question: {
              required: true,
              choiceQuestion: ratingOptions,
            },
          },
        },
        location: { index: startIdx + 2 },
      },
    },
    {
      createItem: {
        item: {
          title: "Punctuality (1–5)",
          questionItem: {
            question: {
              required: true,
              choiceQuestion: ratingOptions,
            },
          },
        },
        location: { index: startIdx + 3 },
      },
    },
    {
      createItem: {
        item: {
          title: "Availability (1–5)",
          questionItem: {
            question: {
              required: true,
              choiceQuestion: ratingOptions,
            },
          },
        },
        location: { index: startIdx + 4 },
      },
    },
    {
      createItem: {
        item: {
          title: "Comments",
          questionItem: {
            question: {
              required: false,
              textQuestion: { paragraph: true },
            },
          },
        },
        location: { index: startIdx + 5 },
      },
    },
  );

  return requests;
}

exports.createEvaluationForm = async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "Title is required" });
    }

    const forms = await getFormsClient();
    const { getSheetsClient } = require("../config/google");

    const formTitle = `Evaluation Form - ${title.trim()}`;
    
    // Create the Google Form (Google automatically creates a linked spreadsheet for responses)
    let created;
    try {
      created = await forms.forms.create({
        requestBody: {
          info: {
            title: formTitle,
          },
        },
      });
    } catch (e) {
      console.error("Forms API create error:", e?.response?.data || e);
      throw new Error(`forms.create failed: ${e?.response?.data?.error?.message || e.message}`);
    }

    const formId = created.data.formId;
    if (!formId) {
      throw new Error("Google Forms API did not return a formId");
    }
    
    // Step 3: Link the dedicated sheet to the form (if we created one)
    // Note: Google Forms API doesn't directly support changing the linked sheet,
    // but we can use the Drive API or Forms API batchUpdate to link it
    // For now, we'll store the dedicated sheet ID and use it for reading responses
    // The form will still have its auto-created linked sheet, but we'll read from our dedicated one

    // Set description via batchUpdate per Forms API requirement
    try {
      await forms.forms.batchUpdate({
        formId,
        requestBody: {
          requests: [
            {
              updateFormInfo: {
                info: {
                  description: description || "Official evaluation form created by the Dean.",
                },
                updateMask: "description",
              },
            },
          ],
        },
      });
    } catch (e) {
      console.error("Forms API batchUpdate(updateFormInfo) error:", e?.response?.data || e);
      throw new Error(`batchUpdate(updateFormInfo) failed: ${e?.response?.data?.error?.message || e.message}`);
    }

  // Build instructor, section, and subject options from DB
  let instructorLabels = [];
  let sectionLabels = [];
  let subjectLabels = [];
  try {
    const [instructors, sectionCodes] = await Promise.all([
      Instructor.find({}).select("name email").lean(),
      Section.distinct("sectionCode", { sectionCode: { $exists: true, $ne: null, $ne: "" } }),
    ]);

    instructorLabels = instructors
      .map((inst) => {
        const name = (inst.name || "").trim();
        const email = (inst.email || "").trim();
        return name ? `${name}${email ? ` (${email})` : ""}` : email;
      })
      .filter(Boolean);

    if (instructorLabels.length > MAX_DROPDOWN_OPTIONS) {
      instructorLabels = instructorLabels.slice(0, MAX_DROPDOWN_OPTIONS);
    }

    sectionLabels = sanitizeOptionLabels(sectionCodes, "Section Code");
  } catch (e) {
    console.warn("Unable to load instructors/sections for default questions:", e?.message || e);
    sectionLabels = sanitizeOptionLabels([], "Section Code");
  }

  try {
    const [studentSubjects, sectionSubjects, storedSubjectCodes] = await Promise.all([
      Student.distinct("subject", { subject: { $exists: true, $ne: null, $ne: "" } }),
      Section.distinct("subjectCode", { subjectCode: { $exists: true, $ne: null, $ne: "" } }),
      SubjectCode.find({}, "name").lean().catch(() => []),
    ]);

    subjectLabels = sanitizeOptionLabels(
      [
        ...(studentSubjects || []),
        ...(sectionSubjects || []),
        ...((storedSubjectCodes || []).map((doc) => doc.name)),
      ],
      "Subject Code"
    );
  } catch (e) {
    console.warn("Unable to load subject codes for default questions:", e?.message || e);
    subjectLabels = sanitizeOptionLabels([], "Subject Code");
  }

    try {
      await forms.forms.batchUpdate({
        formId,
      requestBody: { requests: buildDefaultQuestions(instructorLabels, sectionLabels, subjectLabels) },
      });
    } catch (e) {
      console.error("Forms API batchUpdate(createItem questions) error:", e?.response?.data || e);
      throw new Error(`batchUpdate(createItem) failed: ${e?.response?.data?.error?.message || e.message}`);
    }

    const googleFormLink = `https://docs.google.com/forms/d/${formId}/edit`;

    // Fetch responderUri (public responder link) & get the form's auto-created linked sheet
    // Google Forms automatically creates a dedicated spreadsheet for each form
    let googleResponderLink = null;
    let linkedSheetId = null;
    let linkedSheetTabId = null;
    
    try {
      const formInfo = await forms.forms.get({ formId });
      if (formInfo && formInfo.data && formInfo.data.responderUri) {
        googleResponderLink = formInfo.data.responderUri; // e.g., https://docs.google.com/forms/d/e/XXXX/viewform
      }
      
      // Get the linked spreadsheet ID (Google automatically creates one for each form)
      if (formInfo?.data?.linkedSheetId) {
        linkedSheetId = formInfo.data.linkedSheetId;
        
        // Get the actual sheet name from the linked spreadsheet
        // Each form gets its own dedicated spreadsheet, so we need to find the response sheet tab
        try {
          const sheets = await getSheetsClient();
          const { data: spreadsheetData } = await sheets.spreadsheets.get({
            spreadsheetId: linkedSheetId,
            includeGridData: false,
          });
          
          const allSheets = spreadsheetData?.sheets || [];
          
          // Find the response sheet - Google Forms typically creates "Form Responses 1" for the first sheet
          const responseSheets = allSheets.filter(sheet => {
            const title = sheet?.properties?.title || "";
            return title.toLowerCase().includes("form responses");
          });
          
          if (responseSheets.length > 0) {
            // For a newly created form, the response sheet is typically:
            // 1. The one that matches our form's question structure (if form has questions)
            // 2. The one with no data yet (just created)
            // 3. The first/last "Form Responses" sheet
            
            let targetSheet = null;
            
            // First, try to find a sheet that matches our form's question structure
            for (const sheet of responseSheets) {
              try {
                const { data: sheetData } = await sheets.spreadsheets.values.get({
                  spreadsheetId: linkedSheetId,
                  range: `${sheet.properties.title}!A1:Z10`,
                });
                
                const headers = sheetData.values?.[0] || [];
                const hasData = sheetData.values && sheetData.values.length > 1;
                
                // Check if this sheet has headers that match our form questions
                const hasSelectInstructor = headers.some(h => h && h.toLowerCase().includes("select instructor"));
                const hasTeachingEffectiveness = headers.some(h => h && h.toLowerCase().includes("teaching effectiveness"));
                
                // If form has "Select Instructor" question, prefer sheets that have that column
                if (instructorLabels.length > 0 && hasSelectInstructor && hasTeachingEffectiveness) {
                  targetSheet = sheet;
                  break;
                }
                
                // If no data yet (just created), this is likely our sheet
                if (!hasData && !targetSheet) {
                  targetSheet = sheet;
                }
              } catch (e) {
                // Skip sheets we can't read
                continue;
              }
            }
            
            // Fallback: use the first "Form Responses" sheet (usually "Form Responses 1")
            if (!targetSheet) {
              targetSheet = responseSheets[0];
            }
            
            linkedSheetTabId = targetSheet.properties.sheetId;
            
            console.log(`[Form Creation] Detected response sheet: ${linkedSheetName} (tab ID: ${linkedSheetTabId}) for form ${formId}`);
            console.log(`[Form Creation] Using auto-created linked spreadsheet: ${linkedSheetId} for form "${formTitle}"`);
          } else {
            // Fallback: if no "Form Responses" sheet found, use the first sheet
            if (allSheets.length > 0) {
              linkedSheetName = allSheets[0].properties.title;
              linkedSheetTabId = allSheets[0].properties.sheetId;
              console.warn(`[Form Creation] No "Form Responses" sheet found, using first sheet: ${linkedSheetName}`);
            }
          }
        } catch (sheetError) {
          console.warn("Could not detect response sheet name from Sheets API:", sheetError?.message || sheetError);
          // Keep default "Form Responses 1"
        }
      } else {
        console.warn(`[Form Creation] Form ${formId} does not have a linked spreadsheet yet. It may be created automatically when the first response is submitted.`);
      }
    } catch (e) {
      // If this fails, we still proceed with edit link saved; frontend can convert to /viewform as fallback
      console.warn("Forms API get(responderUri) failed, proceeding without responder link:", e?.response?.data || e?.message || e);
    }

    // Determine a unique responseSheetName starting at "Form Responses 11" and incrementing
    // Find max number among existing responseSheetName values
    const desiredResponseSheetName = await computeNextResponseSheetName();
    let linkedSheetName = desiredResponseSheetName;

    // Attempt to rename the detected response sheet tab in Google Sheets to our desired unique name
    try {
      if (linkedSheetId && linkedSheetTabId !== null && linkedSheetTabId !== undefined) {
        const sheets = await getSheetsClient();
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: linkedSheetId,
          requestBody: {
            requests: [
              {
                updateSheetProperties: {
                  properties: {
                    sheetId: Number(linkedSheetTabId),
                    title: desiredResponseSheetName,
                  },
                  fields: "title",
                },
              },
            ],
          },
        });
      }
    } catch (renameErr) {
      console.warn("Could not rename response sheet tab, keeping detected name:", renameErr?.message || renameErr);
      // Even if rename fails, we still store the desired response sheet name for consistency
      linkedSheetName = desiredResponseSheetName;
    }

    const questionDefinitions = [];
    const baseTextQuestions = ["Student Name", "Course", "Year Level"];

    baseTextQuestions.forEach((questionText, idx) => {
      questionDefinitions.push({
        questionText,
        questionType: "text",
        required: true,
        order: idx + 1,
      });
    });

    let orderCounter = questionDefinitions.length;

    orderCounter += 1;
    questionDefinitions.push({
      questionText: "Section Code",
      questionType: "multiple_choice",
      required: true,
      options: sectionLabels,
      order: orderCounter,
    });

    orderCounter += 1;
    questionDefinitions.push({
      questionText: "Subject Code",
      questionType: "multiple_choice",
      required: true,
      options: subjectLabels,
      order: orderCounter,
    });

    orderCounter += 1;
    questionDefinitions.push({
      questionText: "Select Instructor",
      questionType: "multiple_choice",
      required: true,
      options: instructorLabels.length > 0 ? instructorLabels : ["Instructor"],
      order: orderCounter,
    });

    const ratingQuestions = [
      "Teaching Effectiveness (1–5)",
      "Communication Skills (1–5)",
      "Subject Knowledge (1–5)",
      "Punctuality (1–5)",
      "Availability (1–5)",
    ];
    const ratingChoiceOptions = ["1", "2", "3", "4", "5"];

    ratingQuestions.forEach((questionText) => {
      orderCounter += 1;
      questionDefinitions.push({
        questionText,
        questionType: "multiple_choice",
        options: ratingChoiceOptions,
        required: true,
        order: orderCounter,
      });
    });

    orderCounter += 1;
    questionDefinitions.push({
      questionText: "Comments",
      questionType: "text",
      required: false,
      order: orderCounter,
    });

    const evaluationForm = new EvaluationForm({
      title: formTitle,
      description: description || "Official evaluation form created by the Dean.",
      questions: questionDefinitions,
      createdBy: req.user?._id || req.body.createdBy,
      googleFormId: formId,
      googleFormLink,
      googleResponderLink,
      responseSheetId: linkedSheetId || undefined,
      responseSheetTabId: linkedSheetTabId || undefined,
      responseSheetName: linkedSheetName,
      isActive: true,
    });

    await evaluationForm.save();

    return res.status(201).json({
      success: true,
      message: "Evaluation form created and linked to Google Form successfully.",
      evaluationForm: {
        _id: evaluationForm._id,
        title: evaluationForm.title,
        description: evaluationForm.description,
        googleFormId: evaluationForm.googleFormId,
        googleFormLink: evaluationForm.googleFormLink,
        createdAt: evaluationForm.createdAt,
        googleResponderLink: evaluationForm.googleResponderLink,
      },
    });
  } catch (err) {
    console.error("createEvaluationForm error:", err);
    return res.status(500).json({ success: false, message: "Failed to create Google Form. Please check API credentials or quota.", error: err.message });
  }
};

exports.getEvaluationResponses = async (req, res) => {
  try {
    const { spreadsheetId } = req.params;
    if (!spreadsheetId) {
      return res.status(400).json({ success: false, message: "spreadsheetId is required" });
    }

    const sheets = await getSheetsClient();
    const range = "Form Responses 1!A:Z";
    const resp = await sheets.spreadsheets.values.get({ spreadsheetId, range });
    return res.json({ success: true, values: resp.data.values || [] });
  } catch (err) {
    console.error("getEvaluationResponses error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};

// Fetch live Google Form items for preview
exports.getGoogleFormInfo = async (req, res) => {
  try {
    const { formId } = req.params;
    if (!formId) return res.status(400).json({ success: false, message: "formId is required" });

    const forms = await getFormsClient();
    const resp = await forms.forms.get({ formId });
    const items = resp.data.items || [];
    const questions = items
      .filter((it) => it?.questionItem?.question)
      .map((it, idx) => ({
        title: it.title || `Question ${idx + 1}`,
        type: it.questionItem.question.choiceQuestion ? 'multiple_choice' : (it.questionItem.question.textQuestion ? 'text' : 'unknown'),
        required: !!it.questionItem.question.required,
      }));

    return res.json({ success: true, title: resp.data.info?.title, description: resp.data.info?.description, questions });
  } catch (err) {
    console.error("getGoogleFormInfo error:", err?.response?.data || err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
};


