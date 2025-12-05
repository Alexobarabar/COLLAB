const express = require("express");
const router = express.Router();
const { sendEvaluationEmails } = require("../controllers/emailController");

// POST /api/email/send-evaluation
router.post("/send-evaluation", sendEvaluationEmails);

module.exports = router;


