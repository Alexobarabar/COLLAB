const DESCRIPTIVE_SCALE = [
  { min: 4.5, label: "Outstanding" },
  { min: 4.0, label: "Very Satisfactory" },
  { min: 3.5, label: "Satisfactory" },
  { min: 3.0, label: "Fair" },
  { min: 2.5, label: "Needs Improvement" },
  { min: 0, label: "Poor" },
];

function sanitizeScore(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function roundScore(value, decimals = 2) {
  const multiplier = 10 ** decimals;
  return Math.round(sanitizeScore(value) * multiplier) / multiplier;
}

function getDescriptiveRating(score) {
  const numericScore = sanitizeScore(score);
  if (numericScore <= 0) {
    return "No Data";
  }

  const match = DESCRIPTIVE_SCALE.find((scale) => numericScore >= scale.min);
  return match ? match.label : "No Data";
}

module.exports = {
  DESCRIPTIVE_SCALE,
  getDescriptiveRating,
  roundScore,
};

