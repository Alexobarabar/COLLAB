const express = require('express');
const app = express();
const PORT = 3000;

// Middleware to read JSON and form data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Fake user data for testing
const users = [
  { email: 'admin@example.com', password: '12345' },
  { email: 'user@example.com', password: 'password' }
];

// Route to show a message
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the login API! Use POST /login to log in.' });
});

// Login route
app.post('/login', (req, res) => {
  const { email, password } = req.body;

  // Check user credentials
  const user = users.find(u => u.email === email && u.password === password);

  if (user) {
    res.json({ success: true, message: `Welcome, ${email}!` });
  } else {
    res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
