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
                    console.log('Assignment IDs:', allAssignments.map(a => a.id));
                    setAssignments(allAssignments);
                } else {
                    console.log('No real courses found, falling back to mock data');
                    // Fall back to mock data for demo purposes
                    const mockCourses = createMockAssignments();
                    setCourses(mockCourses);
                    const allAssignments = mockCourses.flatMap(course => course.assignments);
                    console.log('All assignments from mock data:', allAssignments);
                    console.log('Mock Assignment IDs:', allAssignments.map(a => a.id));
                    setAssignments(allAssignments);
                }
                } else {
                    // Use mock data when no user ID available
                    const mockCourses = createMockAssignments();
                    setCourses(mockCourses);
                    const allAssignments = mockCourses.flatMap(course => course.assignments);
                    console.log('All assignments from mock data (no user ID):', allAssignments);
                    console.log('Mock Assignment IDs (no user ID):', allAssignments.map(a => a.id));
                    setAssignments(allAssignments);
                }
            } catch (error) {
                console.error('Error fetching data:', error);
                // Fall back to mock data on error
                const mockCourses = createMockAssignments();
                setCourses(mockCourses);
                const allAssignments = mockCourses.flatMap(course => course.assignments);
                console.log('All assignments from mock data (error fallback):', allAssignments);
                console.log('Mock Assignment IDs (error fallback):', allAssignments.map(a => a.id));
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
                return 'bg-green-900 text-green-300 border border-green-500';
            case 'in_progress':
                return 'bg-blue-900 text-blue-300 border border-blue-500';
            case 'overdue':
                return 'bg-red-900 text-red-300 border border-red-500';
            default:
                return 'bg-gray-800 text-gray-300 border border-gray-500';
        }
    };

    const getDifficultyColor = (level: Assignment['difficultyLevel']) => {
        switch (level) {
            case 'easy':
                return 'bg-green-900 text-green-300 border border-green-500';
            case 'medium':
                return 'bg-yellow-900 text-yellow-300 border border-yellow-500';
            case 'hard':
                return 'bg-red-900 text-red-300 border border-red-500';
            default:
                return 'bg-gray-800 text-gray-300 border border-gray-500';
        }
    };

    if (status === 'loading' || loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-black">
                <div className="w-12 h-12 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
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
        <div className="min-h-screen bg-black">
            {/* Header */}
            <div className="bg-[#1A1A1A] border-b border-gray-800">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center py-6">
                        <div>
                            <h1 className="text-3xl font-light text-white leading-tight">
                                Welcome back, {session?.user?.name || 'Student'}!
                            </h1>
                            <p className="text-gray-400 mt-1">
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

            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {selectedView === 'overview' ? (
                    <>
                        {/* Stats Overview */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                            <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-6 border-b-2 border-blue-500 border-opacity-70">
                                <div className="flex items-center">
                                    <BookOpen className="w-8 h-8 text-blue-400" />
                                    <div className="ml-4">
                                        <p className="text-sm text-gray-400">Total Assignments</p>
                                        <p className="text-2xl font-light text-white">{assignments.length}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-6 border-b-2 border-green-500 border-opacity-70">
                                <div className="flex items-center">
                                    <CheckCircle className="w-8 h-8 text-green-400" />
                                    <div className="ml-4">
                                        <p className="text-sm text-gray-400">Completed</p>
                                        <p className="text-2xl font-light text-white">{completedCount}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-6 border-b-2 border-orange-500 border-opacity-70">
                                <div className="flex items-center">
                                    <Clock className="w-8 h-8 text-orange-400" />
                                    <div className="ml-4">
                                        <p className="text-sm text-gray-400">In Progress</p>
                                        <p className="text-2xl font-light text-white">{upcomingAssignments.length}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-6 border-b-2 border-red-500 border-opacity-70">
                                <div className="flex items-center">
                                    <AlertCircle className="w-8 h-8 text-red-400" />
                                    <div className="ml-4">
                                        <p className="text-sm text-gray-400">Overdue</p>
                                        <p className="text-2xl font-light text-white">{overdueName}</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Upcoming Assignments */}
                        <div className="bg-[#1A1A1A] text-gray-300 rounded-lg p-6 mb-8 border-b-2 border-purple-500 border-opacity-70">
                            <h2 className="text-xl font-light text-white mb-4 flex items-center">
                                <Calendar className="w-5 h-5 mr-2 text-purple-400" />
                                Upcoming Assignments
                            </h2>
                                {upcomingAssignments.length === 0 ? (
                                    <p className="text-gray-400 text-center py-8">No upcoming assignments</p>
                                ) : (
                                    <div className="space-y-4">
                                        {upcomingAssignments.slice(0, 3).map((assignment, index) => (
                                            <div
                                                key={`upcoming-${assignment.course_id}-${assignment.id}-${index}`}
                                                className="flex items-center justify-between p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
                                                onClick={() => handleStartAssignment(assignment)}
                                            >
                                                <div className="flex items-center space-x-4">
                                                    {getStatusIcon(assignment.status)}
                                                    <div>
                                                        <h3 className="font-light text-white">{assignment.title}</h3>
                                                        <p className="text-sm text-gray-400">
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
                                                        <span className="px-2 py-1 text-xs bg-purple-900 text-purple-300 border border-purple-500 rounded-full">
                                                            Proctored
                                                        </span>
                                                    )}
                                                    <ArrowRight className="w-4 h-4 text-gray-400" />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                        </div>

                        {/* Courses Overview */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {courses.map((course) => (
                                <div key={course.id} className="bg-[#1A1A1A] text-gray-300 rounded-lg p-6 border-b-2 border-indigo-500 border-opacity-70 hover:opacity-90 transition-all">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-xl font-light text-white">{course.title}</h3>
                                        <span className="text-sm text-gray-400">
                                            {course.progress}% Complete
                                        </span>
                                    </div>
                                    <p className="text-gray-400 mb-4">{course.description}</p>
                                    <div className="mb-4">
                                        <div className="flex justify-between text-sm text-gray-400 mb-1">
                                            <span>Progress</span>
                                            <span>{course.progress}%</span>
                                        </div>
                                        <div className="w-full bg-gray-700 rounded-full h-2">
                                            <div
                                                className="bg-indigo-500 h-2 rounded-full transition-all duration-300"
                                                style={{ width: `${course.progress}%` }}
                                            ></div>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm text-gray-400">
                                            <p>Instructor: {course.instructor}</p>
                                            <p>{course.assignments.length} assignments</p>
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setSelectedView('assignments')}
                                            className="border-gray-600 text-gray-300 hover:bg-gray-700"
                                        >
                                            View Assignments
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    /* All Assignments View */
                    <div className="space-y-6">
                        <h2 className="text-2xl font-light text-white">All Assignments</h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {assignments.map((assignment, index) => (
                                <div key={`assignment-${assignment.course_id}-${assignment.id}-${index}`} className="bg-[#1A1A1A] text-gray-300 rounded-lg p-6 border-b-2 border-pink-500 border-opacity-70 hover:opacity-90 transition-all cursor-pointer" onClick={() => handleStartAssignment(assignment)}>
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex-1">
                                            <h3 className="text-lg font-light text-white">{assignment.title}</h3>
                                            <p className="text-sm text-gray-400 mt-1">
                                                {assignment.courseTitle} • {assignment.milestoneTitle}
                                            </p>
                                        </div>
                                        {getStatusIcon(assignment.status)}
                                    </div>
                                    <p className="text-gray-400 mb-4 text-sm">
                                        {assignment.description}
                                    </p>
                                        
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-gray-400">Type:</span>
                                            <span className="capitalize font-light text-white">{assignment.type.replace('_', ' ')}</span>
                                        </div>
                                        
                                        {assignment.duration && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-400">Duration:</span>
                                                <span className="font-light text-white">{assignment.duration} min</span>
                                            </div>
                                        )}
                                        
                                        {assignment.questions && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-400">Questions:</span>
                                                <span className="font-light text-white">{assignment.questions}</span>
                                            </div>
                                        )}
                                        
                                        {assignment.dueDate && (
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-400">Due Date:</span>
                                                <span className="font-light text-white">
                                                    {new Date(assignment.dueDate).toLocaleDateString()}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                        
                                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-700">
                                        <div className="flex space-x-2">
                                            <span className={`px-2 py-1 text-xs rounded-full ${getDifficultyColor(assignment.difficultyLevel)}`}>
                                                {assignment.difficultyLevel}
                                            </span>
                                            {assignment.integrityEnabled && (
                                                <span className="px-2 py-1 text-xs bg-purple-900 text-purple-300 border border-purple-500 rounded-full">
                                                    Proctored
                                                </span>
                                            )}
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-gray-400" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
