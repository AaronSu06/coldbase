import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function GoogleAuthCallback() {
  const [searchParams] = useSearchParams();
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const token = searchParams.get('token');
    const error = searchParams.get('error');
    if (token) {
      login(token);
      navigate('/', { replace: true });
    } else {
      navigate(`/auth?error=${error ?? 'google_failed'}`, { replace: true });
    }
  }, []);

  return null;
}
