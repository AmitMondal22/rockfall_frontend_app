import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (token) {
            api.auth.me().then(data => setUser(data.user)).catch(() => { localStorage.clear(); }).finally(() => setLoading(false));
        } else { setLoading(false); }
    }, []);

    const login = async (email, password) => {
        const data = await api.auth.login({ email, password });
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        setUser(data.user);
        return data;
    };

    const logout = async () => {
        try { await api.auth.logout(); } catch { }
        localStorage.clear();
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, setUser, login, logout, loading, isAdmin: user?.role === 'SUPER_ADMIN', isOrgAdmin: user?.role === 'ORG_ADMIN' || user?.role === 'SUPER_ADMIN' }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
