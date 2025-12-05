import React from 'react';

const formatScore = (value) => {
  if (!value || Number.isNaN(Number(value))) {
    return '—';
  }
  return Number(value).toFixed(2);
};

const renderTableRows = (rows, emptyLabel) => {
  if (!rows || !rows.length) {
    return (
      <tr>
        <td colSpan="100%">{emptyLabel}</td>
      </tr>
    );
  }
  return rows;
};

const InstructorPerformancePrint = ({ data }) => {
  if (!data) {
    return null;
  }

  const {
    formTitle,
    reportTitle,
    instructorName,
    instructorEmail,
    department,
    courses,
    totalRespondents,
    uniqueRespondents,
    totalAverage,
    totalDescriptor,
    conversionScore,
    responderBreakdown,
    generalIndicators,
    masteryIndicators,
    allQuestions,
    textResponses,
  } = data;

  const title = reportTitle || 'HyFlex Teaching Performance Evaluation (Student)';
  const subtitle = formTitle || 'Instructor Performance Summary';
  const courseLabel = Array.isArray(courses) && courses.length > 0 ? courses.join(', ') : '—';

  return (
    <div className="print-container" aria-hidden="true">
      <div className="print-wrapper" id="instructor-print-report">
        <header className="print-header">
          <div className="print-header-brand">
            <p className="print-header-sup">BUKIDNON STATE UNIVERSITY</p>
            <p>Malaybalay City, Bukidnon, 8700</p>
            <p>Tel (088) 813-5661 to 5663; TeleFax (088) 813-2717;</p>
            <p className="print-header-link">www.buksu.edu.ph</p>
            <p>College of Technology</p>
          </div>
          <p className="print-header-subtitle">{title}</p>
          <h1 className="print-header-title">{subtitle}</h1>
        </header>

        <section className="print-section">
          <h2>Instructor Information</h2>
          <table className="print-table">
            <tbody>
              <tr>
                <th>Instructor Name</th>
                <td>{instructorName || '—'}</td>
              </tr>
              <tr>
                <th>Instructor Email</th>
                <td>{instructorEmail || '—'}</td>
              </tr>
              <tr>
                <th>Course / Department</th>
                <td>{department || courseLabel}</td>
              </tr>
              <tr>
                <th>Primary Course</th>
                <td>{courseLabel}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="print-section">
          <h2>Respondent Summary</h2>
          <table className="print-table">
            <tbody>
              <tr>
                <th>Total Respondents</th>
                <td>{totalRespondents ?? 0}</td>
              </tr>
              <tr>
                <th>Total Average Rating</th>
                <td>
                  {formatScore(totalAverage)} ({totalDescriptor || '—'})
                </td>
              </tr>
              <tr>
                <th>Faculty Reclassification Rating Conversion</th>
                <td>{conversionScore != null ? `${conversionScore}` : '—'}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="print-section">
          <h2>General Performance Indicators</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th>Question</th>
                <th>Average</th>
                <th>Descriptive</th>
              </tr>
            </thead>
            <tbody>
              {renderTableRows(
                (generalIndicators || []).map((question) => (
                  <tr key={question.key}>
                    <td>{question.question}</td>
                    <td>{formatScore(question.average)}</td>
                    <td>{question.descriptiveRating || '—'}</td>
                  </tr>
                )),
                'No general performance indicators defined.'
              )}
            </tbody>
          </table>
        </section>

        <section className="print-section">
          <h2>Mastery of the Subject Matter</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th>Question</th>
                <th>Average</th>
                <th>Descriptive</th>
              </tr>
            </thead>
            <tbody>
              {renderTableRows(
                (masteryIndicators || []).map((question) => (
                  <tr key={question.key}>
                    <td>{question.question}</td>
                    <td>{formatScore(question.average)}</td>
                    <td>{question.descriptiveRating || '—'}</td>
                  </tr>
                )),
                'No mastery indicators defined.'
              )}
            </tbody>
          </table>
        </section>

        <section className="print-section">
          <h2>All Evaluation Questions</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th>Question</th>
                <th>Average</th>
                <th>Descriptive</th>
                <th>Response Type</th>
              </tr>
            </thead>
            <tbody>
              {renderTableRows(
                (allQuestions || []).map((question) => (
                  <tr key={question.key}>
                    <td>{question.question}</td>
                    <td>{formatScore(question.average)}</td>
                    <td>{question.descriptiveRating || '—'}</td>
                    <td>{question.isNumeric ? 'Numeric (1-5)' : 'Text'}</td>
                  </tr>
                )),
                'No questions available for this report.'
              )}
            </tbody>
          </table>
        </section>

        <section className="print-section">
          <h2>Text Responses & Comments</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th>Question</th>
                <th>Response</th>
              </tr>
            </thead>
            <tbody>
              {textResponses && textResponses.length > 0 ? (
                textResponses.map((response) => (
                  <tr key={response.key}>
                    <td>{response.question}</td>
                    <td>{response.response}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="2">No text responses recorded.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
};

export default InstructorPerformancePrint;

