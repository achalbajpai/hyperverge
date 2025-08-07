import React from 'react';
import { ConfidenceBreakdown } from '../app/api/confidence-calculator';

interface ConfidenceDashboardProps {
  confidenceBreakdown: ConfidenceBreakdown;
  className?: string;
}

export const ConfidenceDashboard: React.FC<ConfidenceDashboardProps> = ({
  confidenceBreakdown,
  className = ""
}) => {
  const { factors, weights, rawScore, redFlagPenalty, finalConfidence, explanation, confidenceLevel } = confidenceBreakdown;

  const getConfidenceLevelColor = (level: string) => {
    switch (level) {
      case 'very_high': return 'text-red-600 bg-red-50';
      case 'high': return 'text-orange-600 bg-orange-50';
      case 'moderate_high': return 'text-yellow-600 bg-yellow-50';
      case 'moderate': return 'text-blue-600 bg-blue-50';
      case 'low_moderate': return 'text-gray-600 bg-gray-50';
      case 'low': return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 bg-green-50';
    if (score >= 0.6) return 'text-yellow-600 bg-yellow-50';
    if (score >= 0.4) return 'text-orange-600 bg-orange-50';
    return 'text-red-600 bg-red-50';
  };

  const formatPercentage = (value: number) => Math.round(value * 100);

  return (
    <div className={`bg-white rounded-lg shadow-lg p-6 ${className}`}>
      <div className="mb-6">
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Confidence Analysis Dashboard
        </h3>
        <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getConfidenceLevelColor(confidenceLevel)}`}>
          {confidenceLevel.replace('_', ' ').toUpperCase()} CONFIDENCE
        </div>
      </div>

      {/* Overall Score */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-1">Final Confidence</h4>
          <div className="text-2xl font-bold text-gray-900">
            {formatPercentage(finalConfidence)}%
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-1">Raw Score</h4>
          <div className="text-2xl font-bold text-gray-600">
            {formatPercentage(rawScore)}%
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <h4 className="text-sm font-medium text-gray-700 mb-1">Red Flag Penalty</h4>
          <div className="text-2xl font-bold text-red-600">
            {formatPercentage(redFlagPenalty)}%
          </div>
        </div>
      </div>

      {/* Factor Breakdown */}
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Confidence Factor Breakdown</h4>
        <div className="space-y-4">
          {[
            { key: 'contentQuality', label: 'Content Quality', score: factors.contentQuality, weight: weights.contentQuality },
            { key: 'writingStyle', label: 'Writing Style Consistency', score: factors.writingStyle, weight: weights.writingStyle },
            { key: 'answerComplexity', label: 'Answer Complexity', score: factors.answerComplexity, weight: weights.answerComplexity },
            { key: 'timeAnalysis', label: 'Time Analysis', score: factors.timeAnalysis, weight: weights.timeAnalysis },
            { key: 'patternDetection', label: 'Pattern Detection', score: factors.patternDetection, weight: weights.patternDetection }
          ].map(({ key, label, score, weight }) => (
            <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                  <span className="text-xs text-gray-500">Weight: {formatPercentage(weight)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-300 ${
                      score >= 0.8 ? 'bg-green-500' :
                      score >= 0.6 ? 'bg-yellow-500' :
                      score >= 0.4 ? 'bg-orange-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.max(score * 100, 5)}%` }}
                  />
                </div>
              </div>
              <div className={`ml-4 px-2 py-1 rounded text-sm font-medium ${getScoreColor(score)}`}>
                {formatPercentage(score)}%
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Explanation */}
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-2">Detailed Explanation</h4>
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
          <p className="text-blue-800 text-sm leading-relaxed">
            {explanation}
          </p>
        </div>
      </div>

      {/* Calculation Formula */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-2">Calculation Method</h4>
        <div className="text-xs text-gray-600 font-mono bg-white p-2 rounded border">
          <div>Raw Score = (Content×{formatPercentage(weights.contentQuality)}%) + (Style×{formatPercentage(weights.writingStyle)}%) + (Complexity×{formatPercentage(weights.answerComplexity)}%) + (Time×{formatPercentage(weights.timeAnalysis)}%) + (Pattern×{formatPercentage(weights.patternDetection)}%)</div>
          <div className="mt-1">Final = max(0, min(1, Raw Score + Red Flag Penalty))</div>
        </div>
      </div>
    </div>
  );
};

interface ConfidenceComparisonProps {
  answerConfidence?: ConfidenceBreakdown;
  audioConfidence?: {
    speakerConfidence: number;
    overallConfidence: number;
    explanation: string;
  };
  className?: string;
}

export const ConfidenceComparison: React.FC<ConfidenceComparisonProps> = ({
  answerConfidence,
  audioConfidence,
  className = ""
}) => {
  return (
    <div className={`bg-white rounded-lg shadow-lg p-6 ${className}`}>
      <h3 className="text-xl font-semibold text-gray-900 mb-6">
        Multi-System Confidence Comparison
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Answer Analysis Confidence */}
        {answerConfidence && (
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="text-lg font-medium text-gray-800 mb-3">Answer Analysis</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Overall Confidence:</span>
                <span className="text-lg font-semibold text-blue-600">
                  {Math.round(answerConfidence.finalConfidence * 100)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Confidence Level:</span>
                <span className="text-sm font-medium text-gray-800">
                  {answerConfidence.confidenceLevel.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                Based on content quality, writing style, complexity, timing, and pattern detection
              </div>
            </div>
          </div>
        )}

        {/* Audio Analysis Confidence */}
        {audioConfidence && (
          <div className="border border-gray-200 rounded-lg p-4">
            <h4 className="text-lg font-medium text-gray-800 mb-3">Audio Analysis</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Overall Confidence:</span>
                <span className="text-lg font-semibold text-green-600">
                  {Math.round(audioConfidence.overallConfidence * 100)}%
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Speaker Confidence:</span>
                <span className="text-sm font-medium text-gray-800">
                  {Math.round(audioConfidence.speakerConfidence * 100)}%
                </span>
              </div>
              <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                {audioConfidence.explanation}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Combined Assessment */}
      {answerConfidence && audioConfidence && (
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="text-lg font-medium text-yellow-800 mb-2">Combined Assessment</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-yellow-700">Average Confidence:</span>
              <span className="ml-2 font-semibold">
                {Math.round(((answerConfidence.finalConfidence + audioConfidence.overallConfidence) / 2) * 100)}%
              </span>
            </div>
            <div>
              <span className="text-yellow-700">Conservative Estimate:</span>
              <span className="ml-2 font-semibold">
                {Math.round(Math.min(answerConfidence.finalConfidence, audioConfidence.overallConfidence) * 100)}%
              </span>
            </div>
          </div>
          <p className="text-xs text-yellow-600 mt-2">
            Conservative estimate uses the lower of the two confidence scores to minimize false positives.
          </p>
        </div>
      )}
    </div>
  );
};
