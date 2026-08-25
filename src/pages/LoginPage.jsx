import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { Shield, Loader2, Mountain, Activity, Eye, EyeOff, ArrowRight } from 'lucide-react';
import blackLogo from '../assets/black_logo.png';
import whiteLogo from '../assets/white_logo.png';

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [mounted, setMounted] = useState(false);
    const { login } = useAuth();
    const { resolvedTheme } = useTheme();
    const navigate = useNavigate();
    const isDark = resolvedTheme === 'dark';

    useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password);
            navigate('/');
        } catch (err) {
            setError(err.message || 'Login failed');
        } finally { setLoading(false); }
    };

    return (
        <div className={`min-h-screen flex transition-colors duration-500 ${isDark ? 'bg-[#000]' : 'bg-[#fafafa]'}`}>

            {/* Left Panel - Branding / Visual */}
            <div className={`hidden lg:flex lg:w-[55%] relative overflow-hidden items-center justify-center ${isDark ? 'bg-gradient-to-br from-[#0a0a0a] via-[#111] to-[#0a0a1a]' : 'bg-gradient-to-br from-[#f0f0f0] via-white to-[#e8eef5]'}`}>
                {/* Animated background elements */}
                <div className="absolute inset-0 overflow-hidden">
                    {/* Grid pattern */}
                    <div className={`absolute inset-0 ${isDark ? 'opacity-[0.03]' : 'opacity-[0.04]'}`}
                        style={{ backgroundImage: `linear-gradient(${isDark ? '#fff' : '#000'} 1px, transparent 1px), linear-gradient(90deg, ${isDark ? '#fff' : '#000'} 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />

                    {/* Floating orbs */}
                    <div className={`absolute top-[15%] left-[20%] w-72 h-72 rounded-full blur-[120px] animate-pulse ${isDark ? 'bg-blue-500/10' : 'bg-blue-400/15'}`} style={{ animationDuration: '4s' }} />
                    <div className={`absolute bottom-[20%] right-[15%] w-96 h-96 rounded-full blur-[140px] animate-pulse ${isDark ? 'bg-violet-500/8' : 'bg-violet-400/10'}`} style={{ animationDuration: '6s' }} />
                    <div className={`absolute top-[60%] left-[50%] w-48 h-48 rounded-full blur-[100px] animate-pulse ${isDark ? 'bg-emerald-500/6' : 'bg-emerald-400/10'}`} style={{ animationDuration: '5s' }} />

                    {/* Signal wave lines */}
                    <svg className="absolute bottom-0 left-0 w-full h-48 opacity-[0.06]" viewBox="0 0 1200 200">
                        <path d="M0,100 Q150,20 300,100 T600,100 T900,100 T1200,100" fill="none" stroke={isDark ? '#fff' : '#000'} strokeWidth="1.5" />
                        <path d="M0,120 Q150,40 300,120 T600,120 T900,120 T1200,120" fill="none" stroke={isDark ? '#fff' : '#000'} strokeWidth="1" />
                        <path d="M0,140 Q150,60 300,140 T600,140 T900,140 T1200,140" fill="none" stroke={isDark ? '#fff' : '#000'} strokeWidth="0.5" />
                    </svg>
                </div>

                {/* Main content */}
                <div className={`relative z-10 max-w-lg px-12 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                    <div className="flex items-center gap-4 mb-8">
                        <img src={isDark ? whiteLogo : blackLogo} alt="RockFall Logo" className="w-14 h-14 rounded-2xl object-contain" />
                        <div>
                            <h2 className={`text-2xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#111]'}`}>RockFall</h2>
                            <p className={`text-sm ${isDark ? 'text-[#666]' : 'text-[#999]'}`}>Monitor</p>
                        </div>
                    </div>

                    <h1 className={`text-4xl xl:text-5xl font-bold leading-tight tracking-tight mb-6 ${isDark ? 'text-white' : 'text-[#111]'}`}>
                        Real-Time
                        <br />
                        <span className={`${isDark ? 'text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-violet-400' : 'text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600'}`}>
                            Impact Monitoring
                        </span>
                    </h1>
                    <p className={`text-lg leading-relaxed mb-10 ${isDark ? 'text-[#777]' : 'text-[#666]'}`}>
                        Advanced IoT-powered rockfall detection with real-time alerts, seismic analysis, and remote device management across your entire infrastructure.
                    </p>

                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-6">
                        {[
                            { label: 'Active Sensors', value: '24/7', icon: Activity },
                            { label: 'Response Time', value: '<1s', icon: Mountain },
                            { label: 'Accuracy', value: '99.8%', icon: Shield },
                        ].map(s => (
                            <div key={s.label} className={`p-4 rounded-2xl border ${isDark ? 'bg-white/[0.02] border-white/[0.06]' : 'bg-white/60 border-[#e0e0e0]'}`}>
                                <s.icon className={`w-5 h-5 mb-2 ${isDark ? 'text-[#555]' : 'text-[#999]'}`} />
                                <p className={`text-xl font-bold ${isDark ? 'text-white' : 'text-[#111]'}`}>{s.value}</p>
                                <p className={`text-xs mt-0.5 ${isDark ? 'text-[#555]' : 'text-[#999]'}`}>{s.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right Panel - Login Form */}
            <div className="flex-1 flex items-center justify-center px-6 sm:px-12">
                <div className={`w-full max-w-[420px] transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>

                    {/* Mobile logo */}
                    <div className="lg:hidden text-center mb-10">
                        <img src={isDark ? whiteLogo : blackLogo} alt="RockFall Logo" className="inline-block w-16 h-16 rounded-2xl object-contain mb-5" />
                        <h1 className={`text-3xl font-bold tracking-tight ${isDark ? 'text-white' : 'text-[#111]'}`}>RockFall Monitor</h1>
                        <p className={`mt-2 text-sm ${isDark ? 'text-[#666]' : 'text-[#999]'}`}>IoT Impact Monitoring Platform</p>
                    </div>

                    {/* Welcome text */}
                    <div className="mb-8">
                        <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-[#111]'}`}>Welcome back</h2>
                        <p className={`mt-1.5 text-sm ${isDark ? 'text-[#666]' : 'text-[#999]'}`}>Enter your credentials to access the monitoring dashboard</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Email */}
                        <div>
                            <label className={`block text-sm font-medium mb-2 ${isDark ? 'text-[#999]' : 'text-[#555]'}`}>Email Address</label>
                            <div className="relative">
                                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="admin@iotblitz.com"
                                    className={`w-full px-4 py-3.5 border rounded-xl focus:outline-none transition-all duration-200 text-sm ${isDark
                                        ? 'bg-[#111] border-[#222] text-white placeholder:text-[#444] focus:border-[#555] focus:bg-[#0a0a0a]'
                                        : 'bg-white border-[#e0e0e0] text-[#111] placeholder:text-[#bbb] focus:border-[#999] focus:shadow-sm'}`} />
                            </div>
                        </div>

                        {/* Password */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className={`text-sm font-medium ${isDark ? 'text-[#999]' : 'text-[#555]'}`}>Password</label>
                                <button type="button" className={`text-xs font-medium transition hover:underline ${isDark ? 'text-[#666] hover:text-[#999]' : 'text-[#999] hover:text-[#666]'}`}>Forgot?</button>
                            </div>
                            <div className="relative">
                                <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
                                    className={`w-full px-4 py-3.5 pr-12 border rounded-xl focus:outline-none transition-all duration-200 text-sm ${isDark
                                        ? 'bg-[#111] border-[#222] text-white placeholder:text-[#444] focus:border-[#555] focus:bg-[#0a0a0a]'
                                        : 'bg-white border-[#e0e0e0] text-[#111] placeholder:text-[#bbb] focus:border-[#999] focus:shadow-sm'}`} />
                                <button type="button" onClick={() => setShowPassword(!showPassword)}
                                    className={`absolute right-4 top-1/2 -translate-y-1/2 transition ${isDark ? 'text-[#444] hover:text-[#999]' : 'text-[#bbb] hover:text-[#666]'}`}>
                                    {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                                </button>
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className={`text-sm px-4 py-3 rounded-xl border flex items-center gap-2 ${isDark ? 'text-red-400 bg-red-500/10 border-red-500/20' : 'text-red-600 bg-red-50 border-red-200'}`}>
                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                {error}
                            </div>
                        )}

                        {/* Submit */}
                        <button type="submit" disabled={loading}
                            className={`w-full py-3.5 font-semibold rounded-xl transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2 group text-sm ${isDark
                                ? 'bg-white text-black hover:bg-[#e5e5e5] hover:shadow-[0_0_30px_rgba(255,255,255,0.1)]'
                                : 'bg-[#111] text-white hover:bg-[#222] hover:shadow-lg'}`}>
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                            {loading ? 'Signing in...' : (
                                <>Sign In <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" /></>
                            )}
                        </button>
                    </form>

                    {/* Footer */}
                    <p className={`text-center text-xs mt-8 ${isDark ? 'text-[#333]' : 'text-[#ccc]'}`}>
                        RockFall IoT Monitoring Platform v1.0 • Secured with JWT
                    </p>
                </div>
            </div>

            {/* CSS Keyframes */}
            <style>{`
                @keyframes float { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-20px); } }
            `}</style>
        </div>
    );
}
