'use client';

import IntegrityDashboard from '@/components/IntegrityDashboard';

export default function TestIntegrityPage() {
    return (
        <div className="min-h-screen bg-black">
            <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
                <h1 className="text-2xl font-light text-white mb-6">Integrity Dashboard</h1>
                <IntegrityDashboard orgId={1} />
            </div>
        </div>
    );
}