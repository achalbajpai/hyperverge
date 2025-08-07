import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { 
    AlertTriangle, 
    CheckCircle, 
    XCircle, 
    Clock, 
    Eye, 
    Filter, 
    RefreshCcw,
    Mic,
    MicOff,
    Volume2,
    Users,
    Brain,
    Activity,
    TrendingUp
} from 'lucide-react';
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

// Voice-specific interfaces
interface VoiceSession {
    session_id: string;
    start_time: string;
    audio_chunks_processed: number;
    alerts_generated: number;
    current_risk_score: number;
    user_name?: string;
    user_email?: string;
}

interface VoiceAnalysisUpdate {
    session_id: string;
    risk_score: number;
    probability: number;
    is_cheating: boolean;
    contributing_factors: string[];
    timestamp: string;
}

interface VoiceIntegrityDashboardProps {
    orgId: number;
}

export default function VoiceIntegrityDashboard({ orgId }: VoiceIntegrityDashboardProps) {
    const { user } = useAuth();
    const [stats, setStats] = useState<IntegrityDashboardStats | null>(null);
    const [flags, setFlags] = useState<IntegrityFlagWithDetails[]>([]);
    const [voiceSessions, setVoiceSessions] = useState<Record<string, VoiceSession>>({});
    const [voiceAnalysisUpdates, setVoiceAnalysisUpdates] = useState<VoiceAnalysisUpdate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedFlag, setSelectedFlag] = useState<IntegrityFlagWithDetails | null>(null);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [showTimelineModal, setShowTimelineModal] = useState(false);
    const [showVoiceDetailsModal, setShowVoiceDetailsModal] = useState(false);
    const [selectedVoiceUpdate, setSelectedVoiceUpdate] = useState<VoiceAnalysisUpdate | null>(null);
    const [timelineData, setTimelineData] = useState<any[]>([]);
    const [loadingTimeline, setLoadingTimeline] = useState(false);
    const [voiceWebSocket, setVoiceWebSocket] = useState<WebSocket | null>(null);
    const [isVoiceMonitoringActive, setIsVoiceMonitoringActive] = useState(false);
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

    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

    // Connect to voice monitoring WebSocket
    const connectVoiceMonitoring = useCallback(() => {
        if (voiceWebSocket && voiceWebSocket.readyState === WebSocket.OPEN) {
            return; // Already connected
        }

        try {
            const wsUrl = `${process.env.NEXT_PUBLIC_BACKEND_URL?.replace('http', 'ws')}/voice/monitor/${orgId}`;
            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                console.log('Voice monitoring WebSocket connected');
                setIsVoiceMonitoringActive(true);
                setError(null);
            };

            ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                handleVoiceMonitoringMessage(message);
            };

            ws.onerror = (error) => {
                console.error('Voice monitoring WebSocket error:', error);
                setError('Voice monitoring connection error');
            };

            ws.onclose = () => {
                console.log('Voice monitoring WebSocket disconnected');
                setIsVoiceMonitoringActive(false);
                setVoiceWebSocket(null);
                
                // Attempt to reconnect after 5 seconds
                reconnectTimeoutRef.current = setTimeout(() => {
                    if (!voiceWebSocket || voiceWebSocket.readyState === WebSocket.CLOSED) {
                        connectVoiceMonitoring();
                    }
                }, 5000);
            };

            setVoiceWebSocket(ws);

        } catch (error) {
            console.error('Failed to connect to voice monitoring:', error);
            setError('Failed to establish voice monitoring connection');
        }
    }, [orgId, voiceWebSocket]);

    // Handle voice monitoring messages
    const handleVoiceMonitoringMessage = (message: any) => {
        switch (message.type) {
            case 'voice_monitor_connected':
                console.log('Voice monitor connected');
                setVoiceSessions(message.data.active_sessions.sessions || {});
                break;

            case 'active_sessions':
                setVoiceSessions(message.data.sessions || {});
                break;

            case 'voice_analysis_update':
                const update: VoiceAnalysisUpdate = message.data;
                setVoiceAnalysisUpdates(prev => [update, ...prev.slice(0, 49)]); // Keep last 50
                
                // Update session risk score
                setVoiceSessions(prev => ({
                    ...prev,
                    [update.session_id]: {
                        ...prev[update.session_id],
                        current_risk_score: update.risk_score
                    }
                }));
                break;

            case 'voice_cheating_alert':
                // Handle high-priority alerts
                const alertData = message.data;
                console.log('Voice cheating alert received:', alertData);
                
                // Refresh flags to show new alert
                fetchFlags();
                
                // Show notification
                showNotification(`High-risk activity detected in session ${alertData.session_id}`, 'warning');
                break;

            case 'integrity_flag':
                // New integrity flag created
                fetchFlags();
                fetchStats();
                break;

            default:
                console.log('Unknown voice monitoring message:', message);
        }
    };

    // Send heartbeat to keep connection alive
    const sendHeartbeat = useCallback(() => {
        if (voiceWebSocket && voiceWebSocket.readyState === WebSocket.OPEN) {
            voiceWebSocket.send(JSON.stringify({ type: 'heartbeat' }));
        }
    }, [voiceWebSocket]);

    // Disconnect voice monitoring
    const disconnectVoiceMonitoring = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        
        if (voiceWebSocket) {
            voiceWebSocket.close();
        }
        
        setIsVoiceMonitoringActive(false);
        setVoiceWebSocket(null);
        setVoiceSessions({});
        setVoiceAnalysisUpdates([]);
    }, [voiceWebSocket]);

    // Show notification (you might want to replace this with a proper toast system)
    const showNotification = (message: string, type: 'info' | 'warning' | 'error') => {
        // Simple alert for now - replace with proper notification system
        alert(`[${type.toUpperCase()}] ${message}`);
    };

    // Get risk level color
    const getRiskLevelColor = (riskScore: number) => {
        if (riskScore >= 0.8) return 'text-red-300 bg-red-900 border border-red-500';
        if (riskScore >= 0.6) return 'text-orange-300 bg-orange-900 border border-orange-500';
        if (riskScore >= 0.4) return 'text-yellow-300 bg-yellow-900 border border-yellow-500';
        return 'text-green-300 bg-green-900 border border-green-500';
    };

    // Calculate voice monitoring stats
    const voiceStats = {
        activeSessions: Object.keys(voiceSessions).length,
        highRiskSessions: Object.values(voiceSessions).filter(s => s.current_risk_score >= 0.7).length,
        recentAlerts: voiceAnalysisUpdates.filter(u => u.is_cheating).length,
        averageRiskScore: Object.values(voiceSessions).length > 0 
            ? Object.values(voiceSessions).reduce((sum, s) => sum + s.current_risk_score, 0) / Object.values(voiceSessions).length 
            : 0
    };

    // Initialize
    useEffect(() => {
        fetchStats();
        fetchFlags();
        connectVoiceMonitoring();

        // Set up heartbeat interval
        const heartbeatInterval = setInterval(sendHeartbeat, 30000); // Every 30 seconds

        return () => {
            clearInterval(heartbeatInterval);
            disconnectVoiceMonitoring();
        };
    }, [fetchStats, fetchFlags, connectVoiceMonitoring, sendHeartbeat, disconnectVoiceMonitoring]);

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
                <div className="text-lg text-white">Loading voice integrity dashboard...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-light text-white">Voice Integrity Dashboard</h1>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        {isVoiceMonitoringActive ? (
                            <>
                                <Activity className="h-4 w-4 text-green-400 animate-pulse" />
                                <span className="text-sm text-green-400">Live Monitoring</span>
                            </>
                        ) : (
                            <>
                                <XCircle className="h-4 w-4 text-red-400" />
                                <span className="text-sm text-red-400">Disconnected</span>
                            </>
                        )}
                    </div>
                    <Button onClick={() => { fetchStats(); fetchFlags(); }} className="flex items-center gap-2">
                        <RefreshCcw className="h-4 w-4" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-red-900 border border-red-500 text-red-300 px-4 py-3 rounded">
                    {error}
                    <button onClick={() => setError(null)} className="float-right text-red-300 hover:text-red-200">×</button>
                </div>
            )}

            {/* Voice Monitoring Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-6 border-b-2 border-blue-500 border-opacity-70">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-400">Active Sessions</p>
                            <p className="text-2xl font-light text-white">{voiceStats.activeSessions}</p>
                        </div>
                        <Mic className="h-8 w-8 text-blue-400" />
                    </div>
                </div>

                <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-6 border-b-2 border-red-500 border-opacity-70">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-400">High Risk</p>
                            <p className="text-2xl font-light text-white">{voiceStats.highRiskSessions}</p>
                        </div>
                        <AlertTriangle className="h-8 w-8 text-red-400" />
                    </div>
                </div>

                <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-6 border-b-2 border-yellow-500 border-opacity-70">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-400">Recent Alerts</p>
                            <p className="text-2xl font-light text-white">{voiceStats.recentAlerts}</p>
                        </div>
                        <Volume2 className="h-8 w-8 text-yellow-400" />
                    </div>
                </div>

                <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-6 border-b-2 border-purple-500 border-opacity-70">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-gray-400">Avg Risk Score</p>
                            <p className="text-2xl font-light text-white">{(voiceStats.averageRiskScore * 100).toFixed(1)}%</p>
                        </div>
                        <TrendingUp className="h-8 w-8 text-purple-400" />
                    </div>
                </div>
            </div>

            {/* Original Stats Cards */}
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

            {/* Live Voice Sessions */}
            {voiceStats.activeSessions > 0 && (
                <div className="bg-[#1A1A1A] text-gray-300 rounded-lg border-b-2 border-green-500 border-opacity-70 overflow-hidden">
                    <div className="p-6 border-b border-gray-700">
                        <h3 className="text-xl font-light text-white flex items-center gap-2">
                            <Activity className="h-5 w-5 text-green-400" />
                            Live Voice Sessions
                        </h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-800">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                        Session
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                        Risk Score
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                        Audio Processed
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                        Alerts
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">
                                        Duration
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-gray-900 divide-y divide-gray-700">
                                {Object.entries(voiceSessions).map(([sessionId, session]) => (
                                    <tr key={sessionId} className="hover:bg-gray-800">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-white">{sessionId}</div>
                                            {session.user_name && (
                                                <div className="text-xs text-gray-400">{session.user_name}</div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRiskLevelColor(session.current_risk_score)}`}>
                                                {(session.current_risk_score * 100).toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                            {session.audio_chunks_processed}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">
                                            {session.alerts_generated}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                                            {(() => {
                                                const duration = new Date().getTime() - new Date(session.start_time).getTime();
                                                const minutes = Math.floor(duration / 60000);
                                                return `${minutes}m`;
                                            })()}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Recent Voice Analysis Updates */}
            {voiceAnalysisUpdates.length > 0 && (
                <div className="bg-[#1A1A1A] text-gray-300 rounded-lg border-b-2 border-blue-500 border-opacity-70 overflow-hidden">
                    <div className="p-6 border-b border-gray-700">
                        <h3 className="text-xl font-light text-white flex items-center gap-2">
                            <Brain className="h-5 w-5 text-blue-400" />
                            Recent Voice Analysis
                        </h3>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        {voiceAnalysisUpdates.slice(0, 10).map((update, index) => (
                            <div key={index} className="p-4 border-b border-gray-700 hover:bg-gray-800 cursor-pointer"
                                 onClick={() => {
                                     setSelectedVoiceUpdate(update);
                                     setShowVoiceDetailsModal(true);
                                 }}>
                                <div className="flex justify-between items-center">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-white">{update.session_id}</span>
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getRiskLevelColor(update.risk_score)}`}>
                                                {(update.probability * 100).toFixed(1)}%
                                            </span>
                                            {update.is_cheating && (
                                                <AlertTriangle className="h-4 w-4 text-red-400" />
                                            )}
                                        </div>
                                        <div className="text-xs text-gray-400 mt-1">
                                            {update.contributing_factors.slice(0, 2).join(', ')}
                                            {update.contributing_factors.length > 2 && '...'}
                                        </div>
                                    </div>
                                    <div className="text-xs text-gray-500">
                                        {formatDate(update.timestamp)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Rest of the original dashboard... */}
            {/* Continue with the existing integrity flags table and modals */}
            
            {/* Voice Analysis Details Modal */}
            {showVoiceDetailsModal && selectedVoiceUpdate && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Voice Analysis Details</h2>
                            <button
                                onClick={() => { setShowVoiceDetailsModal(false); setSelectedVoiceUpdate(null); }}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Session ID</label>
                                    <p className="text-sm text-gray-900">{selectedVoiceUpdate.session_id}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Risk Score</label>
                                    <p className="text-sm text-gray-900">{(selectedVoiceUpdate.risk_score * 100).toFixed(1)}%</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Cheating Probability</label>
                                    <p className="text-sm text-gray-900">{(selectedVoiceUpdate.probability * 100).toFixed(1)}%</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Classification</label>
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        selectedVoiceUpdate.is_cheating ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                                    }`}>
                                        {selectedVoiceUpdate.is_cheating ? 'Cheating Detected' : 'Normal Activity'}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Contributing Factors</label>
                                <div className="space-y-2">
                                    {selectedVoiceUpdate.contributing_factors.map((factor, index) => (
                                        <div key={index} className="bg-gray-100 px-3 py-2 rounded text-sm text-gray-900">
                                            {factor}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700">Timestamp</label>
                                <p className="text-sm text-gray-900">{formatDate(selectedVoiceUpdate.timestamp)}</p>
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <Button
                                onClick={() => { setShowVoiceDetailsModal(false); setSelectedVoiceUpdate(null); }}
                                variant="outline"
                            >
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}