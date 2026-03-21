// web/src/hooks/useAuth.js
const TOKEN_KEY = 'reach_token';

export function useAuth() {
  function login(token) {
    localStorage.setItem(TOKEN_KEY, token);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function isAuthenticated() {
    return !!getToken();
  }

  return { login, logout, getToken, isAuthenticated };
}
