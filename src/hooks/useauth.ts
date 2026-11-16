// src/hooks/useauth.ts
// Sign-out for the warranty app. Sign-in itself is Supabase email + password (see loginpage).

import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const QDEF_TOKEN_KEY    = 'qdef_token';
const QDEF_EXPIRY_KEY   = 'qdef_expiry';
const QDEF_USERNAME_KEY = 'qdef_username';

export function useAuth() {
  const navigate = useNavigate();

  async function signOut() {
    await supabase.auth.signOut();
    localStorage.removeItem(QDEF_TOKEN_KEY);
    localStorage.removeItem(QDEF_EXPIRY_KEY);
    localStorage.removeItem(QDEF_USERNAME_KEY);
    localStorage.removeItem('combryx_user');
    navigate('/warranty/login', { replace: true });
  }

  function getUsername(): string {
    return localStorage.getItem(QDEF_USERNAME_KEY) || '';
  }

  function isAuthenticated(): boolean {
    const token  = localStorage.getItem(QDEF_TOKEN_KEY);
    const expiry = localStorage.getItem(QDEF_EXPIRY_KEY);
    if (!token || !expiry) return false;
    return Date.now() < parseInt(expiry);
  }

  return { signOut, getUsername, isAuthenticated };
}