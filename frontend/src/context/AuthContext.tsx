import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserProfile, AuthStatus } from '../types';
import { checkAuthStatus, login as apiLogin, logout as apiLogout, changePassword as apiChangePassword } from '../services/api';
import { toast } from '../components/Toast';

interface AuthContextType {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  mustChangePassword: boolean;
  isChangePasswordOpen: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  openChangePasswordModal: () => void;
  closeChangePasswordModal: () => void;
  checkStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState<boolean>(false);

  const checkStatus = useCallback(async () => {
    try {
      const status: AuthStatus = await checkAuthStatus();
      if (status.authenticated && status.user) {
        setUser(status.user);
        setIsAuthenticated(true);
        setMustChangePassword(status.must_change_password);
        if (status.must_change_password) {
          setIsChangePasswordOpen(true);
        }
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setMustChangePassword(false);
      }
    } catch (err) {
      console.warn('Authentication status check failed:', err);
      setUser(null);
      setIsAuthenticated(false);
      setMustChangePassword(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  // Handle automatic session expiration from 401 interceptor
  useEffect(() => {
    const handleUnauthorized = () => {
      if (isAuthenticated) {
        setUser(null);
        setIsAuthenticated(false);
        setMustChangePassword(false);
        setIsChangePasswordOpen(false);
        toast.warning('Your session has expired. Please log in again.');
      }
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [isAuthenticated]);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await apiLogin({ username, password });
      if (res.success && res.user) {
        setUser(res.user);
        setIsAuthenticated(true);
        setMustChangePassword(res.must_change_password);
        if (res.must_change_password) {
          setIsChangePasswordOpen(true);
        }
        toast.success(`Welcome back, ${res.user.username}!`);
        return true;
      }
      return false;
    } catch (err: any) {
      toast.error(err.message || 'Login failed. Please check your credentials.');
      throw err;
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await apiLogout();
      toast.info('You have been logged out.');
    } catch (err) {
      console.warn('Logout API error:', err);
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      setMustChangePassword(false);
      setIsChangePasswordOpen(false);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string): Promise<boolean> => {
    try {
      const res = await apiChangePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      if (res.success) {
        setMustChangePassword(false);
        setIsChangePasswordOpen(false);
        toast.success('Password updated successfully! Your account is secured.');
        return true;
      }
      return false;
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password.');
      throw err;
    }
  };

  const openChangePasswordModal = () => setIsChangePasswordOpen(true);
  const closeChangePasswordModal = () => {
    if (!mustChangePassword) {
      setIsChangePasswordOpen(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated,
        isLoading,
        mustChangePassword,
        isChangePasswordOpen,
        login,
        logout,
        changePassword,
        openChangePasswordModal,
        closeChangePasswordModal,
        checkStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
