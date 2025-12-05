const { getDescriptiveRating, roundScore } = require("./descriptiveRatings");

const CATEGORY_DEFINITIONS = [
  {
    key: "lesson_presentation",
    title: "Lesson Presentation",
    aliases: ["lesson presentation"],
    keywords: ["lesson presentation", "module", "consultations", "learning outcomes"],
  },
  {
    key: "management_of_learning",
    title: "Management of Learning",
    aliases: ["management of learning"],
    keywords: ["management of learning", "learning styles", "learning situations", "management"],
  },
  {
    key: "innovativeness_creativity",
    title: "Innovativeness and Creativity",
    aliases: ["innovativeness and creativity", "innovation", "creativity"],
    keywords: ["innovative", "innovation", "creative", "creativity", "hyflex"],
  },
  {
    key: "mastery_subject_matter",
    title: "Mastery of the Subject Matter",
    aliases: ["mastery of the subject matter", "subject mastery"],
    keywords: ["subject matter", "mastery", "expertise", "knowledge"],
  },
  {
    key: "assessment_of_learning",
    title: "Assessment of Learning",
    aliases: ["assessment of learning", "assessment"],
    keywords: ["assessment", "evaluates", "measures learning", "rubric"],
  },
  {
    key: "general_performance",
    title: "General Performance Indicators",
    aliases: ["general performance"],
    keywords: [],
  },
];

function normalize(text = "") {
  return text.toString().trim().toLowerCase();
}

function findCategoryByPrefix(prefix) {
  if (!prefix) return null;
  const normalized = normalize(prefix);
  return (
    CATEGORY_DEFINITIONS.find(
      (definition) =>
        definition.title.toLowerCase() === normalized ||
        definition.aliases?.some((alias) => alias.toLowerCase() === normalized)
    ) || null
  );
}

function findCategoryByKeywords(questionText = "") {
  const normalized = normalize(questionText);
  return (
    CATEGORY_DEFINITIONS.find((definition) =>
      definition.keywords.some((keyword) => normalized.includes(keyword))
    ) || null
  );
}

function detectCategory(questionText = "") {
  if (!questionText) {
    return CATEGORY_DEFINITIONS[CATEGORY_DEFINITIONS.length - 1];
  }

  const colonIndex = questionText.indexOf(":");
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

  // Try to infer based on numbering pattern (e.g., "1. ...")
  const numberMatch = questionText.match(/^\s*(\d{1,2})[\.\)]/);
  if (numberMatch) {
    const questionNumber = parseInt(numberMatch[1], 10);
    if (questionNumber >= 1 && questionNumber <= 7) {
      return CATEGORY_DEFINITIONS[0];
    }
    if (questionNumber >= 8 && questionNumber <= 12) {
      return CATEGORY_DEFINITIONS[1];
    }
    if (questionNumber >= 13 && questionNumber <= 17) {
      return CATEGORY_DEFINITIONS[2];
    }
    if (questionNumber >= 18 && questionNumber <= 22) {
      return CATEGORY_DEFINITIONS[3];
    }
    if (questionNumber >= 23 && questionNumber <= 30) {
      return CATEGORY_DEFINITIONS[4];
    }
  }

  return CATEGORY_DEFINITIONS[CATEGORY_DEFINITIONS.length - 1];
}

function buildCategoryBreakdown(questions = []) {
  const buckets = new Map();

  questions.forEach((question) => {
    const category = detectCategory(question.question);
    if (!buckets.has(category.key)) {
      buckets.set(category.key, {
        key: category.key,
        title: category.title,
        questions: [],
      });
    }
    buckets.get(category.key).questions.push(question);
  });

  const categories = Array.from(buckets.values()).map((bucket) => {
    const numericQuestions = bucket.questions.filter(
      (q) => q?.stats?.numericCount > 0 && Number.isFinite(q.stats.average)
    );
    const average =
      numericQuestions.length > 0
        ? roundScore(
            numericQuestions.reduce((sum, item) => sum + (item.stats.average || 0), 0) /
              numericQuestions.length
          )
        : 0;

    return {
      key: bucket.key,
      title: bucket.title,
      average,
      descriptiveRating: getDescriptiveRating(average),
      questions: bucket.questions.map((q) => {
        const questionAverage = roundScore(q?.stats?.average || 0);
        return {
          question: q.question,
          average: questionAverage,
          descriptiveRating: getDescriptiveRating(questionAverage),
        };
      }),
    };
  });

  const totalAverage =
    categories.length > 0
      ? roundScore(categories.reduce((sum, category) => sum + (category.average || 0), 0) / categories.length)
      : 0;

  return {
    categories,
    totalAverage,
    descriptiveRating: getDescriptiveRating(totalAverage),
  };
}

module.exports = {
  CATEGORY_DEFINITIONS,
  buildCategoryBreakdown,
  detectCategory,
};

