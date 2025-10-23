# IT Instructor Evaluation and Feedback System

A comprehensive MERN stack web application for evaluating IT instructors at the College of Technology. Students can submit evaluations, view their submission history, and administrators can manage instructors and view evaluation reports.

## 🚀 Features

### Student Features
- **Submit Evaluations**: Rate instructors on multiple criteria (1-5 scale)
- **Anonymous Submissions**: Option to submit evaluations anonymously
- **View History**: See all previously submitted evaluations
- **Detailed Feedback**: Provide strengths, areas for improvement, and additional comments

### Admin Features
- **Instructor Management**: Add, edit, and remove instructors
- **Evaluation Reports**: View all submitted evaluations
- **Statistics**: Get aggregated rating statistics
- **Course Management**: Assign courses to instructors

### Technical Features
- **MERN Stack**: MongoDB, Express.js, React, Node.js
- **Authentication**: Google OAuth and local authentication
- **Responsive Design**: Mobile-friendly interface
- **Real-time Updates**: Live data updates
- **Data Validation**: Comprehensive input validation

## 🛠️ Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **Passport.js** - Authentication
- **JWT** - Token-based authentication
- **bcrypt** - Password hashing

### Frontend
- **React** - UI library
- **Axios** - HTTP client
- **React Router** - Navigation
- **CSS3** - Styling

## 📋 Prerequisites

- Node.js (v14 or higher)
- MongoDB (local or cloud)
- npm or yarn

## 🚀 Installation & Setup

### 1. Clone the Repository
```bash
git clone <repository-url>
cd college-of-technology-it-instructor-evaluation-system
```

### 2. Install Dependencies

#### Root Dependencies
```bash
npm install
```

#### Backend Dependencies
```bash
cd backend
npm install
```

#### Frontend Dependencies
```bash
cd frontend
npm install
```

### 3. Environment Configuration

Create a `.env` file in the `backend` directory:

```env
# MongoDB Connection
MONGO_URI=mongodb://localhost:27017/instructor_evaluation

# Server Configuration
PORT=5000

# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_CALLBACK_URL=http://localhost:5000/api/auth/google/callback

# Session Secret
SESSION_SECRET=your_super_secret_session_key_here
```

### 4. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs:
   - `http://localhost:5000/api/auth/google/callback`
6. Copy Client ID and Client Secret to your `.env` file

### 5. Database Setup

Make sure MongoDB is running on your system:
```bash
# Start MongoDB (if installed locally)
mongod
```

## 🚀 Running the Application

### Development Mode (Recommended)
```bash
# From the root directory
npm run dev
```

This will start both backend and frontend servers concurrently.

### Individual Servers

#### Backend Only
```bash
cd backend
npm run dev
```

#### Frontend Only
```bash
cd frontend
npm start
```

## 📱 Usage

### For Students
1. Open `http://localhost:3000`
2. Navigate to "Submit Evaluation"
3. Select an instructor and fill in course details
4. Rate the instructor on various criteria
5. Provide feedback and submit

### For Administrators
1. Access the admin panel
2. Manage instructors (add, edit, remove)
3. View evaluation reports and statistics
4. Monitor system activity

## 🗂️ Project Structure

```
college-of-technology-it-instructor-evaluation-system/
├── backend/
│   ├── config/
│   │   └── passport.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Instructor.js
│   │   └── Evaluation.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── instructorRoutes.js
│   │   └── evaluationRoutes.js
│   ├── server.js
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Dashboard.js
│   │   │   ├── EvaluationForm.js
│   │   │   ├── AdminPanel.js
│   │   │   └── LoginPage.js
│   │   ├── App.js
│   │   └── index.js
│   └── package.json
└── package.json
```

## 🔧 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/google` - Google OAuth
- `GET /api/auth/google/callback` - Google OAuth callback

### Instructors
- `GET /api/instructors` - Get all instructors
- `GET /api/instructors/:id` - Get instructor by ID
- `POST /api/instructors` - Create instructor
- `PUT /api/instructors/:id` - Update instructor
- `DELETE /api/instructors/:id` - Delete instructor

### Evaluations
- `POST /api/evaluations` - Submit evaluation
- `GET /api/evaluations` - Get all evaluations (admin)
- `GET /api/evaluations/instructor/:id` - Get evaluations by instructor
- `GET /api/evaluations/student/:id` - Get student's evaluations
- `GET /api/evaluations/stats/:id` - Get evaluation statistics

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   - Ensure MongoDB is running
   - Check MONGO_URI in .env file

2. **Google OAuth Error**
   - Verify Google OAuth credentials
   - Check callback URL configuration

3. **Port Already in Use**
   - Change PORT in .env file
   - Kill existing processes using the port

4. **CORS Errors**
   - Check CORS configuration in server.js
   - Ensure frontend URL is whitelisted

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 👥 Authors

- **Alexander John Abarabar** - Initial work

## 🙏 Acknowledgments

- College of Technology for the project requirements
- MERN stack community for resources and support
