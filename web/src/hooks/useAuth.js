// web/src/hooks/useAuth.js
export const TOKEN_KEY = 'coldbase_token';

export function useAuth() {
  function login(token) {
    localStorage.setItem(TOKEN_KEY, token);
    window.postMessage({ source: 'coldbase-webapp', type: 'COLDBASE_LOGIN', token }, '*');
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    window.postMessage({ source: 'coldbase-webapp', type: 'COLDBASE_LOGOUT' }, '*');
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function isAuthenticated() {
    return !!getToken();
  }

  function getUserEmail() {
    const token = getToken();
    if (!token) return null;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.email ?? null;
    } catch {
      return null;
    }
  }

  return { login, logout, getToken, isAuthenticated, getUserEmail };
}
