import React, { useState, useEffect, useMemo } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Clock, Flag, BarChart3, Search, Download, ZoomIn, ZoomOut } from 'lucide-react';
import {
    IntegrityTimelineEntry,
    IntegritySeverity,
    IntegrityEventType,
} from '../types';

interface EvidenceTimelineViewerProps {
    userId: number;
    taskId?: number;
    questionId?: number;
    className?: string;
}

interface TimelineFilter {
    eventTypes: string[];
    severityLevels: string[];
    timeRange: 'all' | 'last_hour' | 'last_day' | 'last_week';
    showOnlyFlags: boolean;
}

export default function EvidenceTimelineViewer({
    userId,
    taskId,
    questionId,
    className = '',
}: EvidenceTimelineViewerProps) {
    const [timeline, setTimeline] = useState<IntegrityTimelineEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedEntry, setSelectedEntry] = useState<IntegrityTimelineEntry | null>(null);
    const [zoomLevel, setZoomLevel] = useState(1);
    const [filters, setFilters] = useState<TimelineFilter>({
        eventTypes: [],
        severityLevels: [],
        timeRange: 'all',
        showOnlyFlags: false,
    });

    // Fetch timeline data
    const fetchTimeline = async () => {
        try {
            setLoading(true);
            setError(null);
            
            const params = new URLSearchParams({
                limit: '100',
            });
            
            if (taskId) params.append('task_id', taskId.toString());

            const response = await fetch(`/api/integrity/users/${userId}/timeline?${params.toString()}`);
            
            if (response.ok) {
                const data = await response.json();
                setTimeline(data);
            } else {
                setError('Failed to fetch timeline data');
            }
        } catch (err) {
            setError('Network error occurred');
            console.error('Timeline fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchTimeline();
    }, [userId, taskId, questionId]);

    // Filter timeline entries
    const filteredTimeline = useMemo(() => {
        let filtered = [...timeline];

        // Filter by event types
        if (filters.eventTypes.length > 0) {
            filtered = filtered.filter(entry => 
                filters.eventTypes.includes(entry.event_type)
            );
        }

        // Filter by severity levels
        if (filters.severityLevels.length > 0) {
            filtered = filtered.filter(entry => 
                entry.severity && filters.severityLevels.includes(entry.severity)
            );
        }

        // Filter by time range
        if (filters.timeRange !== 'all') {
            const now = new Date();
            let cutoffTime: Date;

            switch (filters.timeRange) {
                case 'last_hour':
                    cutoffTime = new Date(now.getTime() - 60 * 60 * 1000);
                    break;
                case 'last_day':
                    cutoffTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                    break;
                case 'last_week':
                    cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                    break;
                default:
                    cutoffTime = new Date(0);
            }

            filtered = filtered.filter(entry => 
                new Date(entry.timestamp) >= cutoffTime
            );
        }

        // Show only flags if requested
        if (filters.showOnlyFlags) {
            filtered = filtered.filter(entry => 
                entry.event_type === 'integrity_flag'
            );
        }

        return filtered.sort((a, b) => 
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }, [timeline, filters]);

    // Get unique event types and severity levels for filters
    const availableEventTypes = useMemo(() => 
        [...new Set(timeline.map(entry => entry.event_type))].sort()
    , [timeline]);

    const availableSeverityLevels = useMemo(() => 
        [...new Set(timeline.filter(entry => entry.severity).map(entry => entry.severity!))]
            .sort()
    , [timeline]);

    const formatTimestamp = (timestamp: string) => {
        const date = new Date(timestamp);
        return {
            date: date.toLocaleDateString(),
            time: date.toLocaleTimeString(),
            relative: getRelativeTime(date),
        };
    };

    const getRelativeTime = (date: Date) => {
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffDays > 0) return `${diffDays}d ago`;
        if (diffHours > 0) return `${diffHours}h ago`;
        if (diffMins > 0) return `${diffMins}m ago`;
        return `${diffSecs}s ago`;
    };

    const getBarChart3 className="h-4 w-4" = (eventType: string) => {
        switch (eventType) {
            case 'integrity_flag':
                return <Flag className="h-4 w-4" />;
            case 'integrity_event':
                return <BarChart3 className="h-4 w-4" />;
            default:
                return <Clock className="h-4 w-4" />;
        }
    };

    const getSeverityColor = (severity?: string) => {
        if (!severity) return 'border-gray-300 bg-gray-50';
        
        switch (severity.toLowerCase()) {
            case 'critical':
                return 'border-red-500 bg-red-50 text-red-700';
            case 'high':
                return 'border-orange-500 bg-orange-50 text-orange-700';
            case 'medium':
                return 'border-yellow-500 bg-yellow-50 text-yellow-700';
            case 'low':
                return 'border-blue-500 bg-blue-50 text-blue-700';
            default:
                return 'border-gray-300 bg-gray-50';
        }
    };

    const exportTimeline = () => {
        const dataStr = JSON.stringify(filteredTimeline, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = `integrity-timeline-${userId}-${new Date().toISOString().split('T')[0]}.json`;
        
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    };

    const toggleEventTypeFilter = (eventType: string) => {
        setFilters(prev => ({
            ...prev,
            eventTypes: prev.eventTypes.includes(eventType)
                ? prev.eventTypes.filter(t => t !== eventType)
                : [...prev.eventTypes, eventType]
        }));
    };

    const toggleSeverityFilter = (severity: string) => {
        setFilters(prev => ({
            ...prev,
            severityLevels: prev.severityLevels.includes(severity)
                ? prev.severityLevels.filter(s => s !== severity)
                : [...prev.severityLevels, severity]
        }));
    };

    if (loading) {
        return (
            <Card className={`p-6 ${className}`}>
                <div className="flex items-center justify-center h-32">
                    <div className="text-lg text-gray-500">Loading timeline...</div>
                </div>
            </Card>
        );
    }

    if (error) {
        return (
            <Card className={`p-6 ${className}`}>
                <div className="text-center">
                    <div className="text-red-600 mb-4">{error}</div>
                    <Button onClick={fetchTimeline} variant="outline">
                        Retry
                    </Button>
                </div>
            </Card>
        );
    }

    return (
        <div className={`space-y-4 ${className}`}>
            {/* Header */}
            <Card className="p-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <Clock className="h-4 w-4" />
                        <h2 className="text-xl font-semibold">Evidence Timeline</h2>
                        <span className="text-sm text-gray-500">
                            ({filteredTimeline.length} events)
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            onClick={() => setZoomLevel(prev => Math.min(prev + 0.2, 2))}
                            variant="outline"
                            size="sm"
                            title="Zoom In"
                        >
                            <ZoomIn className="h-4 w-4" />
                        </Button>
                        <Button
                            onClick={() => setZoomLevel(prev => Math.max(prev - 0.2, 0.6))}
                            variant="outline"
                            size="sm"
                            title="Zoom Out"
                        >
                            <ZoomOut className="h-4 w-4" />
                        </Button>
                        <Button
                            onClick={exportTimeline}
                            variant="outline"
                            size="sm"
                            className="flex items-center gap-1"
                        >
                            <Download className="h-4 w-4" />
                            Export
                        </Button>
                    </div>
                </div>

                {/* Filters */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Search className="h-4 w-4" />
                        <span className="text-sm font-medium">Filters:</span>
                        
                        <select
                            value={filters.timeRange}
                            onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value as any }))}
                            className="border rounded px-2 py-1 text-sm"
                        >
                            <option value="all">All Time</option>
                            <option value="last_hour">Last Hour</option>
                            <option value="last_day">Last Day</option>
                            <option value="last_week">Last Week</option>
                        </select>

                        <label className="flex items-center gap-1 text-sm">
                            <input
                                type="checkbox"
                                checked={filters.showOnlyFlags}
                                onChange={(e) => setFilters(prev => ({ ...prev, showOnlyFlags: e.target.checked }))}
                            />
                            Flags Only
                        </label>
                    </div>

                    {/* Event Type Filters */}
                    {availableEventTypes.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            <span className="text-xs text-gray-600">Event Types:</span>
                            {availableEventTypes.map(eventType => (
                                <button
                                    key={eventType}
                                    onClick={() => toggleEventTypeFilter(eventType)}
                                    className={`px-2 py-1 rounded text-xs border ${
                                        filters.eventTypes.includes(eventType)
                                            ? 'bg-blue-100 border-blue-300 text-blue-700'
                                            : 'bg-gray-100 border-gray-300 text-gray-600'
                                    }`}
                                >
                                    {eventType.replace('_', ' ')}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Severity Filters */}
                    {availableSeverityLevels.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            <span className="text-xs text-gray-600">Severity:</span>
                            {availableSeverityLevels.map(severity => (
                                <button
                                    key={severity}
                                    onClick={() => toggleSeverityFilter(severity)}
                                    className={`px-2 py-1 rounded text-xs border ${
                                        filters.severityLevels.includes(severity)
                                            ? getSeverityColor(severity)
                                            : 'bg-gray-100 border-gray-300 text-gray-600'
                                    }`}
                                >
                                    {severity}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </Card>

            {/* Timeline */}
            <Card className="p-4">
                <div className="space-y-4" style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left' }}>
                    {filteredTimeline.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">
                            No timeline events match the current filters.
                        </div>
                    ) : (
                        filteredTimeline.map((entry, index) => {
                            const timestamps = formatTimestamp(entry.timestamp);
                            const isFlag = entry.event_type === 'integrity_flag';
                            
                            return (
                                <div
                                    key={`${entry.timestamp}-${index}`}
                                    className={`relative flex gap-4 p-4 border-l-4 ${getSeverityColor(entry.severity)} rounded-r-lg cursor-pointer hover:shadow-md transition-shadow`}
                                    onClick={() => setSelectedEntry(entry)}
                                >
                                    {/* Icon */}
                                    <div className="flex-shrink-0 text-lg">
                                        {getBarChart3 className="h-4 w-4"(entry.event_type)}
                                    </div>
                                    
                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="font-medium text-gray-900 capitalize">
                                                {entry.description}
                                            </div>
                                            <div className="text-xs text-gray-500 text-right">
                                                <div>{timestamps.relative}</div>
                                                <div>{timestamps.time}</div>
                                            </div>
                                        </div>
                                        
                                        {entry.severity && (
                                            <div className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full mb-2">
                                                Severity: {entry.severity}
                                            </div>
                                        )}
                                        
                                        {entry.data && Object.keys(entry.data).length > 0 && (
                                            <div className="text-sm text-gray-600">
                                                <div className="font-medium">Additional Data:</div>
                                                <div className="mt-1 bg-gray-100 p-2 rounded text-xs">
                                                    {Object.entries(entry.data).map(([key, value]) => (
                                                        <div key={key}>
                                                            <span className="font-medium">{key}:</span> {JSON.stringify(value)}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </Card>

            {/* Detail Modal */}
            {selectedEntry && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold">Timeline Entry Details</h3>
                            <button
                                onClick={() => setSelectedEntry(null)}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Event Type</label>
                                    <p className="text-sm text-gray-900 capitalize">{selectedEntry.event_type.replace('_', ' ')}</p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700">Timestamp</label>
                                    <p className="text-sm text-gray-900">{new Date(selectedEntry.timestamp).toLocaleString()}</p>
                                </div>
                                {selectedEntry.severity && (
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700">Severity</label>
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(selectedEntry.severity)}`}>
                                            {selectedEntry.severity}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                                <p className="text-sm text-gray-900">{selectedEntry.description}</p>
                            </div>

                            {selectedEntry.data && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Event Data</label>
                                    <pre className="text-xs bg-gray-100 p-3 rounded overflow-x-auto">
                                        {JSON.stringify(selectedEntry.data, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end mt-6">
                            <Button onClick={() => setSelectedEntry(null)} variant="outline">
                                Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}