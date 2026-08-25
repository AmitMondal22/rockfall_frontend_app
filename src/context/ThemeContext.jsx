import { useState, useEffect, useLayoutEffect } from 'react';
import { ThemeContext } from './theme-context';

const THEMES = new Set(['light', 'dark', 'system']);

const getSavedTheme = () => {
    try {
        const saved = localStorage.getItem('rf-theme');
        return THEMES.has(saved) ? saved : 'system';
    } catch {
        return 'system';
    }
};

export const ThemeProvider = ({ children }) => {
    const [theme, setThemeState] = useState(getSavedTheme);
    const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

    const resolvedTheme = theme === 'system'
        ? (systemDark ? 'dark' : 'light')
        : theme;

    useLayoutEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-theme', resolvedTheme);
        try {
            localStorage.setItem('rf-theme', theme);
        } catch {
            // Theme still applies when storage is unavailable.
        }
    }, [theme, resolvedTheme]);

    useEffect(() => {
        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        const handler = (event) => setSystemDark(event.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    const setTheme = (nextTheme) => {
        if (THEMES.has(nextTheme)) setThemeState(nextTheme);
    };

    return (
        <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};
