import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { LayoutDashboard, Cpu, MapPin, Building2, Users, Bell, BarChart3, Settings, LogOut, Sun, Moon, Monitor, X } from 'lucide-react';
import blackLogo from '../assets/black_logo.png';
import whiteLogo from '../assets/white_logo.png';

const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/devices', icon: Cpu, label: 'Devices' },
    { to: '/locations', icon: MapPin, label: 'Locations', roles: ['SUPER_ADMIN', 'ORG_ADMIN'] },
    { to: '/organizations', icon: Building2, label: 'Organizations', roles: ['SUPER_ADMIN'] },
    { to: '/users', icon: Users, label: 'Users', roles: ['SUPER_ADMIN', 'ORG_ADMIN'] },
    { to: '/alert-rules', icon: Bell, label: 'Alert Rules', roles: ['SUPER_ADMIN', 'ORG_ADMIN'] },
    { to: '/historical', icon: BarChart3, label: 'Historical Data' },
    { to: '/settings', icon: Settings, label: 'Settings' }
];

const themeOptions = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'dark', icon: Moon, label: 'Dark' },
    { value: 'system', icon: Monitor, label: 'System' }
];

export default function Sidebar({ onClose }) {
    const { user, logout } = useAuth();
    const { theme, resolvedTheme, setTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    return (
        <aside className={`h-full w-64 border-r flex flex-col ${isDark ? 'bg-[#111] border-[#333]' : 'bg-white border-[#e0e0e0]'}`}>
            {/* Logo */}
            <div className={`p-5 md:p-6 border-b ${isDark ? 'border-[#333]' : 'border-[#e0e0e0]'}`}>
                <div className="flex items-center gap-3">
                    <img src={isDark ? whiteLogo : blackLogo} alt="RockFall Logo" className="w-10 h-10 rounded-xl object-contain" />
                    <div className="flex-1">
                        <h1 className={`text-lg font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#111]'}`}>RockFall</h1>
                        <p className={`text-xs ${isDark ? 'text-[#999]' : 'text-[#666]'}`}>Monitoring Platform</p>
                    </div>
                    {onClose && <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg hover:bg-surface-3 transition"><X className="w-5 h-5" /></button>}
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                {navItems.map(item => {
                    if (item.roles && !item.roles.includes(user?.role)) return null;
                    return (
                        <NavLink key={item.to} to={item.to} end={item.to === '/'} onClick={onClose}
                            className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${isActive
                                ? (isDark ? 'bg-white text-black' : 'bg-[#111] text-white')
                                : (isDark ? 'text-[#999] hover:text-white hover:bg-[#222]' : 'text-[#666] hover:text-[#111] hover:bg-[#f0f0f0]')}`}>
                            <item.icon className="w-5 h-5" />
                            {item.label}
                        </NavLink>
                    );
                })}
            </nav>

            {/* Theme Toggle */}
            <div className="px-4 pb-2">
                <div className={`flex rounded-xl p-1 ${isDark ? 'bg-[#1a1a1a]' : 'bg-[#f0f0f0]'}`}>
                    {themeOptions.map(opt => (
                        <button key={opt.value} onClick={() => setTheme(opt.value)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-all ${theme === opt.value
                                ? (isDark ? 'bg-white text-black' : 'bg-[#111] text-white')
                                : (isDark ? 'text-[#666] hover:text-[#999]' : 'text-[#999] hover:text-[#666]')}`}>
                            <opt.icon className="w-3.5 h-3.5" />
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* User */}
            <div className={`p-4 border-t ${isDark ? 'border-[#333]' : 'border-[#e0e0e0]'}`}>
                <div className="flex items-center gap-3 mb-4 px-2">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${isDark ? 'bg-[#222] text-white' : 'bg-[#e8e8e8] text-[#111]'}`}>{user?.name?.charAt(0) || 'U'}</div>
                    <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-[#111]'}`}>{user?.name}</p>
                        <p className={`text-xs truncate ${isDark ? 'text-[#666]' : 'text-[#999]'}`}>{user?.role?.replace('_', ' ')}</p>
                    </div>
                </div>
                <button onClick={logout} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all ${isDark ? 'text-[#999] hover:text-red-400 hover:bg-[#222]' : 'text-[#666] hover:text-red-500 hover:bg-[#f5f0f0]'}`}>
                    <LogOut className="w-4 h-4" /> Logout
                </button>
            </div>
        </aside>
    );
}
