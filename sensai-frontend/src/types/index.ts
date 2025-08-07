// Define interfaces for Task-related data
export interface TaskData {
    id: string;
    title: string;
    blocks: any[];
    status: string;
    scheduled_publish_at?: string;
}

export interface Member {
    id: number;
    email: string;
}

export interface CohortMember extends Member {
    role: 'learner' | 'mentor';
}

export interface TeamMember extends Member {
    role: 'owner' | 'admin';  // Updated roles as per requirement
}

export interface Course {
    id: number;
    name: string;
}

export interface Cohort {
    id: number;
    name: string;
    joined_at: string | undefined;
}

export interface CohortWithDetails extends Cohort {
    members: CohortMember[];
    org_id: number;
    name: string;
    groups: any[];
    courses?: Course[];
}

export interface Task {
    id: number;
    title: string;
    type: string;
    status: string;
    ordering: number;
    content?: any[]; // Content for learning materials
    num_questions?: number;
    questions?: any[]; // Questions for quizzes and exams
    scheduled_publish_at: string;
    is_generating: boolean;
}

export interface Milestone {
    id: number;
    name: string;
    color: string;
    ordering: number;
    tasks?: Task[];
    unlock_at?: string;
}

// Export all quiz types
export * from './quiz';

// Integrity System Types

export enum IntegrityEventType {
    PASTE_BURST = "paste_burst",
    TYPING_ANOMALY = "typing_anomaly",
    ANSWER_SIMILARITY = "answer_similarity",
    STYLE_DRIFT = "style_drift",
    TAB_SWITCH = "tab_switch",
    COPY_PASTE = "copy_paste",
    RAPID_COMPLETION = "rapid_completion",
    VOICE_ACTIVITY = "voice_activity",
    VOICE_TRANSCRIPTION = "voice_transcription",
    SUSPICIOUS_SPEECH = "suspicious_speech",
}

export enum IntegrityFlagType {
    CONTENT_SIMILARITY = "content_similarity",
    BEHAVIORAL_ANOMALY = "behavioral_anomaly",
    PROCTORING_VIOLATION = "proctoring_violation",
    TECHNICAL_IRREGULARITY = "technical_irregularity",
    TEST_COMPLETION = "test_completion",
}

export enum IntegritySeverity {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    CRITICAL = "critical",
}

export enum IntegrityFlagStatus {
    PENDING = "pending",
    REVIEWED = "reviewed",
    DISMISSED = "dismissed",
    ESCALATED = "escalated",
}

export enum ReviewDecision {
    NO_VIOLATION = "no_violation",
    MINOR_CONCERN = "minor_concern",
    INTEGRITY_VIOLATION = "integrity_violation",
    FURTHER_INVESTIGATION = "further_investigation",
}

export interface IntegrityEvent {
    id?: number;
    user_id: number;
    session_id?: string;
    event_type: IntegrityEventType;
    event_data?: Record<string, any>;
    confidence_score?: number;
    question_id?: number;
    task_id?: number;
    created_at?: string;
}

export interface CreateIntegrityEventRequest {
    session_id?: string;
    event_type: IntegrityEventType;
    event_data?: Record<string, any>;
    confidence_score?: number;
    question_id?: number;
    task_id?: number;
}

export interface ProctoringSession {
    id?: number;
    session_id: string;
    user_id: number;
    task_id?: number;
    question_id?: number;
    started_at?: string;
    ended_at?: string;
    session_data?: Record<string, any>;
    integrity_score?: number;
}

export interface StartProctoringSessionRequest {
    task_id?: number;
    question_id?: number;
    session_data?: Record<string, any>;
}

export interface IntegrityFlag {
    id: number;
    user_id: number;
    session_id?: string;
    flag_type: IntegrityFlagType;
    severity: IntegritySeverity;
    confidence_score: number;
    evidence_data?: Record<string, any>;
    ai_analysis?: string;
    question_id?: number;
    task_id?: number;
    status: IntegrityFlagStatus;
    created_at: string;
    reviewed_at?: string;
}

export interface CreateIntegrityFlagRequest {
    session_id?: string;
    flag_type: IntegrityFlagType;
    severity: IntegritySeverity;
    confidence_score: number;
    evidence_data?: Record<string, any>;
    ai_analysis?: string;
    question_id?: number;
    task_id?: number;
}

export interface IntegrityReview {
    id: number;
    flag_id: number;
    reviewer_user_id: number;
    decision: ReviewDecision;
    notes?: string;
    follow_up_action?: string;
    follow_up_completed: boolean;
    reviewed_at: string;
}

export interface CreateIntegrityReviewRequest {
    decision: ReviewDecision;
    notes?: string;
    follow_up_action?: string;
}

export interface IntegrityFlagWithDetails extends IntegrityFlag {
    user_email?: string;
    user_name?: string;
    task_title?: string;
    question_title?: string;
    review?: IntegrityReview;
}

export interface IntegrityTimelineEntry {
    timestamp: string;
    event_type: string;
    description: string;
    data?: Record<string, any>;
    severity?: string;
}

export interface IntegrityDashboardStats {
    total_flags: number;
    pending_flags: number;
    high_severity_flags: number;
    flags_by_type: Record<string, number>;
    recent_flags: IntegrityFlagWithDetails[];
}

export interface TypingEvent {
    id: string;
    timestamp: number;
    key?: string;
    type: 'keydown' | 'keyup';
    interval?: number;
}

export interface PasteEvent {
    id: string;
    timestamp: number;
    content: string;
    length: number;
}

export interface FocusEvent {
    id: string;
    timestamp: number;
    type: 'focus' | 'blur';
    target: string;
}

export interface WebSocketIntegrityMessage {
    type: 'integrity_event' | 'integrity_flag' | 'proctoring_update' | 'session_started' | 'pong';
    data: Record<string, any>;
}

export interface ProctoringControls {
    isActive: boolean;
    sessionId?: string;
    startTime?: string;
    endTime?: string;
    integrityScore?: number;
}

export interface IntegrityAlertSettings {
    enableRealTimeAlerts: boolean;
    alertThreshold: IntegritySeverity;
    enableSoundAlerts: boolean;
    enableEmailAlerts: boolean;
}

// Export other types as needed 