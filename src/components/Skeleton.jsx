import { useTheme } from '../context/ThemeContext';

// Base shimmer skeleton block
export function Skeleton({ className = '', rounded = 'rounded-xl' }) {
    return <div className={`skeleton-shimmer ${rounded} ${className}`} />;
}

// Stat card skeleton
export function StatCardSkeleton({ count = 4 }) {
    return (
        <div className={`grid grid-cols-2 md:grid-cols-${count} gap-3 md:gap-4`}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="bg-surface border border-border rounded-2xl p-5" style={{ animationDelay: `${i * 80}ms`, animation: 'fadeSlideUp 0.4s ease-out both' }}>
                    <div className="flex items-center justify-between mb-3">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-9 w-9" rounded="rounded-xl" />
                    </div>
                    <Skeleton className="h-8 w-16 mt-1" />
                    <Skeleton className="h-3 w-24 mt-2" />
                </div>
            ))}
        </div>
    );
}

// Table skeleton
export function TableSkeleton({ rows = 5, cols = 5 }) {
    return (
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-16" />
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-border">
                            {Array.from({ length: cols }).map((_, i) => (
                                <th key={i} className="px-4 py-3 text-left">
                                    <Skeleton className="h-3 w-16" />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: rows }).map((_, r) => (
                            <tr key={r} className="border-b border-border/30">
                                {Array.from({ length: cols }).map((_, c) => (
                                    <td key={c} className="px-4 py-3">
                                        <Skeleton className={`h-4 ${c === 0 ? 'w-28' : 'w-16'}`} />
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Card list skeleton
export function CardListSkeleton({ count = 4 }) {
    return (
        <div className="grid gap-3">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="bg-surface border border-border rounded-2xl p-5 flex items-center gap-5"
                    style={{ animationDelay: `${i * 60}ms`, animation: 'fadeSlideUp 0.4s ease-out both' }}>
                    <Skeleton className="w-10 h-10 shrink-0" rounded="rounded-full" />
                    <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-6 w-20" rounded="rounded-full" />
                    <Skeleton className="h-4 w-16" />
                </div>
            ))}
        </div>
    );
}

// Map + sidebar skeleton (Dashboard)
export function DashboardSkeleton() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <Skeleton className="h-7 w-40" />
                    <Skeleton className="h-4 w-52 mt-2" />
                </div>
                <Skeleton className="h-8 w-20" rounded="rounded-full" />
            </div>

            <StatCardSkeleton count={4} />

            {/* Map + Sidebar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
                <div className="lg:col-span-2 bg-surface border border-border rounded-2xl overflow-hidden" style={{ height: '500px' }}>
                    <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className="h-4 w-24" />
                    </div>
                    <div className="h-full flex items-center justify-center">
                        <Skeleton className="h-12 w-12" rounded="rounded-2xl" />
                    </div>
                </div>
                <div className="space-y-4">
                    <div className="bg-surface border border-border rounded-2xl p-5">
                        <Skeleton className="h-5 w-32 mb-4" />
                        <div className="space-y-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex items-center justify-between py-2">
                                    <div className="flex items-center gap-2.5">
                                        <Skeleton className="w-7 h-7" rounded="rounded-lg" />
                                        <Skeleton className="h-3 w-16" />
                                    </div>
                                    <Skeleton className="h-4 w-12" />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="bg-surface border border-border rounded-2xl p-5">
                        <Skeleton className="h-5 w-28 mb-3" />
                        <div className="space-y-2">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-3 py-2">
                                    <Skeleton className="w-9 h-9" rounded="rounded-xl" />
                                    <div className="flex-1">
                                        <Skeleton className="h-4 w-28" />
                                        <Skeleton className="h-3 w-20 mt-1" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Device Details skeleton
export function DeviceDetailsSkeleton() {
    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <Skeleton className="w-10 h-10" rounded="rounded-xl" />
                <div>
                    <Skeleton className="h-7 w-48" />
                    <Skeleton className="h-4 w-64 mt-1.5" />
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-surface border border-border rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <Skeleton className="w-3.5 h-3.5" rounded="rounded" />
                            <Skeleton className="h-3 w-14" />
                        </div>
                        <Skeleton className="h-6 w-16" />
                    </div>
                ))}
            </div>

            {/* Additional metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-surface border border-border rounded-xl p-3 flex justify-between items-center">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-4 w-12" />
                    </div>
                ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="bg-surface border border-border rounded-2xl p-5">
                        <Skeleton className="h-5 w-40 mb-4" />
                        <Skeleton className="h-[200px] w-full" rounded="rounded-xl" />
                    </div>
                ))}
            </div>

            {/* Events table */}
            <TableSkeleton rows={5} cols={7} />
        </div>
    );
}

// Org/Location Dashboard skeleton
export function OrgDashboardSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Skeleton className="w-10 h-10" rounded="rounded-xl" />
                <div>
                    <Skeleton className="h-7 w-48" />
                    <Skeleton className="h-4 w-32 mt-1.5" />
                </div>
            </div>
            <StatCardSkeleton count={4} />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-surface border border-border rounded-2xl" style={{ height: '400px' }}>
                    <div className="px-5 py-3.5 border-b border-border">
                        <Skeleton className="h-5 w-28" />
                    </div>
                    <div className="h-full flex items-center justify-center">
                        <Skeleton className="h-12 w-12" rounded="rounded-2xl" />
                    </div>
                </div>
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="bg-surface border border-border rounded-2xl p-4 flex items-center gap-3">
                            <Skeleton className="w-9 h-9" rounded="rounded-xl" />
                            <div className="flex-1">
                                <Skeleton className="h-4 w-28" />
                                <Skeleton className="h-3 w-20 mt-1" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Settings skeleton
export function SettingsSkeleton() {
    return (
        <div className="space-y-6 max-w-2xl">
            <Skeleton className="h-7 w-24" />
            <div className="bg-surface border border-border rounded-2xl p-6 space-y-5">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i}>
                        <Skeleton className="h-3 w-20 mb-2" />
                        <Skeleton className="h-10 w-full" rounded="rounded-xl" />
                    </div>
                ))}
                <Skeleton className="h-10 w-32 mt-2" rounded="rounded-xl" />
            </div>
        </div>
    );
}

// Page-level list skeleton (Devices, Orgs, Users, Locations, Alerts)
export function PageListSkeleton({ cardCount = 4, hasHeader = true }) {
    return (
        <div className="space-y-6">
            {hasHeader && (
                <div className="flex items-center justify-between">
                    <div>
                        <Skeleton className="h-7 w-32" />
                        <Skeleton className="h-4 w-20 mt-1.5" />
                    </div>
                    <Skeleton className="h-10 w-32" rounded="rounded-xl" />
                </div>
            )}
            <CardListSkeleton count={cardCount} />
        </div>
    );
}

// Historical data page skeleton
export function HistoricalSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <Skeleton className="h-7 w-40" />
                <div className="flex gap-3">
                    <Skeleton className="h-10 w-40" rounded="rounded-xl" />
                    <Skeleton className="h-10 w-28" rounded="rounded-xl" />
                    <Skeleton className="h-10 w-28" rounded="rounded-xl" />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="bg-surface border border-border rounded-2xl p-5">
                        <Skeleton className="h-5 w-36 mb-4" />
                        <Skeleton className="h-[220px] w-full" rounded="rounded-xl" />
                    </div>
                ))}
            </div>
            <TableSkeleton rows={6} cols={8} />
        </div>
    );
}
