'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from './supabase';

export interface AppUser {
  id: string;
  username: string;
  display_name: string;
  created_at: string;
  friend_id?: string; // linked friend record
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  login: (username: string, pin: string) => Promise<{ success: boolean; error?: string }>;
  register: (username: string, pin: string, displayName: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => ({ success: false }),
  register: async () => ({ success: false }),
  logout: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

// Simple SHA-256 hash for PIN
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + '_simplesplit_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount, check localStorage for saved session
  useEffect(() => {
    const saved = localStorage.getItem('simplesplit_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Verify user still exists in DB
        verifyUser(parsed.id).then(verified => {
          if (verified) {
            setUser(verified);
          } else {
            localStorage.removeItem('simplesplit_user');
          }
          setLoading(false);
        });
      } catch {
        localStorage.removeItem('simplesplit_user');
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  async function verifyUser(userId: string): Promise<AppUser | null> {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (!data) return null;

    // Find linked friend record
    const { data: friend } = await supabase
      .from('friends')
      .select('id')
      .eq('user_id', data.id)
      .single();

    return {
      id: data.id,
      username: data.username,
      display_name: data.display_name,
      created_at: data.created_at,
      friend_id: friend?.id || undefined,
    };
  }

  async function login(username: string, pin: string): Promise<{ success: boolean; error?: string }> {
    try {
      const pinHash = await hashPin(pin);
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username.toLowerCase().trim())
        .eq('pin_hash', pinHash)
        .single();

      if (error || !data) {
        return { success: false, error: 'Username atau PIN salah' };
      }

      // Find linked friend
      const { data: friend } = await supabase
        .from('friends')
        .select('id')
        .eq('user_id', data.id)
        .single();

      const appUser: AppUser = {
        id: data.id,
        username: data.username,
        display_name: data.display_name,
        created_at: data.created_at,
        friend_id: friend?.id || undefined,
      };

      setUser(appUser);
      localStorage.setItem('simplesplit_user', JSON.stringify(appUser));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Gagal login' };
    }
  }

  async function register(username: string, pin: string, displayName: string): Promise<{ success: boolean; error?: string }> {
    try {
      // Check if username exists
      const { data: existing } = await supabase
        .from('users')
        .select('id')
        .eq('username', username.toLowerCase().trim())
        .single();

      if (existing) {
        return { success: false, error: 'Username sudah dipakai' };
      }

      const pinHash = await hashPin(pin);

      // Create user
      const { data: newUser, error: userErr } = await supabase
        .from('users')
        .insert({
          username: username.toLowerCase().trim(),
          pin_hash: pinHash,
          display_name: displayName.trim(),
        })
        .select()
        .single();

      if (userErr || !newUser) {
        return { success: false, error: userErr?.message || 'Gagal membuat akun' };
      }

      // Create a friend record for this user
      const { data: newFriend, error: friendErr } = await supabase
        .from('friends')
        .insert({
          name: displayName.trim(),
          is_admin: false,
          user_id: newUser.id,
        })
        .select()
        .single();

      const appUser: AppUser = {
        id: newUser.id,
        username: newUser.username,
        display_name: newUser.display_name,
        created_at: newUser.created_at,
        friend_id: newFriend?.id || undefined,
      };

      setUser(appUser);
      localStorage.setItem('simplesplit_user', JSON.stringify(appUser));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Gagal register' };
    }
  }

  function logout() {
    setUser(null);
    localStorage.removeItem('simplesplit_user');
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
