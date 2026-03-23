// web/src/main.jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import App from './App';
import AuthPage from './components/AuthPage';
import ProfilePage from './components/ProfilePage';
import './index.css';
import { TOKEN_KEY } from './hooks/useAuth.js';

function PrivateRoute({ children }) {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? children : <Navigate to="/auth" replace />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/login" element={<Navigate to="/auth" replace />} />
        <Route path="/signup" element={<Navigate to="/auth?mode=signup" replace />} />
        <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
        <Route path="/settings" element={<PrivateRoute><App initialSection="settings" /></PrivateRoute>} />
        <Route path="/tracker" element={<PrivateRoute><App initialSection="tracker" /></PrivateRoute>} />
        <Route path="/dashboard" element={<PrivateRoute><App initialSection="home" /></PrivateRoute>} />
        <Route path="/*" element={<PrivateRoute><App /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
