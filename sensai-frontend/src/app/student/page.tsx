'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, BookOpen, CheckCircle, AlertCircle, Users, Trophy, Calendar, ArrowRight } from 'lucide-react';
import { fetchUserCourses, createMockAssignments, type Assignment, type Course } from '@/lib/student-api';

// Remove local interfaces since we're importing them from student-api

export default function StudentDashboard() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [courses, setCourses] = useState<Course[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedView, setSelectedView] = useState<'overview' | 'assignments'>('overview');

    // Fetch real data from backend
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                if (session?.user?.id) {
                    // Try to fetch real courses from backend
                    const realCourses = await fetchUserCourses(parseInt(session.user.id));
                    
                                    if (realCourses.length > 0) {
                    console.log('Using real database courses:', realCourses);
                    setCourses(realCourses);
                    const allAssignments = realCourses.flatMap(course => course.assignments);
                    console.log('All assignments from database:', allAssignments);
                    setAssignments(allAssignments);
                } else {
                    console.log('No real courses found, falling back to mock data');
                    // Fall back to mock data for demo purposes
                    const mockCourses = createMockAssignments();
                    setCourses(mockCourses);
                    const allAssignments = mockCourses.flatMap(course => course.assignments);
                    setAssignments(allAssignments);
                }
                } else {
                    // Use mock data when no user ID available
                    const mockCourses = createMockAssignments();
                    setCourses(mockCourses);
                    const allAssignments = mockCourses.flatMap(course => course.assignments);
                    setAssignments(allAssignments);
                }
            } catch (error) {
                console.error('Error fetching data:', error);
                // Fall back to mock data on error
                const mockCourses = createMockAssignments();
                setCourses(mockCourses);
                const allAssignments = mockCourses.flatMap(course => course.assignments);
                setAssignments(allAssignments);
            } finally {
                setLoading(false);
            }
        };

        if (status === 'authenticated') {
            fetchData();
        }
    }, [status, session?.user?.id]);

    const handleStartAssignment = (assignment: Assignment) => {
        if (assignment.type === 'quiz') {
            // Navigate to assessment page with assignment data
            router.push(`/student/assessment?assignmentId=${assignment.id}&courseId=${assignment.course_id}&title=${encodeURIComponent(assignment.title)}`);
        } else if (assignment.type === 'learning_material') {
            // Navigate to learning material viewer
            router.push(`/student/learning?assignmentId=${assignment.id}&courseId=${assignment.course_id}&title=${encodeURIComponent(assignment.title)}`);
        } else if (assignment.type === 'project') {
            // Navigate to project workspace
            router.push(`/student/project?assignmentId=${assignment.id}&courseId=${assignment.course_id}&title=${encodeURIComponent(assignment.title)}`);
        }
    };

    const getStatusIcon = (status: Assignment['status']) => {
        switch (status) {
            case 'completed':
                return <CheckCircle className="w-5 h-5 text-green-500" />;
            case 'in_progress':
                return <Clock className="w-5 h-5 text-blue-500" />;
            case 'overdue':
                return <AlertCircle className="w-5 h-5 text-red-500" />;
            default:
                return <BookOpen className="w-5 h-5 text-gray-500" />;
        }
    };

    const getStatusColor = (status: Assignment['status']) => {
        switch (status) {
            case 'completed':
                return 'bg-green-100 text-green-800 border-green-200';
            case 'in_progress':
                return 'bg-blue-100 text-blue-800 border-blue-200';
            case 'overdue':
                return 'bg-red-100 text-red-800 border-red-200';
            default:
                return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const getDifficultyColor = (level: Assignment['difficultyLevel']) => {
        switch (level) {
            case 'easy':
                return 'bg-green-100 text-green-700';
            case 'medium':
                return 'bg-yellow-100 text-yellow-700';
            case 'hard':
                return 'bg-red-100 text-red-700';
            default:
                return 'bg-gray-100 text-gray-700';
        }
    };

    if (status === 'loading' || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (status === 'unauthenticated') {
        router.push('/login');
        return null;
    }

    const upcomingAssignments = assignments.filter(a => a.status === 'not_started' || a.status === 'in_progress');
    const completedCount = assignments.filter(a => a.status === 'completed').length;
    const overdueName = assignments.filter(a => a.status === 'overdue').length;

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-6">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">
                                Welcome back, {session?.user?.name || 'Student'}!
                            </h1>
                            <p className="text-gray-600 mt-1">
                                Ready to continue your learning journey?
                            </p>
                        </div>
                        <div className="flex space-x-4">
                            <Button
                                variant={selectedView === 'overview' ? 'default' : 'outline'}
                                onClick={() => setSelectedView('overview')}
                            >
                                Overview
                            </Button>
                            <Button
                                variant={selectedView === 'assignments' ? 'default' : 'outline'}
                                onClick={() => setSelectedView('assignments')}
                            >
                                All Assignments
                            </Button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {selectedView === 'overview' ? (
                    <>
                        {/* Stats Overview */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                            <Card>
                                <CardContent className="p-6">
                                    <div className="flex items-center">
                                        <BookOpen className="w-8 h-8 text-blue-500" />
                                        <div className="ml-4">
                                            <p className="text-sm font-medium text-gray-600">Total Assignments</p>
                                            <p className="text-2xl font-bold text-gray-900">{assignments.length}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="p-6">
                                    <div className="flex items-center">
                                        <CheckCircle className="w-8 h-8 text-green-500" />
                                        <div className="ml-4">
                                            <p className="text-sm font-medium text-gray-600">Completed</p>
                                            <p className="text-2xl font-bold text-gray-900">{completedCount}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="p-6">
                                    <div className="flex items-center">
                                        <Clock className="w-8 h-8 text-blue-500" />
                                        <div className="ml-4">
                                            <p className="text-sm font-medium text-gray-600">In Progress</p>
                                            <p className="text-2xl font-bold text-gray-900">{upcomingAssignments.length}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="p-6">
                                    <div className="flex items-center">
                                        <AlertCircle className="w-8 h-8 text-red-500" />
                                        <div className="ml-4">
                                            <p className="text-sm font-medium text-gray-600">Overdue</p>
                                            <p className="text-2xl font-bold text-gray-900">{overdueName}</p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Upcoming Assignments */}
                        <Card className="mb-8">
                            <CardHeader>
                                <CardTitle className="flex items-center">
                                    <Calendar className="w-5 h-5 mr-2" />
                                    Upcoming Assignments
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                {upcomingAssignments.length === 0 ? (
                                    <p className="text-gray-500 text-center py-8">No upcoming assignments</p>
                                ) : (
                                    <div className="space-y-4">
                                        {upcomingAssignments.slice(0, 3).map((assignment, index) => (
                                            <div
                                                key={`upcoming-${assignment.id}-${assignment.course_id}-${index}`}
                                                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                                            >
                                                <div className="flex items-center space-x-4">
                                                    {getStatusIcon(assignment.status)}
                                                    <div>
                                                        <h3 className="font-medium text-gray-900">{assignment.title}</h3>
                                                        <p className="text-sm text-gray-600">
                                                            {assignment.courseTitle} • {assignment.milestoneTitle}
                                                        </p>
                                                        {assignment.dueDate && (
                                                            <p className="text-sm text-gray-500">
                                                                Due: {new Date(assignment.dueDate).toLocaleDateString()}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center space-x-2">
                                                    <span className={`px-2 py-1 text-xs rounded-full ${getDifficultyColor(assignment.difficultyLevel)}`}>
                                                        {assignment.difficultyLevel}
                                                    </span>
                                                    {assignment.integrityEnabled && (
                                                        <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full">
                                                            Proctored
                                                        </span>
                                                    )}
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleStartAssignment(assignment)}
                                                        className="ml-4"
                                                    >
                                                        {assignment.status === 'in_progress' ? 'Continue' : 'Start'}
                                                        <ArrowRight className="w-4 h-4 ml-2" />
                                                    </Button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Courses Overview */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {courses.map((course) => (
                                <Card key={course.id}>
                                    <CardHeader>
                                        <CardTitle className="flex items-center justify-between">
                                            <span>{course.title}</span>
                                            <span className="text-sm font-normal text-gray-500">
                                                {course.progress}% Complete
                                            </span>
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-gray-600 mb-4">{course.description}</p>
                                        <div className="mb-4">
                                            <div className="flex justify-between text-sm text-gray-600 mb-1">
                                                <span>Progress</span>
                                                <span>{course.progress}%</span>
                                            </div>
                                            <div className="w-full bg-gray-200 rounded-full h-2">
                                                <div
                                                    className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                                                    style={{ width: `${course.progress}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <div className="text-sm text-gray-600">
                                                <p>Instructor: {course.instructor}</p>
                                                <p>{course.assignments.length} assignments</p>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setSelectedView('assignments')}
                                            >
                                                View Assignments
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </>
                ) : (
                    /* All Assignments View */
                    <div className="space-y-6">
                        <h2 className="text-2xl font-bold text-gray-900">All Assignments</h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {assignments.map((assignment, index) => (
                                <Card key={`assignment-${assignment.id}-${assignment.course_id}-${index}`} className="hover:shadow-lg transition-shadow">
                                    <CardHeader>
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <CardTitle className="text-lg">{assignment.title}</CardTitle>
                                                <p className="text-sm text-gray-600 mt-1">
                                                    {assignment.courseTitle}
                                                </p>
                                            </div>
                                            {getStatusIcon(assignment.status)}
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <p className="text-gray-600 mb-4 text-sm">
                                            {assignment.description}
                                        </p>
                                        
                                        <div className="space-y-3">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-600">Type:</span>
                                                <span className="capitalize font-medium">{assignment.type.replace('_', ' ')}</span>
                                            </div>
                                            
                                            {assignment.duration && (
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-gray-600">Duration:</span>
                                                    <span className="font-medium">{assignment.duration} min</span>
                                                </div>
                                            )}
                                            
                                            {assignment.questions && (
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-gray-600">Questions:</span>
                                                    <span className="font-medium">{assignment.questions}</span>
                                                </div>
                                            )}
                                            
                                            {assignment.dueDate && (
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-gray-600">Due Date:</span>
                                                    <span className="font-medium">
                                                        {new Date(assignment.dueDate).toLocaleDateString()}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        
                                        <div className="flex items-center justify-between mt-4 pt-4 border-t">
                                            <div className="flex space-x-2">
                                                <span className={`px-2 py-1 text-xs rounded-full border ${getStatusColor(assignment.status)}`}>
                                                    {assignment.status.replace('_', ' ')}
                                                </span>
                                                <span className={`px-2 py-1 text-xs rounded-full ${getDifficultyColor(assignment.difficultyLevel)}`}>
                                                    {assignment.difficultyLevel}
                                                </span>
                                            </div>
                                            
                                            {assignment.integrityEnabled && (
                                                <span className="px-2 py-1 text-xs bg-purple-100 text-purple-700 rounded-full">
                                                    Proctored
                                                </span>
                                            )}
                                        </div>
                                        
                                        <Button
                                            className="w-full mt-4"
                                            onClick={() => handleStartAssignment(assignment)}
                                            disabled={assignment.status === 'completed'}
                                        >
                                            {assignment.status === 'completed' ? 'Completed' : 
                                             assignment.status === 'in_progress' ? 'Continue' : 'Start Assignment'}
                                        </Button>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
