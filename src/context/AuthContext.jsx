import { useState, useEffect } from 'react';
import api from '../services/api';
import { AuthContext } from './auth-context';

const normalizeUser = (userData) => {
    if (!userData) return null;
    const org = userData.organization || {};
    const orgId = userData.organizationId || userData.org_id || org.id || org._id;
    const orgName = userData.organizationName || org.name;
    const orgLogo = userData.organizationLogo || org.logo_url || org.logo;

    if (orgLogo) {
        try { localStorage.setItem('lastOrgLogo', orgLogo); } catch (e) {}
    }
    if (orgName) {
        try { localStorage.setItem('lastOrgName', orgName); } catch (e) {}
    }

    return {
        ...userData,
        _id: userData._id || userData.id,
        id: userData.id || userData._id,
        organizationId: orgId,
        org_id: orgId,
        organizationName: orgName,
        organizationLogo: orgLogo,
        organization: {
            ...org,
            id: orgId,
            name: orgName,
            logo_url: orgLogo
        }
    };
};

export const AuthProvider = ({ children }) => {
    const [user, setUserState] = useState(null);
    const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('accessToken')));

    const setUser = (userData) => setUserState(normalizeUser(userData));

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (!token) return;
        api.auth.me()
            .then(data => setUser(data.user))
            .catch(() => localStorage.clear())
            .finally(() => setLoading(false));
    }, []);

    const login = async (email, password) => {
        const data = await api.auth.login({ email, password });
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        setUser(data.user);
        return data;
    };

    const logout = async () => {
        try { await api.auth.logout(); } catch (err) { console.warn('Logout request failed:', err.message); }
        localStorage.clear();
        setUser(null);
    };

    const isSuperAdmin = user?.role === 'SUPER_ADMIN';
    const isOrgAdmin = isSuperAdmin || user?.role === 'ORG_ADMIN';
    const isProjectUser = isOrgAdmin || user?.role === 'PROJECT_ADMIN' || user?.role === 'PROJECT_USER';
    const isLocationUser = user?.role === 'LOCATION_USER' || user?.role === 'SITE_USER';
    const isAssetUser = user?.role === 'ASSET_USER';
    const canRemoveDevice = Boolean(user && ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_ADMIN', 'PROJECT_USER'].includes(user.role));
    const canAddDevice = Boolean(user && ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_ADMIN', 'PROJECT_USER', 'LOCATION_USER', 'SITE_USER', 'ASSET_USER', 'USER'].includes(user.role));
    const canManageUsers = Boolean(user && ['SUPER_ADMIN', 'ORG_ADMIN', 'PROJECT_ADMIN'].includes(user.role));

    return (
        <AuthContext.Provider value={{
            user,
            setUser,
            login,
            logout,
            loading,
            isAdmin: isSuperAdmin,
            isSuperAdmin,
            isOrgAdmin,
            isProjectUser,
            isLocationUser,
            isAssetUser,
            canRemoveDevice,
            canAddDevice,
            canManageUsers
        }}>
            {children}
        </AuthContext.Provider>
    );
};
