/**
 * API utilities for student-related operations
 */

export interface Assignment {
    id: number;
    title: string;
    description: string;
    type: 'quiz' | 'learning_material' | 'project';
    status: 'not_started' | 'in_progress' | 'completed' | 'overdue';
    dueDate?: string;
    duration?: number; // in minutes
    questions?: number;
    attempts?: number;
    maxAttempts?: number;
    courseTitle: string;
    milestoneTitle: string;
    difficultyLevel: 'easy' | 'medium' | 'hard';
    integrityEnabled: boolean;
    course_id: number;
    milestone_id?: number;
}

export interface Course {
    id: number;
    title: string;
    description: string;
    instructor: string;
    assignments: Assignment[];
    progress: number;
    nextDueDate?: string;
    org_id: number;
}

export interface UserCourse {
    id: number;
    title: string;
    description: string;
    org_id: number;
    milestones: Milestone[];
}

export interface Milestone {
    id: number;
    name: string;
    description: string;
    tasks: Task[];
}

export interface Task {
    id: number;
    name: string;
    type: 'learning_material' | 'quiz';
    verified: boolean;
    input_type: string;
    response_type: string;
    coding_language: string[];
    milestone: string;
    course_task_id: number;
    milestone_id: number;
}

/**
 * Fetch courses for the authenticated user
 */
export async function fetchUserCourses(userId: number): Promise<Course[]> {
    try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/users/${userId}/courses`);
        if (!response.ok) {
            console.log(`Backend user courses endpoint failed: ${response.status}`);
            return [];
        }
        
        const userCourses = await response.json();
        console.log('Backend user courses:', userCourses);
        
        // Transform to Course format with assignments fetched from tasks endpoint
        const transformedCourses: Course[] = await Promise.all(
            userCourses.map(async (course: any) => {
                // Fetch tasks for each course using the courses/{id}/tasks endpoint
                let assignments: Assignment[] = [];
                
                try {
                    const tasksResponse = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/courses/${course.id}/tasks`);
                    if (tasksResponse.ok) {
                        const tasks = await tasksResponse.json();
                        console.log(`Tasks for course ${course.id}:`, tasks);
                        assignments = tasks.map((task: any) => ({
                            id: task.id,
                            title: task.title || task.name,
                            description: `Complete this ${task.type.replace('_', ' ')} assignment`,
                            type: task.type,
                            status: 'not_started' as const,
                            courseTitle: course.name,
                            milestoneTitle: task.milestone || 'General',
                            difficultyLevel: 'medium' as const,
                            integrityEnabled: task.type === 'quiz',
                            course_id: course.id,
                            milestone_id: task.milestone_id,
                            questions: task.type === 'quiz' ? 3 : 0, // Default for now
                            duration: estimateTaskDuration(task.type, task.type === 'quiz' ? 3 : 0)
                        }));
                    }
                } catch (error) {
                    console.error(`Failed to fetch tasks for course ${course.id}:`, error);
                }
                
                return {
                    id: course.id,
                    title: course.name,
                    description: `Learn ${course.name}`,
                    instructor: course.org?.name || 'Instructor',
                    assignments,
                    progress: calculateCourseProgress(assignments),
                    nextDueDate: findNextDueDate(assignments),
                    org_id: course.org?.id || 1,
                };
            })
        );
        
        return transformedCourses;
    } catch (error) {
        console.error('Error fetching user courses:', error);
        return [];
    }
}

/**
 * Transform milestones and tasks into assignments
 */
async function transformMilestonesToAssignments(milestones: Milestone[], courseTitle: string): Promise<Assignment[]> {
    const assignments: Assignment[] = [];
    
    for (const milestone of milestones) {
        for (const task of milestone.tasks) {
            // Fetch detailed task information
            const taskDetails = await fetchTaskDetails(task.id);
            
            const assignment: Assignment = {
                id: task.id,
                title: task.name,
                description: taskDetails?.description || `${task.type.replace('_', ' ')} task`,
                type: task.type as 'quiz' | 'learning_material',
                status: 'not_started', // TODO: Get actual status from user progress
                courseTitle,
                milestoneTitle: milestone.name,
                difficultyLevel: 'medium', // TODO: Add difficulty to backend
                integrityEnabled: task.type === 'quiz', // Enable integrity for quiz tasks
                course_id: task.course_task_id,
                milestone_id: task.milestone_id,
                questions: taskDetails?.questions?.length || 0,
                duration: estimateTaskDuration(task.type, taskDetails?.questions?.length || 0)
            };
            
            assignments.push(assignment);
        }
    }
    
    return assignments;
}

/**
 * Fetch detailed task information
 */
async function fetchTaskDetails(taskId: number): Promise<any> {
    try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/tasks/${taskId}`);
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error(`Error fetching task ${taskId}:`, error);
    }
    return null;
}

/**
 * Calculate course progress based on completed assignments
 */
function calculateCourseProgress(assignments: Assignment[]): number {
    if (assignments.length === 0) return 0;
    
    const completedCount = assignments.filter(a => a.status === 'completed').length;
    return Math.round((completedCount / assignments.length) * 100);
}

/**
 * Find the next due date among assignments
 */
function findNextDueDate(assignments: Assignment[]): string | undefined {
    const upcomingDueDates = assignments
        .filter(a => a.dueDate && a.status !== 'completed')
        .map(a => a.dueDate!)
        .sort();
    
    return upcomingDueDates[0];
}

/**
 * Estimate task duration based on type and content
 */
function estimateTaskDuration(type: string, questionCount: number): number {
    switch (type) {
        case 'quiz':
            return questionCount * 8; // 8 minutes per question
        case 'learning_material':
            return 15; // 15 minutes for reading
        default:
            return 30;
    }
}

/**
 * Create mock assignments for demonstration
 */
export function createMockAssignments(): Course[] {
    return [
        {
            id: 1,
            title: "Computer Science Fundamentals",
            description: "Core concepts in programming and algorithms",
            instructor: "Dr. Smith",
            progress: 65,
            nextDueDate: "2025-08-10",
            org_id: 1,
            assignments: [
                {
                    id: 1,
                    title: "Database Normalization",
                    description: "Understanding 2NF and 3NF with practical examples",
                    type: "quiz",
                    status: "not_started",
                    dueDate: "2025-08-10",
                    duration: 45,
                    questions: 5,
                    attempts: 0,
                    maxAttempts: 3,
                    courseTitle: "Computer Science Fundamentals",
                    milestoneTitle: "Database Design",
                    difficultyLevel: "medium",
                    integrityEnabled: true,
                    course_id: 1,
                    milestone_id: 1
                },
                {
                    id: 2,
                    title: "Algorithm Complexity Analysis",
                    description: "Big O notation and time complexity analysis",
                    type: "quiz",
                    status: "not_started",
                    dueDate: "2025-08-12",
                    duration: 30,
                    questions: 3,
                    attempts: 0,
                    maxAttempts: 2,
                    courseTitle: "Computer Science Fundamentals",
                    milestoneTitle: "Algorithms",
                    difficultyLevel: "hard",
                    integrityEnabled: true,
                    course_id: 1,
                    milestone_id: 2
                },
                {
                    id: 3,
                    title: "React Hooks Deep Dive",
                    description: "Understanding useEffect, useState, and custom hooks",
                    type: "learning_material",
                    status: "completed",
                    courseTitle: "Computer Science Fundamentals",
                    milestoneTitle: "Frontend Development",
                    difficultyLevel: "medium",
                    integrityEnabled: false,
                    course_id: 1,
                    milestone_id: 3
                }
            ]
        },
        {
            id: 2,
            title: "Advanced Web Development",
            description: "Modern web technologies and frameworks",
            instructor: "Prof. Johnson",
            progress: 30,
            nextDueDate: "2025-08-15",
            org_id: 1,
            assignments: [
                {
                    id: 4,
                    title: "Full Stack Project",
                    description: "Build a complete web application with authentication",
                    type: "project" as any,
                    status: "in_progress",
                    dueDate: "2025-08-15",
                    duration: 120,
                    courseTitle: "Advanced Web Development",
                    milestoneTitle: "Final Project",
                    difficultyLevel: "hard",
                    integrityEnabled: true,
                    course_id: 2,
                    milestone_id: 4
                }
            ]
        }
    ];
}

/**
 * Fetch assignment by ID
 */
export async function fetchAssignment(assignmentId: number): Promise<Assignment | null> {
    try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/tasks/${assignmentId}`);
        if (!response.ok) {
            console.log(`Backend task ${assignmentId} not found, using mock data`);
            // Fall back to mock data when backend doesn't have the assignment
            return getMockAssignmentById(assignmentId);
        }
        
        const taskData = await response.json();
        
        // Transform task data to assignment format
        const assignment: Assignment = {
            id: taskData.id,
            title: taskData.name || taskData.title,
            description: taskData.description || '',
            type: taskData.type,
            status: 'not_started', // TODO: Get actual status
            courseTitle: taskData.course_title || 'Course',
            milestoneTitle: taskData.milestone || 'Milestone',
            difficultyLevel: 'medium',
            integrityEnabled: taskData.type === 'quiz',
            course_id: taskData.course_id,
            milestone_id: taskData.milestone_id,
            questions: taskData.questions?.length || 0,
            duration: estimateTaskDuration(taskData.type, taskData.questions?.length || 0)
        };
        
        return assignment;
    } catch (error) {
        console.error('Error fetching assignment:', error);
        // Fall back to mock data on any error
        return getMockAssignmentById(assignmentId);
    }
}

/**
 * Get mock assignment data by ID for demonstration purposes
 */
function getMockAssignmentById(assignmentId: number): Assignment | null {
    const mockCourses = createMockAssignments();
    const allAssignments = mockCourses.flatMap(course => course.assignments);
    
    return allAssignments.find(assignment => assignment.id === assignmentId) || {
        id: assignmentId,
        title: "Sample Assignment",
        description: "This is a sample assignment for demonstration purposes",
        type: "quiz",
        status: "not_started",
        courseTitle: "Demo Course",
        milestoneTitle: "Demo Milestone",
        difficultyLevel: "medium",
        integrityEnabled: true,
        course_id: 1,
        milestone_id: 1,
        questions: 3,
        duration: 30
    };
}

/**
 * Start a proctoring session for an assignment
 */
export async function startProctoringSession(userId: number, assignmentId: number, questionId?: number): Promise<string | null> {
    try {
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/sessions?user_id=${userId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                task_id: assignmentId,
                question_id: questionId
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            return data.session_id;
        }
    } catch (error) {
        console.error('Error starting proctoring session:', error);
    }
    
    return null;
}

/**
 * Submit assignment completion
 */
export async function submitAssignmentCompletion(
    userId: number, 
    assignmentId: number, 
    answers: any[],
    sessionId?: string
): Promise<boolean> {
    try {
        // Submit answers
        const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/tasks/${assignmentId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                answers,
                session_id: sessionId
            })
        });
        
        if (response.ok) {
            // End proctoring session if it exists
            if (sessionId) {
                await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/sessions/${sessionId}/end`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            
            return true;
        }
    } catch (error) {
        console.error('Error submitting assignment:', error);
    }
    
    return false;
}
