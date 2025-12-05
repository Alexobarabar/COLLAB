const QUESTION_CATEGORY_DEFINITIONS = [
  {
    key: 'general_performance',
    title: 'General Performance Indicators',
    aliases: ['general performance indicators', 'general indicators'],
    keywords: [],
  },
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
    aliases: ['assessment of learning'],
    keywords: ['assessment', 'rubric', 'criteria'],
  },
  {
    key: 'professionalism_ethics',
    title: 'Professionalism and Ethics',
    aliases: ['professionalism and ethics'],
    keywords: ['professionalism', 'ethics', 'respect'],
  },
  {
    key: 'default',
    title: 'General Questions',
    aliases: [],
    keywords: [],
  },
];

const IGNORED_INDICATOR_KEYWORDS = [
  'student name', 'name', 'first name', 'last name', 'student first name', 'student last name',
  'full name', 'fullname', 'studentname', 'student_name',
  'year level', 'yearlevel', 'year_level', 'yr level', 'year',
  'section code', 'subject code', 'select instructor', 'course',
  'student id', 'student email', 'student email address',
  'timestamp', 'instructor name', 'instructor email', 'instructor email address'
];

const roundScore = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
};

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

const normalizeQuestionText = (text = '') =>
  text
    .toString()
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const shouldIgnoreQuestion = (text = '') => {
  if (!text) return true;
  const normalized = normalizeQuestionText(text);
  // Check for exact match or if the normalized text contains any of the ignored keywords
  return IGNORED_INDICATOR_KEYWORDS.some((keyword) => {
    const normalizedKeyword = normalizeQuestionText(keyword);
    return normalized === normalizedKeyword || normalized.includes(normalizedKeyword);
  });
};

const detectQuestionCategory = (text = '') => {
  const normalized = text.toLowerCase();
  const numberMatch = normalized.match(/^(\d+)[.)-]/);
  if (numberMatch) {
    const questionNumber = Number(numberMatch[1]);
    if (questionNumber >= 1 && questionNumber <= 12) return QUESTION_CATEGORY_DEFINITIONS[1];
    if (questionNumber >= 13 && questionNumber <= 17) return QUESTION_CATEGORY_DEFINITIONS[2];
    if (questionNumber >= 18 && questionNumber <= 22) return QUESTION_CATEGORY_DEFINITIONS[3];
    if (questionNumber >= 23 && questionNumber <= 30) return QUESTION_CATEGORY_DEFINITIONS[4];
  }

  for (const definition of QUESTION_CATEGORY_DEFINITIONS) {
    if (definition.key === 'default') continue;
    const matchesAlias = definition.aliases.some((alias) => normalized.includes(alias));
    const matchesKeyword = definition.keywords.some((keyword) => normalized.includes(keyword));
    if (matchesAlias || matchesKeyword) {
      return definition;
    }
  }

  return QUESTION_CATEGORY_DEFINITIONS[QUESTION_CATEGORY_DEFINITIONS.length - 1];
};

const buildInstructorPrintPayload = ({
  instructor,
  summary,
  formDefinition,
  sectionSummary = [],
  individualResponses = [],
}) => {
  if (!instructor || !summary) return null;

  const formQuestions = formDefinition?.questions
    ? [...formDefinition.questions].sort((a, b) => (a.order || 0) - (b.order || 0))
    : [];

  const responseMap = new Map(
    (instructor.questions || []).map((question) => [normalizeQuestionText(question.question), question])
  );
  const processedKeys = new Set();

  const orderedQuestions = formQuestions.map((question, index) => {
    const normalizedKey = normalizeQuestionText(question.questionText);
    processedKeys.add(normalizedKey);
    const responseData = responseMap.get(normalizedKey);
    const isNumeric =
      question.questionType === 'rating' ||
      question.questionType === 'multiple_choice' ||
      (responseData?.stats?.numericCount || 0) > 0;
    const average = isNumeric && responseData?.stats?.average ? roundScore(responseData.stats.average) : null;
    const category = detectQuestionCategory(question.questionText);
    const textResponses = responseData?.uniqueTextAnswers?.length
      ? responseData.uniqueTextAnswers
      : !isNumeric
      ? responseData?.answers || []
      : [];

    return {
      key: `${normalizedKey}_${index}`,
      order: question.order || index + 1,
      question: question.questionText || responseData?.question || 'Untitled Question',
      average,
      descriptiveRating: average ? describeScore(average) : 'No Data',
      categoryKey: category.key,
      categoryTitle: category.title,
      isNumeric,
      textResponses,
    };
  });

  const remainingQuestions = [];
  responseMap.forEach((responseData, normalizedKey) => {
    if (processedKeys.has(normalizedKey)) return;
    const isNumeric = (responseData?.stats?.numericCount || 0) > 0;
    const average = isNumeric && responseData?.stats?.average ? roundScore(responseData.stats.average) : null;
    const category = detectQuestionCategory(responseData.question);
    const textResponses = responseData?.uniqueTextAnswers || (isNumeric ? [] : responseData?.answers || []);

    remainingQuestions.push({
      key: `${normalizedKey}_extra`,
      order: (formQuestions.length || 0) + remainingQuestions.length + 1,
      question: responseData.question || 'Untitled Question',
      average,
      descriptiveRating: average ? describeScore(average) : 'No Data',
      categoryKey: category.key,
      categoryTitle: category.title,
      isNumeric,
      textResponses,
    });
  });

  const allQuestions = [...orderedQuestions, ...remainingQuestions]
    .filter((question) => !shouldIgnoreQuestion(question.question || ''))
    .sort((a, b) => a.order - b.order);

  const categoryRatings = QUESTION_CATEGORY_DEFINITIONS.map((definition) => {
    const categoryQuestions = allQuestions.filter((question) => question.categoryKey === definition.key);
    const numericQuestions = categoryQuestions.filter((question) => question.isNumeric && question.average);
    const average =
      numericQuestions.length > 0
        ? roundScore(
            numericQuestions.reduce((sum, question) => sum + (question.average || 0), 0) / numericQuestions.length
          )
        : null;

    return {
      key: definition.key,
      title: definition.title,
      average,
      descriptiveRating: average ? describeScore(average) : 'No Data',
    };
  });

  const averageRows = categoryRatings.filter((row) => Number.isFinite(row.average) && row.average > 0);
  const totalAverageScore =
    averageRows.length > 0
      ? roundScore(averageRows.reduce((sum, row) => sum + (row.average || 0), 0) / averageRows.length)
      : roundScore(instructor.totalAverage || instructor.categoryBreakdown?.totalAverage || 0);

  const descriptor =
    instructor.descriptiveRating ||
    describeScore(totalAverageScore) ||
    categoryRatings.find((row) => row.title === 'General Performance Indicators')?.descriptiveRating ||
    'No Data';

  const conversionScore =
    typeof instructor.facultyReclassificationScore === 'number'
      ? instructor.facultyReclassificationScore
      : instructor.categoryBreakdown?.facultyReclassificationScore ??
        Math.round(((totalAverageScore || 0) / 5) * 100);

  const textResponses = [];
  allQuestions.forEach((question) => {
    if (question.textResponses && question.textResponses.length > 0) {
      question.textResponses.forEach((response, responseIndex) => {
        textResponses.push({
          key: `${normalizeQuestionText(question.question)}_${responseIndex}`,
          question: question.question,
          response,
        });
      });
    }
  });

  // Always use the passed sectionSummary parameter (from the new endpoint)
  // This ensures we get the correct data with student counts and respondent counts
  const sectionSummaryRows = Array.isArray(sectionSummary) && sectionSummary.length
    ? sectionSummary
    : (Array.isArray(instructor?.sectionSummary) && instructor.sectionSummary.length
        ? instructor.sectionSummary
        : []);

  return {
    formTitle: summary?.formTitle || 'Instructor Performance Summary',
    reportTitle: 'HyFlex Teaching Performance Evaluation (Student)',
    instructorName: instructor.instructorName || 'Unknown Instructor',
    instructorEmail: instructor.instructorEmail || '',
    department: instructor.department || '',
    courses: instructor.courses || [],
    semester: instructor.semester || '',
    academicYear: instructor.academicYear || '',
    totalRespondents: instructor.totalResponses || instructor.totalResponsesCount || 0,
    uniqueRespondents: instructor.uniqueRespondents || instructor.totalResponses || 0,
    categoryRatings,
    totalAverage: totalAverageScore,
    totalDescriptor: descriptor,
    conversionScore,
    responderBreakdown: {
      undergrad:
        typeof instructor.undergradRespondents === 'number' ? instructor.undergradRespondents : null,
      graduate: typeof instructor.graduateRespondents === 'number' ? instructor.graduateRespondents : null,
    },
    generalIndicators: allQuestions.filter((question) => question.categoryKey === 'general_performance'),
    masteryIndicators: allQuestions.filter((question) => question.categoryKey === 'mastery_subject_matter'),
    allQuestions,
    textResponses,
    sectionSummary: sectionSummaryRows,
    individualResponses: Array.isArray(individualResponses) ? individualResponses : [],
  };
};

export default buildInstructorPrintPayload;

