// web/src/hooks/useUser.js
import { createContext, useContext, useEffect, useState } from 'react';
import { fetchProfile } from '../lib/api';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    fetchProfile().then(setUser).catch(() => setUser(null));
  }, []);

  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}
