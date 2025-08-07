import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AlertTriangle, Eye, Users, MessageSquare, Smartphone, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ProctoringEvent {
  id: string;
  type: string;
  message: string;
  timestamp: string | Date;
  confidence?: number;
  details?: Record<string, any>;
}

interface ProctoringTimelineProps {
  events: ProctoringEvent[];
  className?: string;
}

const getEventIcon = (type: string) => {
  switch (type) {
    case 'face_not_detected':
      return <Eye className="h-4 w-4 text-amber-500" />;
    case 'multiple_faces':
      return <Users className="h-4 w-4 text-red-500" />;
    case 'mouth_open':
      return <MessageSquare className="h-4 w-4 text-purple-500" />;
    case 'gaze_direction':
      return <AlertTriangle className="h-4 w-4 text-blue-500" />;
    case 'device_detected':
      return <Smartphone className="h-4 w-4 text-rose-500" />;
    default:
      return <AlertTriangle className="h-4 w-4 text-gray-500" />;
  }
};

const getEventVariant = (type: string) => {
  switch (type) {
    case 'face_not_detected':
      return 'warning';
    case 'multiple_faces':
      return 'destructive';
    case 'mouth_open':
      return 'secondary';
    case 'gaze_direction':
      return 'outline';
    case 'device_detected':
      return 'destructive';
    default:
      return 'default';
  }
};

const formatTime = (dateString: string | Date) => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export function ProctoringTimeline({ events, className = '' }: ProctoringTimelineProps) {
  if (events.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 text-center ${className}`}>
        <Clock className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium">No proctoring events recorded</h3>
        <p className="text-sm text-muted-foreground">Monitoring events will appear here when detected</p>
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span>Proctoring Timeline</span>
          <Badge variant="outline" className="ml-2">
            {events.length} events
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4 p-4">
            {events.map((event) => (
              <div key={event.id} className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getEventIcon(event.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{event.message}</p>
                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                      {formatTime(event.timestamp)}
                    </span>
                  </div>
                  
                  {event.details && Object.keys(event.details).length > 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {Object.entries(event.details).map(([key, value]) => (
                        <div key={key} className="flex">
                          <span className="font-medium capitalize">{key}:</span>
                          <span className="ml-1">
                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {event.confidence !== undefined && (
                    <div className="mt-1">
                      <div className="w-full bg-gray-200 rounded-full h-1.5 dark:bg-gray-700">
                        <div 
                          className="bg-blue-600 h-1.5 rounded-full" 
                          style={{ width: `${Math.min(100, Math.max(0, event.confidence * 100))}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Confidence: {Math.round(event.confidence * 100)}%
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <Badge variant={getEventVariant(event.type)}>
                    {event.type.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

export default ProctoringTimeline;
