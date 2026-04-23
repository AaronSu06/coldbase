// web/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import LoginPage from './components/LoginPage';
import SignupPage from './components/SignupPage';
import ProfilePage from './components/ProfilePage';
import ErrorBoundary from './components/ErrorBoundary';
import PrivacyPage from './components/PrivacyPage';
import TermsPage from './components/TermsPage';
import GoogleAuthCallback from './components/GoogleAuthCallback';
import AuthPage from './components/AuthPage';
import './index.css';
import { TOKEN_KEY } from './hooks/useAuth.js';

function PrivateRoute({ children }) {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? children : <Navigate to="/auth/login" replace />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<SignupPage />} />
        <Route path="/auth/google/callback" element={<GoogleAuthCallback />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/login" element={<Navigate to="/auth/login" replace />} />
        <Route path="/signup" element={<Navigate to="/auth/register" replace />} />
        <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
        <Route path="/settings" element={<PrivateRoute><App /></PrivateRoute>} />
        <Route path="/tracker" element={<PrivateRoute><App /></PrivateRoute>} />
        <Route path="/dashboard" element={<PrivateRoute><App /></PrivateRoute>} />
        <Route path="/legal/privacy" element={<PrivacyPage />} />
        <Route path="/legal/terms" element={<TermsPage />} />
        <Route path="/*" element={<PrivateRoute><App /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
