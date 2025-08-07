'use client';

import IntegrityDashboard from '@/components/IntegrityDashboard';

export default function TestIntegrityPage() {
    return (
        <div className="container mx-auto py-8">
            <h1 className="text-2xl font-bold mb-6">Integrity Dashboard Test</h1>
            <IntegrityDashboard orgId={1} />
        </div>
    );
}