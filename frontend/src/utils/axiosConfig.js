/**
 * Axios Configuration with Automatic Token Injection
 * This ensures all API requests include the authentication token
 */

import axios from 'axios';

// Create axios instance
const api = axios.create({
  baseURL: 'http://localhost:5000/api',
  timeout: 30000,
});

// Request interceptor to add auth token to all requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle common errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle 401 Unauthorized - redirect to login
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('tokenExpiry');
      window.location.href = '/login';
    }
    
    // Handle 403 Forbidden - feature disabled
    if (error.response?.status === 403) {
      console.warn('Feature disabled:', error.response?.data?.feature);
    }
    
    return Promise.reject(error);
  }
);

export default api;

