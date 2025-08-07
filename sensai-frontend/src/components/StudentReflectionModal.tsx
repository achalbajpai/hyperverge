import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Book, Edit, Check, AlertTriangle, HelpCircle } from 'lucide-react';
import {
    IntegrityFlagWithDetails,
    ReviewDecision,
    IntegritySeverity,
} from '../types';

interface StudentReflectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    flag: IntegrityFlagWithDetails;
    onComplete: (reflection: StudentReflection) => void;
}

interface StudentReflection {
    understanding: string;
    explanation: string;
    future_behavior: string;
    additional_notes?: string;
    completed_at: string;
}

interface ReflectionQuestion {
    id: string;
    question: string;
    placeholder: string;
    minLength: number;
    required: boolean;
}

export default function StudentReflectionModal({
    isOpen,
    onClose,
    flag,
    onComplete,
}: StudentReflectionModalProps) {
    const [currentStep, setCurrentStep] = useState(0);
    const [reflection, setReflection] = useState<Partial<StudentReflection>>({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const getReflectionQuestions = (): ReflectionQuestion[] => {
        const baseQuestions: ReflectionQuestion[] = [
            {
                id: 'understanding',
                question: 'Do you understand what academic integrity means and why it\'s important?',
                placeholder: 'Explain in your own words what academic integrity means to you and why it matters in your learning journey...',
                minLength: 100,
                required: true,
            },
            {
                id: 'explanation',
                question: 'Can you explain what happened during your recent task completion?',
                placeholder: 'Describe your actions during the task. Be honest about any resources you used or help you received...',
                minLength: 100,
                required: true,
            },
            {
                id: 'future_behavior',
                question: 'How will you ensure academic integrity in future tasks?',
                placeholder: 'Describe specific steps you will take to maintain academic integrity in your future work...',
                minLength: 100,
                required: true,
            },
        ];

        // Add severity-specific questions
        if (flag.severity === IntegritySeverity.HIGH || flag.severity === IntegritySeverity.CRITICAL) {
            baseQuestions.push({
                id: 'additional_notes',
                question: 'Is there anything else you would like to share about this situation?',
                placeholder: 'Any additional context, concerns, or commitments you\'d like to share...',
                minLength: 50,
                required: false,
            });
        }

        return baseQuestions;
    };

    const questions = getReflectionQuestions();

    const validateStep = (stepIndex: number): boolean => {
        const question = questions[stepIndex];
        const value = reflection[question.id as keyof StudentReflection] || '';
        
        if (question.required && value.length < question.minLength) {
            setErrors({
                [question.id]: `Please provide at least ${question.minLength} characters for this response.`
            });
            return false;
        }
        
        setErrors({});
        return true;
    };

    const handleNext = () => {
        if (validateStep(currentStep)) {
            setCurrentStep(prev => Math.min(prev + 1, questions.length));
        }
    };

    const handlePrevious = () => {
        setCurrentStep(prev => Math.max(prev - 1, 0));
        setErrors({});
    };

    const handleInputChange = (questionId: string, value: string) => {
        setReflection(prev => ({
            ...prev,
            [questionId]: value,
        }));
        
        // Clear error when user starts typing
        if (errors[questionId]) {
            setErrors(prev => ({
                ...prev,
                [questionId]: '',
            }));
        }
    };

    const handleSubmit = async () => {
        // Validate all steps
        let allValid = true;
        for (let i = 0; i < questions.length; i++) {
            if (!validateStep(i)) {
                allValid = false;
                break;
            }
        }

        if (!allValid) {
            setCurrentStep(0); // Go to first invalid step
            return;
        }

        setIsSubmitting(true);
        
        try {
            const completedReflection: StudentReflection = {
                understanding: reflection.understanding || '',
                explanation: reflection.explanation || '',
                future_behavior: reflection.future_behavior || '',
                additional_notes: reflection.additional_notes || '',
                completed_at: new Date().toISOString(),
            };

            onComplete(completedReflection);
        } catch (error) {
            console.error('Failed to submit reflection:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const getFlagSeverityMessage = () => {
        switch (flag.severity) {
            case IntegritySeverity.CRITICAL:
                return {
                    message: "A critical integrity concern has been flagged in your recent work.",
                    color: "text-red-600",
                    bgColor: "bg-red-50 border-red-200"
                };
            case IntegritySeverity.HIGH:
                return {
                    message: "A high-priority integrity concern has been flagged in your recent work.",
                    color: "text-orange-600",
                    bgColor: "bg-orange-50 border-orange-200"
                };
            case IntegritySeverity.MEDIUM:
                return {
                    message: "An integrity concern has been flagged in your recent work.",
                    color: "text-yellow-600",
                    bgColor: "bg-yellow-50 border-yellow-200"
                };
            default:
                return {
                    message: "A minor integrity concern has been flagged in your recent work.",
                    color: "text-blue-600",
                    bgColor: "bg-blue-50 border-blue-200"
                };
        }
    };

    const getProgressPercentage = () => {
        return Math.round(((currentStep + 1) / (questions.length + 1)) * 100);
    };

    if (!isOpen) return null;

    const severityInfo = getFlagSeverityMessage();
    const currentQuestion = questions[currentStep];
    const isLastStep = currentStep === questions.length;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <HelpCircle className="h-5 w-5" />
                        <h2 className="text-2xl font-bold text-gray-900">Academic Integrity Reflection</h2>
                    </div>
                    <div className="text-sm text-gray-500">
                        Step {currentStep + 1} of {questions.length + 1}
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-6">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${getProgressPercentage()}%` }}
                        />
                    </div>
                    <div className="text-center text-sm text-gray-600 mt-2">
                        {getProgressPercentage()}% Complete
                    </div>
                </div>

                {/* Alert Message */}
                <Card className={`p-4 mb-6 border-2 ${severityInfo.bgColor}`}>
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5" />
                        <div>
                            <div className={`font-semibold ${severityInfo.color} mb-2`}>
                                {severityInfo.message}
                            </div>
                            <div className="text-sm text-gray-700">
                                This reflection helps you understand academic integrity principles and develop better practices for future work.
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Content */}
                <div className="mb-6">
                    {!isLastStep ? (
                        /* Question Step */
                        <Card className="p-6">
                            <div className="space-y-4">
                                <div className="flex items-start gap-3">
                                    <Book className="h-4 w-4" />
                                    <div className="flex-1">
                                        <h3 className="text-lg font-semibold text-gray-900 mb-3">
                                            {currentQuestion.question}
                                        </h3>
                                        
                                        <textarea
                                            value={reflection[currentQuestion.id as keyof StudentReflection] || ''}
                                            onChange={(e) => handleInputChange(currentQuestion.id, e.target.value)}
                                            placeholder={currentQuestion.placeholder}
                                            className={`w-full h-32 p-3 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                                                errors[currentQuestion.id] ? 'border-red-300 bg-red-50' : 'border-gray-300'
                                            }`}
                                            disabled={isSubmitting}
                                        />
                                        
                                        <div className="flex justify-between items-center mt-2">
                                            <div className="text-sm text-gray-500">
                                                {reflection[currentQuestion.id as keyof StudentReflection]?.length || 0} / {currentQuestion.minLength} minimum characters
                                            </div>
                                            {currentQuestion.required && (
                                                <div className="text-sm text-red-500">* Required</div>
                                            )}
                                        </div>
                                        
                                        {errors[currentQuestion.id] && (
                                            <div className="text-sm text-red-600 mt-1">
                                                {errors[currentQuestion.id]}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ) : (
                        /* Review Step */
                        <Card className="p-6">
                            <div className="space-y-6">
                                <div className="flex items-center gap-3 mb-4">
                                    <Check className="h-4 w-4" />
                                    <h3 className="text-lg font-semibold text-gray-900">Review Your Responses</h3>
                                </div>
                                
                                {questions.map((question, index) => (
                                    <div key={question.id} className="border-b border-gray-200 pb-4 last:border-b-0">
                                        <div className="font-medium text-gray-900 mb-2">
                                            {question.question}
                                        </div>
                                        <div className="text-gray-700 bg-gray-50 p-3 rounded">
                                            {reflection[question.id as keyof StudentReflection] || 'No response provided'}
                                        </div>
                                    </div>
                                ))}
                                
                                <Card className="p-4 bg-green-50 border-green-200">
                                    <div className="flex items-center gap-2 text-green-700">
                                        <Check className="h-4 w-4" />
                                        <span className="font-medium">
                                            Thank you for taking the time to reflect on academic integrity.
                                        </span>
                                    </div>
                                    <div className="text-sm text-green-600 mt-2">
                                        Your thoughtful responses help demonstrate your commitment to honest academic work.
                                    </div>
                                </Card>
                            </div>
                        </Card>
                    )}
                </div>

                {/* Navigation */}
                <div className="flex justify-between">
                    <Button
                        onClick={handlePrevious}
                        variant="outline"
                        disabled={currentStep === 0 || isSubmitting}
                    >
                        Previous
                    </Button>
                    
                    <div className="flex gap-2">
                        {!isLastStep ? (
                            <Button
                                onClick={handleNext}
                                disabled={isSubmitting}
                                className="flex items-center gap-2"
                            >
                                Next
                                <span>→</span>
                            </Button>
                        ) : (
                            <Button
                                onClick={handleSubmit}
                                disabled={isSubmitting}
                                className="flex items-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <span className="animate-spin">⏳</span>
                                        Submitting...
                                    </>
                                ) : (
                                    <>
                                        <Check className="h-4 w-4" />
                                        Complete Reflection
                                    </>
                                )}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Help Text */}
                <div className="mt-6 text-xs text-gray-500 border-t pt-4">
                    <p>
                        This reflection is part of our commitment to fostering academic integrity. 
                        Your honest responses help you develop better learning practices and demonstrate your commitment to ethical academic work.
                    </p>
                </div>
            </div>
        </div>
    );
}