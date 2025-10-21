# BukSU College of Technology IT Evaluation System

A full-stack web application for managing instructor evaluations and surveys, built with React frontend and Node.js/Express backend.

## 🚀 Quick Start

### Option 1: Use the Development Script (Recommended)
```bash
./start-dev.sh
```

This will start both the backend and frontend servers simultaneously.

### Option 2: Manual Setup

#### Backend Setup
```bash
cd backend
npm install
npm run dev
```
Backend will run on http://localhost:5000

#### Frontend Setup
```bash
cd frontend
npm install
npm start
```
Frontend will run on http://localhost:3000

## 🔧 Features

### Backend (Node.js/Express)
- **Authentication**: User registration and login with bcrypt password hashing
- **Database**: MongoDB integration with Mongoose
- **CORS**: Configured for frontend communication
- **API Endpoints**:
  - `POST /api/register` - User registration
  - `POST /api/login` - User login
  - `GET /api/dashboard` - Dashboard data (JSON)
  - `GET /api/health` - Health check
  - `GET /` - API status

### Frontend (React)
- **Authentication**: Login and registration forms
- **Dashboard**: Interactive dashboard with metrics and charts
- **State Management**: React Context for authentication
- **API Integration**: Service layer for backend communication
- **Responsive Design**: Mobile-friendly interface

## 📁 Project Structure

```
├── backend/
│   ├── config/          # Passport configuration
│   ├── models/          # MongoDB models
│   ├── routes/          # API routes
│   ├── server.js        # Main server file
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── contexts/    # React Context providers
│   │   ├── services/    # API service layer
│   │   └── App.js       # Main app component
│   └── package.json
└── start-dev.sh         # Development script
```

## 🔐 Environment Variables

### Backend (.env)
```
PORT=5000
MONGO_URI=your_mongodb_connection_string
FRONTEND_URL=http://localhost:3000
```

### Frontend (.env)
```
REACT_APP_API_URL=http://localhost:5000
REACT_APP_API_BASE_URL=http://localhost:5000/api
```

## 🧪 Testing the Integration

1. **Start the servers** using the development script
2. **Open** http://localhost:3000 in your browser
3. **Register** a new account or **login** with existing credentials
4. **View** the dashboard with sample data from the backend

## 🔄 API Communication

The frontend communicates with the backend through:
- **API Service Layer** (`src/services/api.js`)
- **Authentication Context** (`src/contexts/AuthContext.js`)
- **CORS Configuration** for cross-origin requests

## 🎨 UI Components

- **Login/Register Forms**: Clean, responsive authentication forms
- **Dashboard**: Metrics cards, charts, and recent surveys list
- **Loading States**: User-friendly loading indicators
- **Error Handling**: Comprehensive error messages

## 🚀 Next Steps

- Add JWT token-based authentication
- Implement real-time data updates
- Add more dashboard features
- Create survey management functionality
- Add data visualization charts
- Implement user roles and permissions

## 🛠️ Development

- Backend uses nodemon for auto-restart
- Frontend uses Create React App with hot reload
- Both servers run concurrently for development
- MongoDB connection is configured and ready

## 📝 Notes

- The backend includes both HTML dashboard (legacy) and JSON API endpoints
- Frontend uses modern React hooks and context for state management
- All API calls are handled through the centralized service layer
- CORS is properly configured for local development