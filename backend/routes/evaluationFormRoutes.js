const express = require("express");
const EvaluationForm = require("../models/EvaluationForm");
const User = require("../models/User");
const router = express.Router();

// Simple token-based auth middleware for Dean actions
function requireDeanAuth(req, res, next) {
  try {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ success: false, message: "Missing Authorization token" });
    }
    const match = token.match(/^user_([a-f\d]{24})_\d+$/i);
    if (!match) {
      return res.status(401).json({ success: false, message: "Invalid token format" });
    }
    const userId = match[1];
    User.findById(userId).then((user) => {
      if (!user || user.role !== "dean") {
        return res.status(403).json({ success: false, message: "Forbidden: dean access required" });
      }
      req.user = user;
      next();
    }).catch((err) => {
      return res.status(500).json({ success: false, message: "Auth lookup error", details: err.message });
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Auth error", details: e.message });
  }
}

// Get all evaluation forms
// Note: This route is accessible to both Dean and Instructor
// Dean needs viewEvaluationForms permission
// Instructor needs viewAvailableForms permission
router.get("/", async (req, res) => {
  try {
    const evaluationForms = await EvaluationForm.find({ isActive: true })
      .populate("createdBy", "email")
      .sort({ createdAt: -1 });
    
    res.json({ success: true, evaluationForms });
  } catch (error) {
    console.error("Error fetching evaluation forms:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
});

// Get evaluation form by ID
router.get("/:id", async (req, res) => {
  try {
    const evaluationForm = await EvaluationForm.findById(req.params.id)
      .populate("createdBy", "email");
    
    if (!evaluationForm) {
      return res.status(404).json({ 
        success: false, 
        message: "Evaluation form not found" 
      });
    }
    
    res.json({ success: true, evaluationForm });
  } catch (error) {
    console.error("Error fetching evaluation form:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
});

// Create new evaluation form
// Supports two modes:
// 1) With googleFormLink provided -> just store record pointing to existing form
// 2) Without link -> auto-create Google Form via controller logic and store IDs/links
router.post("/", requireDeanAuth, async (req, res) => {
  try {
    const { title, description, questions, createdBy, googleFormLink } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, message: "Title is required" });
    }

    // If Dean provided a Google Form link, just store a new record referencing it
    if (googleFormLink && String(googleFormLink).trim()) {
      const { computeNextResponseSheetName } = require("../controllers/evaluationController");
      const uniqueResponseSheetName = await computeNextResponseSheetName();

      const evaluationForm = new EvaluationForm({
        title: String(title).trim(),
        description: description || "",
        questions: Array.isArray(questions) ? questions : [],
        createdBy: req.user?._id,
        googleFormLink: String(googleFormLink).trim(),
        // Attempt to extract Google form ID if it's an edit URL
        googleFormId: (() => {
          const link = String(googleFormLink).trim();
          const editMatch = link.match(/\/forms\/d\/([a-zA-Z0-9_-]+)/);
          const responderMatch = link.match(/\/forms\/d\/e\/([a-zA-Z0-9_-]+)/);
          return (editMatch && editMatch[1]) || (responderMatch && responderMatch[1]) || undefined;
        })(),
        // Derive responder link if possible
        googleResponderLink: (() => {
          const link = String(googleFormLink).trim();
          // If it's an edit link, prefer converting to /viewform
          if (/\/edit(\?|$)/.test(link)) {
            return link.replace(/\/edit(\?.*)?$/, "/viewform");
          }
          return undefined;
        })(),
        responseSheetName: uniqueResponseSheetName,
      });

      await evaluationForm.save();

      return res.status(201).json({
        success: true,
        message: "Evaluation form recorded successfully.",
        evaluationForm,
      });
    }

    // Otherwise, auto-create via Google Forms API using existing controller
    const { createEvaluationForm } = require("../controllers/evaluationController");
    req.body = { title, description, createdBy: req.user?._id };
    return createEvaluationForm(req, res);
  } catch (error) {
    console.error("Error creating evaluation form:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
});


// Update evaluation form
router.put("/:id", requireDeanAuth, async (req, res) => {
  try {
    const { title, description, questions, isActive } = req.body;
    
    const updateData = {};
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (questions) updateData.questions = questions;
    if (isActive !== undefined) updateData.isActive = isActive;
    
    updateData.updatedAt = new Date();

    const evaluationForm = await EvaluationForm.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    if (!evaluationForm) {
      return res.status(404).json({ 
        success: false, 
        message: "Evaluation form not found" 
      });
    }
    
    res.json({ 
      success: true, 
      evaluationForm,
      message: "Evaluation form updated successfully"
    });
  } catch (error) {
    console.error("Error updating evaluation form:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
});

// Delete evaluation form (soft delete)
router.delete("/:id", requireDeanAuth, async (req, res) => {
  try {
    const evaluationForm = await EvaluationForm.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!evaluationForm) {
      return res.status(404).json({ 
        success: false, 
        message: "Evaluation form not found" 
      });
    }
    
    res.json({ 
      success: true, 
      message: "Evaluation form deactivated successfully" 
    });
  } catch (error) {
    console.error("Error deleting evaluation form:", error);
    res.status(500).json({ 
      success: false, 
      message: "Server error", 
      error: error.message 
    });
  }
});

// Auto-detect and update response sheet names for all evaluation forms
// This helps fix forms that have incorrect responseSheetName stored
router.post("/auto-detect-sheets", requireDeanAuth, async (req, res) => {
  try {
    const { getSheetsClient, getFormsClient } = require("../config/google");
    const sheets = await getSheetsClient();
    const forms = await getFormsClient();
    
    const evaluationForms = await EvaluationForm.find({ isActive: true, googleFormId: { $exists: true, $ne: null } });
    const results = [];
    
    for (const form of evaluationForms) {
      try {
        if (!form.googleFormId || !form.responseSheetId) {
          results.push({
            formId: form._id,
            title: form.title,
            status: "skipped",
            reason: "Missing googleFormId or responseSheetId"
          });
          continue;
        }
        
        // Get all sheets in the spreadsheet
        const { data: spreadsheetData } = await sheets.spreadsheets.get({
          spreadsheetId: form.responseSheetId,
          includeGridData: false,
        });
        
        const allSheets = spreadsheetData?.sheets || [];
        const responseSheets = allSheets.filter(sheet => {
          const title = sheet?.properties?.title || "";
          return title.toLowerCase().includes("form responses");
        });
        
        if (responseSheets.length === 0) {
          results.push({
            formId: form._id,
            title: form.title,
            status: "skipped",
            reason: "No 'Form Responses' sheets found"
          });
          continue;
        }
        
        // Try to get form info to check question structure
        let formQuestions = [];
        try {
          const formInfo = await forms.forms.get({ formId: form.googleFormId });
          formQuestions = (formInfo.data.items || [])
            .filter(item => item.questionItem)
            .map(item => item.title || "");
        } catch (e) {
          // If we can't get form info, we'll match by checking which sheet has the most responses
        }
        
        // Find the best matching sheet
        let bestMatch = null;
        let bestMatchScore = 0;
        
        for (const sheet of responseSheets) {
          const sheetTitle = sheet.properties.title;
          try {
            // Check if this sheet has responses
            const { data: sheetData } = await sheets.spreadsheets.values.get({
              spreadsheetId: form.responseSheetId,
              range: `${sheetTitle}!A1:Z100`,
            });
            
            if (!sheetData.values || sheetData.values.length < 2) {
              continue; // Skip empty sheets
            }
            
            const headers = sheetData.values[0] || [];
            
            // Score based on:
            // 1. If form has "Select Instructor" question, check if sheet has that column
            // 2. Number of matching question columns
            // 3. Sheet with most responses (if multiple candidates)
            
            let score = 0;
            if (formQuestions.length > 0) {
              // Check how many form questions match sheet headers
              formQuestions.forEach(q => {
                if (headers.some(h => h && h.includes(q))) {
                  score += 10;
                }
              });
            } else {
              // If we can't get form questions, prefer sheets with more data
              score = sheetData.values.length;
            }
            
            // Prefer sheets that have "Select Instructor" if form has that question
            if (form.questions?.some(q => q.questionText === "Select Instructor")) {
              if (headers.some(h => h && h.toLowerCase().includes("select instructor"))) {
                score += 50;
              }
            }
            
            if (score > bestMatchScore) {
              bestMatchScore = score;
              bestMatch = sheetTitle;
            }
          } catch (e) {
            // Skip sheets we can't read
            continue;
          }
        }
        
        if (bestMatch) {
          await EvaluationForm.findByIdAndUpdate(form._id, {
            responseSheetName: bestMatch,
            responseSheetTabId: responseSheets.find(s => s.properties.title === bestMatch)?.properties?.sheetId
          });
          
          results.push({
            formId: form._id,
            title: form.title,
            status: "updated",
            oldSheetName: form.responseSheetName || "not set",
            newSheetName: bestMatch,
            score: bestMatchScore
          });
        } else {
          results.push({
            formId: form._id,
            title: form.title,
            status: "not_found",
            reason: "Could not find matching response sheet"
          });
        }
      } catch (error) {
        results.push({
          formId: form._id,
          title: form.title,
          status: "error",
          error: error.message
        });
      }
    }
    
    res.json({
      success: true,
      message: `Processed ${results.length} evaluation forms`,
      results
    });
  } catch (error) {
    console.error("Error auto-detecting sheets:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

module.exports = router;
