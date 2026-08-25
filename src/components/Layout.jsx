import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { useTheme } from '../hooks/useTheme';
import Sidebar from './Sidebar';
import { Menu, X } from 'lucide-react';

export default function Layout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

    return (
        <div className="flex min-h-screen bg-primary">
            {/* Mobile overlay */}
            {sidebarOpen && (
                <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
            )}

            {/* Sidebar - hidden on mobile, shown on lg+ */}
            <div className={`fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <Sidebar onClose={() => setSidebarOpen(false)} />
            </div>

            {/* Main content */}
            <main className="flex-1 lg:ml-64 min-w-0">
                {/* Mobile top bar */}
                <div className={`sticky top-0 z-30 flex items-center gap-3 px-4 py-3 lg:hidden border-b ${isDark ? 'bg-[#111] border-[#333]' : 'bg-white border-[#e0e0e0]'}`}>
                    <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-xl hover:bg-surface-3 transition">
                        <Menu className="w-5 h-5" />
                    </button>
                    <span className="font-bold text-base">RockFall</span>
                </div>
                <div className="p-4 md:p-6 lg:p-8">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
