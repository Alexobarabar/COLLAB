// dashboard.js
const express = require("express");
const router = express.Router();
const path = require("path");

// Escape HTML helper to safely imprint server values into the page
function escapeHtml(unsafe) {
  return String(unsafe || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

router.get("/", (req, res) => {
  if (!req.isAuthenticated || !req.isAuthenticated()) return res.redirect("/login-page");

  // Server-side initial data (replace with real DB queries later)
  const userName = req.user && req.user.name ? escapeHtml(req.user.name) : "Admin";
  // sample metrics (in real app replace with counts from DB)
  const initialData = {
    totalSurveys: 12,
    totalInstructors: 40,
    totalResponses: 432,
    // sample instructors + ratings for chart
    instructors: [
      { name: "Prof. Santos", rating: 4.3 },
      { name: "Dr. Reyes", rating: 3.8 },
      { name: "Prof. Cruz", rating: 4.7 },
      { name: "Ms. Ortega", rating: 4.1 },
      { name: "Mr. Dela Torre", rating: 3.9 }
    ],
    // sample recent surveys
    recentSurveys: [
      { id: 1, title: "Faculty Development Needs", submittedAt: "2025-10-17 14:23", responses: 18 },
      { id: 2, title: "IT Services Feedback", submittedAt: "2025-10-15 09:40", responses: 25 },
      { id: 3, title: "Course Delivery Evaluation", submittedAt: "2025-10-12 11:12", responses: 12 }
    ]
  };

  res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>BukSU IT Evaluation — Dashboard</title>

  <!-- Fonts -->
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap" rel="stylesheet">

  <!-- Chart.js -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>

  <style>
    :root{
      --bg: #f7f8fb;
      --card: #ffffff;
      --muted: #6b7280;
      --accent: #0f172a;
      --accent-2: #2563eb;
    }
    html,body{height:100%; margin:0; font-family: 'Poppins', system-ui, Arial; background:var(--bg); color:#111;}
    .app { display:flex; height:100vh; overflow:hidden; }
    /* Sidebar */
    .sidebar { width:260px; background: linear-gradient(180deg,#0b61ff,#0836b3); color:#fff; padding:28px 18px; box-shadow: 3px 0 12px rgba(12,24,63,0.08); display:flex; flex-direction:column; }
    .logo { display:block; width:56px; height:56px; border-radius:8px; background:#fff; color:#0b61ff; font-weight:700; display:flex; align-items:center; justify-content:center; margin-bottom:18px; }
    .brand { font-size:16px; font-weight:600; margin-bottom:18px; }
    .create-btn { background:rgba(0,0,0,0.65); color:white; padding:10px 12px; border-radius:8px; text-decoration:none; display:inline-block; margin-bottom:18px; box-shadow:0 6px 18px rgba(2,6,23,0.2); }
    .menu { margin-top:12px; display:flex; flex-direction:column; gap:10px; }
    .menu-item { padding:10px 12px; border-radius:8px; background:rgba(255,255,255,0.03); cursor:default; display:flex; align-items:center; gap:10px; color:rgba(255,255,255,0.95); font-weight:500; }
    .menu-item:hover { background:rgba(255,255,255,0.06); }

    /* Main Area */
    .main { flex:1; display:flex; flex-direction:column; overflow:auto; }
    .header { display:flex; justify-content:space-between; align-items:center; padding:20px 36px; background:transparent; border-bottom:1px solid rgba(15,23,42,0.04); }
    .page-title { font-size:18px; color:var(--accent); font-weight:600; }
    .logout { padding:8px 12px; background:var(--accent-2); color:#fff; border-radius:8px; border:none; cursor:pointer; }

    .content { padding:28px 36px; display:flex; flex-direction:column; gap:20px; }

    /* Cards & grid */
    .metrics { display:flex; gap:16px; }
    .card { background:var(--card); padding:18px; border-radius:10px; box-shadow:0 8px 20px rgba(17,24,39,0.06); flex:1; min-width:0; }
    .card h3 { margin:0; color:var(--muted); font-weight:600; font-size:13px; }
    .card .value { margin-top:10px; font-size:26px; font-weight:700; color:var(--accent); }

    .grid { display:grid; grid-template-columns: 1fr 360px; gap:18px; margin-top:8px; align-items:start; }

    .chart-box { background:var(--card); border-radius:10px; padding:12px; box-shadow:0 8px 20px rgba(17,24,39,0.06); height:320px; }
    .recent { background:var(--card); border-radius:10px; padding:12px; box-shadow:0 8px 20px rgba(17,24,39,0.06); max-height:320px; overflow:auto; }
    .recent-item { padding:10px 8px; border-bottom:1px dashed #eef2f6; display:flex; justify-content:space-between; gap:10px; align-items:center; }
    .recent-item:last-child { border-bottom:none; }

    .profile { background:linear-gradient(180deg,#0b1220,#071029); color:#fff; padding:14px; border-radius:10px; text-align:center; }
    .profile img { width:68px; height:68px; border-radius:50%; margin-bottom:8px; border:3px solid rgba(255,255,255,0.08); }
    .small { font-size:13px; color:var(--muted); }

    .btn { display:inline-block; padding:8px 10px; border-radius:8px; border:none; cursor:pointer; font-weight:600; }
    .btn-outline { background:transparent; border:1px solid #e6eaf2; color:var(--accent); }
    .btn-primary { background:var(--accent-2); color:white; }

    footer { padding:18px 36px; color:var(--muted); font-size:13px; text-align:center; }

    @media(max-width:1000px){
      .grid { grid-template-columns: 1fr; }
      .sidebar { display:none; }
    }
  </style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="logo">BUKSU</div>
      <div class="brand">College of Technology</div>
      <a class="create-btn" id="createSurveyBtn">+ Create Survey</a>
      <nav class="menu" aria-label="Main menu">
        <div class="menu-item">📊 Dashboard</div>
        <div class="menu-item">📝 Surveys</div>
        <div class="menu-item">👥 Instructors</div>
        <div class="menu-item">⚙ Settings</div>
      </nav>
    </aside>

    <main class="main" role="main">
      <header class="header">
        <div class="page-title">BukSU College of Technology IT Evaluation System</div>
        <div>
          <span class="small" style="margin-right:10px">Hello, ${escapeHtml(userName)}</span>
          <button class="logout" onclick="window.location.href='/logout'">Log Out</button>
        </div>
      </header>

      <section class="content">
        <!-- Metrics -->
        <div class="metrics">
          <div class="card">
            <h3>Total Surveys</h3>
            <div class="value" id="metric-surveys">0</div>
            <div class="small">Number of surveys created</div>
          </div>

          <div class="card">
            <h3>Total Instructors</h3>
            <div class="value" id="metric-instructors">0</div>
            <div class="small">Active instructors</div>
          </div>

          <div class="card">
            <h3>Total Responses</h3>
            <div class="value" id="metric-responses">0</div>
            <div class="small">All collected responses</div>
          </div>
        </div>

        <!-- Grid: Chart + Sidebar widgets -->
        <div class="grid">
          <div>
            <div class="chart-box">
              <canvas id="ratingsChart" style="width:100%; height:100%;"></canvas>
            </div>

            <div style="height:18px"></div>

            <div class="recent" id="recentSurveys">
              <h4 style="margin:0 0 8px 0;">📋 Recently Submitted Surveys</h4>
              <!-- recent list will be injected here -->
            </div>
          </div>

          <aside>
            <div class="profile" aria-hidden="false">
              <img src="/buksu-logo.png" alt="BUKSU" />
              <div style="font-weight:700; margin-top:6px;">${escapeHtml(userName)}</div>
              <div class="small">College Dean / Admin</div>
            </div>

            <div style="height:14px"></div>

            <div class="card" style="padding:14px;">
              <h3 style="margin-top:0">Quick Actions</h3>
              <div style="display:flex; gap:8px; margin-top:10px;">
                <button class="btn btn-primary" id="exportBtn">Export</button>
                <button class="btn btn-outline" id="manageBtn">Manage Surveys</button>
              </div>
              <div style="margin-top:12px; font-size:13px; color:var(--muted)">Use quick actions to export or manage surveys.</div>
            </div>
          </aside>
        </div>

        <footer>&copy; 2025 BukSU College of Technology — IT Evaluation System</footer>
      </section>
    </main>
  </div>

  <!-- initial data from server -->
  <script>
    window.__INITIAL_DASHBOARD__ = ${JSON.stringify(initialData)};
  </script>

  <!-- Client JS: populate metrics, chart, and recent list -->
  <script>
    (function(){
      // Read initial data
      const data = window.__INITIAL_DASHBOARD__ || {};
      const metrics = {
        surveys: data.totalSurveys || 0,
        instructors: data.totalInstructors || 0,
        responses: data.totalResponses || 0
      };

      // Populate metric cards
      document.getElementById('metric-surveys').textContent = metrics.surveys;
      document.getElementById('metric-instructors').textContent = metrics.instructors;
      document.getElementById('metric-responses').textContent = metrics.responses;

      // Prepare chart data (bar)
      const instructors = Array.isArray(data.instructors) ? data.instructors : [];
      const labels = instructors.map(i => i.name);
      const values = instructors.map(i => Math.round((Number(i.rating) || 0) * 10) / 10);

      // Create Chart.js bar chart
      const ctx = document.getElementById('ratingsChart').getContext('2d');
      // Destroy existing chart if re-run
      if (window._ratingsChart) {
        try { window._ratingsChart.destroy(); } catch(e){/* ignore */ }
      }

      window._ratingsChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'Rating (1-5)',
            data: values,
            backgroundColor: labels.map(() => 'rgba(15,99,255,0.85)'),
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              suggestedMin: 0,
              suggestedMax: 5,
              ticks: { stepSize: 1 }
            }
          },
          plugins: {
            legend: { display: false },
            title: { display: true, text: 'Instructor Ratings Overview' }
          }
        }
      });

      // Populate recent surveys list
      const recentList = document.getElementById('recentSurveys');
      function renderRecent() {
        const surveys = Array.isArray(data.recentSurveys) ? data.recentSurveys : [];
        // clear current items but keep the header h4
        // remove nodes after first child (h4)
        while (recentList.childNodes.length > 1) recentList.removeChild(recentList.lastChild);

        if (surveys.length === 0) {
          const p = document.createElement('div');
          p.className = 'small';
          p.style.padding = '8px';
          p.textContent = 'No recent surveys available.';
          recentList.appendChild(p);
          return;
        }

        surveys.forEach(s => {
          const el = document.createElement('div');
          el.className = 'recent-item';
          el.innerHTML = '<div><strong>' + escapeHtml(s.title) + '</strong><div class="small">Submitted: ' + escapeHtml(s.submittedAt) + '</div></div>'
                       + '<div style="text-align:right;"><div class="small">Responses: ' + escapeHtml(String(s.responses)) + '</div>'
                       + '<button class="btn btn-outline" data-id="'+escapeHtml(String(s.id))+'" style="margin-top:8px;">Delete</button></div>';
          recentList.appendChild(el);

          // add delete handler
          const btn = el.querySelector('button');
          btn.addEventListener('click', function(){
            const id = this.getAttribute('data-id');
            // remove from data and re-render (client-only)
            data.recentSurveys = data.recentSurveys.filter(x => String(x.id) !== String(id));
            renderRecent();
            // update metrics (optional)
            metrics.surveys = Math.max(0, metrics.surveys - 1);
            document.getElementById('metric-surveys').textContent = metrics.surveys;
          });
        });
      }

      // helper escape (client-side)
      function escapeHtml(unsafe) {
        return String(unsafe || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      renderRecent();

      // Quick actions
      document.getElementById('exportBtn').addEventListener('click', function(){
        alert('Export (demo) — implement server-side export when ready.');
      });
      document.getElementById('manageBtn').addEventListener('click', function(){
        window.location.href = '/manage-surveys';
      });

      // Create Survey demo action -> add dummy survey client-side
      document.getElementById('createSurveyBtn').addEventListener('click', function(){
        const id = Date.now();
        const newSurvey = {
          id,
          title: 'New Survey ' + String(id).slice(-4),
          submittedAt: new Date().toLocaleString(),
          responses: Math.floor(Math.random() * 20) + 1
        };
        data.recentSurveys.unshift(newSurvey);
        // update metrics
        metrics.surveys += 1;
        document.getElementById('metric-surveys').textContent = metrics.surveys;
        renderRecent();
      });

    })();
  </script>
</body>
</html>`);
});

module.exports = router;
