import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { AlertTriangle, CheckCircle, XCircle, Clock, Eye, Filter, RefreshCcw, Mic, Activity } from 'lucide-react';
import VoiceIntegrityDashboard from './VoiceIntegrityDashboard';
import {
    IntegrityDashboardStats,
    IntegrityFlagWithDetails,
    IntegrityFlagStatus,
    IntegritySeverity,
    IntegrityFlagType,
    ReviewDecision,
    CreateIntegrityReviewRequest,
} from '../types';
import { useAuth } from '@/lib/auth';

// Remove emoji icons - using Lucide React icons instead

interface IntegrityDashboardProps {
    orgId: number;
}

export default function IntegrityDashboard({ orgId }: IntegrityDashboardProps) {
    const { user } = useAuth();
    const [stats, setStats] = useState<IntegrityDashboardStats | null>(null);
    const [flags, setFlags] = useState<IntegrityFlagWithDetails[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedFlag, setSelectedFlag] = useState<IntegrityFlagWithDetails | null>(null);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [showTimelineModal, setShowTimelineModal] = useState(false);
    const [timelineData, setTimelineData] = useState<any[]>([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);
    const [filters, setFilters] = useState({
        status: '' as IntegrityFlagStatus | '',
        severity: '' as IntegritySeverity | '',
        flagType: '' as IntegrityFlagType | '',
    });
    const [reviewData, setReviewData] = useState<CreateIntegrityReviewRequest>({
        decision: ReviewDecision.NO_VIOLATION,
        notes: '',
        follow_up_action: '',
    });

    // Fetch dashboard stats
    const fetchStats = useCallback(async () => {
        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/dashboard/stats`);
            if (response.ok) {
                const data = await response.json();
                setStats(data);
            }
        } catch (err) {
            console.error('Failed to fetch integrity stats:', err);
        }
    }, []);

    // Fetch integrity flags
    const fetchFlags = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (filters.status) params.append('status', filters.status);
            if (filters.severity) params.append('severity', filters.severity);
            if (filters.flagType) params.append('flag_type', filters.flagType);
            params.append('limit', '50');

            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/flags?${params.toString()}`);
            if (response.ok) {
                const data = await response.json();
                setFlags(data);
            } else {
                setError('Failed to fetch integrity flags');
            }
        } catch (err) {
            setError('Network error occurred');
        } finally {
            setLoading(false);
        }
    }, [filters]);

    // Fetch user timeline
    const fetchUserTimeline = useCallback(async (userId: number, taskId?: number) => {
        try {
            setLoadingTimeline(true);
            const params = new URLSearchParams();
            if (taskId) params.append('task_id', taskId.toString());
            params.append('limit', '50');

            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/users/${userId}/timeline?${params.toString()}`);
            if (response.ok) {
                const data = await response.json();
                setTimelineData(data);
                setShowTimelineModal(true);
            } else {
                setError('Failed to fetch user timeline');
            }
        } catch (err) {
            setError('Network error occurred while fetching timeline');
        } finally {
            setLoadingTimeline(false);
        }
    }, []);

    // Handle follow-up actions
    const handleFollowUpAction = async (action: 'suggest_resources' | 'schedule_viva', flagId: number, userId: number) => {
        try {
            const followUpData = {
                action_type: action,
                flag_id: flagId,
                user_id: userId,
                timestamp: new Date().toISOString(),
                status: 'pending'
            };

            // In a real implementation, you'd send this to your backend
            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/follow-up-actions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(followUpData)
            });

            if (response.ok) {
                const actionText = action === 'suggest_resources' 
                    ? 'Learning resources have been suggested to the student'
                    : '2-minute viva has been scheduled for the student';
                
                alert(actionText); // In production, use a proper notification system
                fetchFlags(); // Refresh the flags list
            } else {
                setError('Failed to execute follow-up action');
            }
        } catch (err) {
            setError('Network error occurred while executing follow-up action');
        }
    };

    // Submit review
    const submitReview = async () => {
        if (!selectedFlag || !user?.id) return;

        try {
            const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/flags/${selectedFlag.id}/reviews`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...reviewData,
                    reviewer_user_id: parseInt(user.id),
                }),
            });

            if (response.ok) {
                setShowReviewModal(false);
                setSelectedFlag(null);
                fetchFlags();
                fetchStats();
            } else {
                setError('Failed to submit review');
            }
        } catch (err) {
            setError('Network error occurred');
        }
    };

    useEffect(() => {
        fetchStats();
        fetchFlags();
    }, [fetchStats, fetchFlags]);

    // Real-time updates via WebSocket (you can implement this)
    useEffect(() => {
        // WebSocket connection for real-time updates
        // const ws = new WebSocket(`ws://localhost:8000/ws/integrity/admin/${orgId}`);
        // ws.onmessage = (event) => {
        //     const message = JSON.parse(event.data);
        //     if (message.type === 'integrity_flag') {
        //         fetchFlags();
        //         fetchStats();
        //     }
        // };
        // return () => ws.close();
    }, [orgId]);

    const getSeverityColor = (severity: IntegritySeverity) => {
        switch (severity) {
            case IntegritySeverity.CRITICAL: return 'text-red-300 bg-red-900 border border-red-500';
            case IntegritySeverity.HIGH: return 'text-orange-300 bg-orange-900 border border-orange-500';
            case IntegritySeverity.MEDIUM: return 'text-yellow-300 bg-yellow-900 border border-yellow-500';
            case IntegritySeverity.LOW: return 'text-blue-300 bg-blue-900 border border-blue-500';
            default: return 'text-gray-300 bg-gray-800 border border-gray-500';
        }
    };

    const getStatusColor = (status: IntegrityFlagStatus) => {
        switch (status) {
            case IntegrityFlagStatus.PENDING: return 'text-yellow-300 bg-yellow-900 border border-yellow-500';
            case IntegrityFlagStatus.REVIEWED: return 'text-green-300 bg-green-900 border border-green-500';
            case IntegrityFlagStatus.DISMISSED: return 'text-gray-300 bg-gray-800 border border-gray-500';
            case IntegrityFlagStatus.ESCALATED: return 'text-red-300 bg-red-900 border border-red-500';
            default: return 'text-gray-300 bg-gray-800 border border-gray-500';
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString();
    };

    if (loading && !stats) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-lg text-white">Loading integrity dashboard...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-light text-white">Integrity Dashboard</h1>
                <Button onClick={() => { fetchStats(); fetchFlags(); }} className="flex items-center gap-2">
                    <RefreshCcw className="h-4 w-4" />
                    Refresh
                </Button>
            </div>

            {/* Tabs for different views */}
            <Tabs defaultValue="general" className="w-full">
                <TabsList className="grid w-full grid-cols-2 bg-gray-800">
                    <TabsTrigger value="general" className="flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        General Integrity
                    </TabsTrigger>
                    <TabsTrigger value="voice" className="flex items-center gap-2">
                        <Mic className="h-4 w-4" />
                        Voice Analysis
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="general" className="space-y-6 mt-6">

            {/* Error Message */}
            {error && (
                <div className="bg-red-900 border border-red-500 text-red-300 px-4 py-3 rounded">
                    {error}
                    <button onClick={() => setError(null)} className="float-right text-red-300 hover:text-red-200">×</button>
                </div>
            )}

            {/* Stats Cards */}
            {stats && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-6 border-b-2 border-red-500 border-opacity-70">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-400">Total Flags</p>
                                <p className="text-2xl font-light text-white">{stats.total_flags}</p>
                            </div>
                            <AlertTriangle className="h-8 w-8 text-red-400" />
                        </div>
                    </div>

                    <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-6 border-b-2 border-yellow-500 border-opacity-70">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-400">Pending Review</p>
                                <p className="text-2xl font-light text-white">{stats.pending_flags}</p>
                            </div>
                            <Clock className="h-8 w-8 text-yellow-400" />
                        </div>
                    </div>

                    <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-6 border-b-2 border-orange-500 border-opacity-70">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-400">High Priority</p>
                                <p className="text-2xl font-light text-white">{stats.high_severity_flags}</p>
                            </div>
                            <XCircle className="h-8 w-8 text-orange-400" />
                        </div>
                    </div>

                    <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-6 border-b-2 border-green-500 border-opacity-70">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-gray-400">Resolution Rate</p>
                                <p className="text-2xl font-light text-white">
                                    {stats.total_flags > 0 ? Math.round(((stats.total_flags - stats.pending_flags) / stats.total_flags) * 100) : 0}%
                                </p>
                            </div>
                            <CheckCircle className="h-8 w-8 text-green-400" />
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-4 border-b-2 border-blue-500 border-opacity-70">
                <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        <span className="font-medium">Filters:</span>
                    </div>

                    <select
                        value={filters.status}
                        onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value as any }))}
                        className="border rounded px-3 py-1"
                    >
                        <option value="">All Statuses</option>
                        <option value={IntegrityFlagStatus.PENDING}>Pending</option>
                        <option value={IntegrityFlagStatus.REVIEWED}>Reviewed</option>
                        <option value={IntegrityFlagStatus.DISMISSED}>Dismissed</option>
                        <option value={IntegrityFlagStatus.ESCALATED}>Escalated</option>
                    </select>

                    <select
                        value={filters.severity}
                        onChange={(e) => setFilters(prev => ({ ...prev, severity: e.target.value as any }))}
                        className="border rounded px-3 py-1"
                    >
                        <option value="">All Severities</option>
                        <option value={IntegritySeverity.CRITICAL}>Critical</option>
                        <option value={IntegritySeverity.HIGH}>High</option>
                        <option value={IntegritySeverity.MEDIUM}>Medium</option>
                        <option value={IntegritySeverity.LOW}>Low</option>
                    </select>

                    <select
                        value={filters.flagType}
                        onChange={(e) => setFilters(prev => ({ ...prev, flagType: e.target.value as any }))}
                        className="border rounded px-3 py-1"
                    >
                        <option value="">All Types</option>
                        <option value={IntegrityFlagType.CONTENT_SIMILARITY}>Content Similarity</option>
                        <option value={IntegrityFlagType.BEHAVIORAL_ANOMALY}>Behavioral Anomaly</option>
                        <option value={IntegrityFlagType.PROCTORING_VIOLATION}>Proctoring Violation</option>
                        <option value={IntegrityFlagType.TECHNICAL_IRREGULARITY}>Technical Irregularity</option>
                        <option value={IntegrityFlagType.TEST_COMPLETION}>Test Completion</option>
                    </select>

                    {(filters.status || filters.severity || filters.flagType) && (
                        <Button
                            onClick={() => setFilters({ status: '', severity: '', flagType: '' })}
                            variant="outline"
                            size="sm"
                        >
                            Clear Filters
                        </Button>
                    )}
                </div>
                </div>

            {/* Flags Table */}
            <div className="bg-[#1A1A1A] text-gray-300 rounded-lg border-b-2 border-purple-500 border-opacity-70 overflow-hidden">
                <div className="p-6 border-b border-gray-700">
                    <h3 className="text-xl font-light text-white">Integrity Flags</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-800">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                        User
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                        Type
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                        Severity
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                        Confidence
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                        Audio
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                        Created
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-gray-900 divide-y divide-gray-700">
                                {flags.map((flag, index) => (
                                    <tr key={`flag-${flag.id}-${index}`} className="hover:bg-gray-800">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div>
                                                <div className="text-sm font-light text-white">
                                                    {flag.user_name || 'Unknown User'}
                                                </div>
                                                <div className="text-sm text-gray-400">{flag.user_email}</div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className="text-sm text-gray-300 capitalize">
                                                {flag.flag_type.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(flag.severity)}`}>
                                                {flag.severity}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                            {Math.round(flag.confidence_score * 100)}%
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(flag.status)}`}>
                                                {flag.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                            {flag.evidence_data && flag.evidence_data.full_transcription ? (
                                                <div className="flex items-center justify-center space-x-1">
                                                    <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                                                    <span className="text-xs text-blue-400">Yes</span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-500">-</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                            {formatDate(flag.created_at)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    onClick={() => {
                                                        setSelectedFlag(flag);
                                                        setShowReviewModal(true);
                                                    }}
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex items-center gap-1"
                                                >
                                                    <Eye className="h-4 w-4" />
                                                    Review
                                                </Button>
                                                <Button
                                                    onClick={() => fetchUserTimeline(flag.user_id, flag.task_id)}
                                                    variant="outline"
                                                    size="sm"
                                                    className="flex items-center gap-1"
                                                    disabled={loadingTimeline}
                                                >
                                                    <Clock className="h-4 w-4" />
                                                    Timeline
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                    </table>
                </div>
            </div>

            {/* Review Modal */}
            {showReviewModal && selectedFlag && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold">Review Integrity Flag</h2>
                                <button
                                    onClick={() => { setShowReviewModal(false); setSelectedFlag(null); }}
                                    className="text-gray-500 hover:text-gray-700"
                                >
                                    ×
                                </button>
                            </div>

                            {/* Flag Details */}
                            <div className="space-y-4 mb-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">User</label>
                                        <p className="text-sm text-gray-900">{selectedFlag.user_name} ({selectedFlag.user_email})</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Type</label>
                                        <p className="text-sm text-gray-900 capitalize">{selectedFlag.flag_type.replace('_', ' ')}</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Severity</label>
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(selectedFlag.severity)}`}>
                                            {selectedFlag.severity}
                                        </span>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Confidence</label>
                                        <p className="text-sm text-gray-900">{Math.round(selectedFlag.confidence_score * 100)}%</p>
                                    </div>
                                </div>

                                {selectedFlag.ai_analysis && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">AI Analysis</label>
                                        <p className="text-sm text-gray-900 bg-gray-100 p-3 rounded">{selectedFlag.ai_analysis}</p>
                                    </div>
                                )}

                                {/* Audio Transcription Section */}
                                {selectedFlag.evidence_data && selectedFlag.evidence_data.full_transcription && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Audio Transcription</label>
                                        <div className="bg-blue-50 border border-blue-200 p-3 rounded">
                                            <p className="text-sm text-gray-900 mb-2 italic">
                                                "{selectedFlag.evidence_data.full_transcription}"
                                            </p>
                                            <div className="text-xs text-gray-600 space-y-1">
                                                {selectedFlag.evidence_data.speech_duration_seconds && (
                                                    <p><strong>Duration:</strong> {selectedFlag.evidence_data.speech_duration_seconds}s</p>
                                                )}
                                                {selectedFlag.evidence_data.cheating_detected !== undefined && (
                                                    <p><strong>Cheating Detected:</strong> 
                                                        <span className={selectedFlag.evidence_data.cheating_detected ? 'text-red-600 font-semibold' : 'text-green-600'}>
                                                            {selectedFlag.evidence_data.cheating_detected ? ' YES' : ' NO'}
                                                        </span>
                                                    </p>
                                                )}
                                                {selectedFlag.evidence_data.suspicious_phrases && selectedFlag.evidence_data.suspicious_phrases.length > 0 && (
                                                    <p><strong>Suspicious Phrases:</strong> {selectedFlag.evidence_data.suspicious_phrases.join(', ')}</p>
                                                )}
                                                {selectedFlag.evidence_data.confidence_scores && (
                                                    <p><strong>Confidence:</strong> {Math.round(selectedFlag.evidence_data.confidence_scores.analysis * 100)}%</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Enhanced Evidence Data Display */}
                                {selectedFlag.evidence_data && !selectedFlag.evidence_data.full_transcription && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-2">Evidence Details</label>
                                        <div className="bg-gray-50 border p-3 rounded">
                                            <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                                                {JSON.stringify(selectedFlag.evidence_data, null, 2)}
                                            </pre>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Review Form */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Decision</label>
                                    <select
                                        value={reviewData.decision}
                                        onChange={(e) => setReviewData(prev => ({ ...prev, decision: e.target.value as ReviewDecision }))}
                                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                                    >
                                        <option value={ReviewDecision.NO_VIOLATION}>No Violation</option>
                                        <option value={ReviewDecision.MINOR_CONCERN}>Minor Concern</option>
                                        <option value={ReviewDecision.INTEGRITY_VIOLATION}>Integrity Violation</option>
                                        <option value={ReviewDecision.FURTHER_INVESTIGATION}>Further Investigation</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                                    <textarea
                                        value={reviewData.notes}
                                        onChange={(e) => setReviewData(prev => ({ ...prev, notes: e.target.value }))}
                                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                                        rows={4}
                                        placeholder="Add your review notes..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Follow-up Action</label>
                                    <input
                                        type="text"
                                        value={reviewData.follow_up_action}
                                        onChange={(e) => setReviewData(prev => ({ ...prev, follow_up_action: e.target.value }))}
                                        className="w-full border border-gray-300 rounded-md px-3 py-2"
                                        placeholder="Describe any required follow-up actions..."
                                    />
                                </div>
                            </div>

                            {/* Follow-up Actions */}
                            <div className="border-t pt-4">
                                <h4 className="text-sm font-medium text-gray-700 mb-3">Follow-up Actions</h4>
                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => handleFollowUpAction('suggest_resources', selectedFlag.id, selectedFlag.user_id)}
                                        variant="outline"
                                        size="sm"
                                        className="flex items-center gap-1"
                                    >
                                        <CheckCircle className="h-4 w-4" />
                                        Suggest Resources
                                    </Button>
                                    <Button
                                        onClick={() => handleFollowUpAction('schedule_viva', selectedFlag.id, selectedFlag.user_id)}
                                        variant="outline"
                                        size="sm"
                                        className="flex items-center gap-1"
                                    >
                                        <Clock className="h-4 w-4" />
                                        Schedule 2-min Viva
                                    </Button>
                                </div>
                            </div>

                            {/* Modal Actions */}
                            <div className="flex justify-end gap-3 mt-6">
                                <Button
                                    onClick={() => { setShowReviewModal(false); setSelectedFlag(null); }}
                                    variant="outline"
                                >
                                    Cancel
                                </Button>
                                <Button onClick={submitReview}>
                                    Submit Review
                                </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Timeline Modal */}
            {showTimelineModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">User Session Timeline</h2>
                            <button
                                onClick={() => { setShowTimelineModal(false); setTimelineData([]); }}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                ×
                            </button>
                        </div>

                        {loadingTimeline ? (
                            <div className="flex items-center justify-center p-8">
                                <div className="text-lg">Loading timeline...</div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {timelineData.length === 0 ? (
                                    <p className="text-gray-500 text-center py-8">No timeline events found</p>
                                ) : (
                                    <div className="space-y-3">
                                        {timelineData.map((event, index) => (
                                            <div key={index} className="border-l-4 border-blue-500 pl-4 py-2">
                                                <div className="flex justify-between items-start">
                                                    <div className="flex-1">
                                                        <h4 className="font-medium text-gray-900">
                                                            {event.event_type === 'integrity_event' ? '📊' : '🚩'} {event.description}
                                                        </h4>
                                                        <p className="text-sm text-gray-600 mt-1">
                                                            {formatDate(event.timestamp)}
                                                        </p>
                                                        
                                                        {/* Event Details */}
                                                        {event.data && (
                                                            <div className="mt-2 p-3 bg-gray-50 rounded text-sm">
                                                                {event.data.event_type && (
                                                                    <p><strong>Type:</strong> {event.data.event_type}</p>
                                                                )}
                                                                {event.data.confidence_score && (
                                                                    <p><strong>Confidence:</strong> {Math.round(event.data.confidence_score * 100)}%</p>
                                                                )}
                                                                {event.data.ai_analysis && (
                                                                    <p><strong>Analysis:</strong> {event.data.ai_analysis}</p>
                                                                )}
                                                                {event.data.transcription && (
                                                                    <p><strong>Transcription:</strong> "{event.data.transcription}"</p>
                                                                )}
                                                                {event.data.language && (
                                                                    <p><strong>Language:</strong> {event.data.language}</p>
                                                                )}
                                                                {event.data.paste_length && (
                                                                    <p><strong>Paste Length:</strong> {event.data.paste_length} characters</p>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Severity Indicator */}
                                                    {event.severity && (
                                                        <span className={`px-2 py-1 text-xs font-medium rounded-full ml-4 ${
                                                            event.severity === 'high' ? 'bg-red-100 text-red-800' :
                                                            event.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                                            'bg-blue-100 text-blue-800'
                                                        }`}>
                                                            {event.severity}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Timeline Summary */}
                                {timelineData.length > 0 && (
                                    <div className="mt-6 p-4 bg-gray-100 rounded-lg">
                                        <h4 className="font-medium text-gray-900 mb-2">Session Summary</h4>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                            <div>
                                                <p className="text-gray-600">Total Events</p>
                                                <p className="font-semibold">{timelineData.length}</p>
                                            </div>
                                            <div>
                                                <p className="text-gray-600">High Priority</p>
                                                <p className="font-semibold text-red-600">
                                                    {timelineData.filter(e => e.severity === 'high').length}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-gray-600">Medium Priority</p>
                                                <p className="font-semibold text-yellow-600">
                                                    {timelineData.filter(e => e.severity === 'medium').length}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-gray-600">Session Duration</p>
                                                <p className="font-semibold">
                                                    {timelineData.length > 1 ? 
                                                        `${Math.round((new Date(timelineData[0].timestamp).getTime() - 
                                                        new Date(timelineData[timelineData.length - 1].timestamp).getTime()) / 60000)} min` 
                                                        : 'N/A'
                                                    }
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* Timeline Modal Actions */}
                        <div className="flex justify-end gap-3 mt-6">
                            <Button
                                onClick={() => { setShowTimelineModal(false); setTimelineData([]); }}
                                variant="outline"
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}
                </TabsContent>

                <TabsContent value="voice" className="mt-6">
                    <VoiceIntegrityDashboard orgId={orgId} />
                </TabsContent>
            </Tabs>
        </div>
    );
}