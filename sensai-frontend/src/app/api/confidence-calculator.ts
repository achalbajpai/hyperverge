// Confidence Scoring Matrix Implementation
// This module provides transparent, explainable confidence scoring for integrity analysis

export interface ConfidenceFactors {
  contentQuality: number;
  writingStyle: number;
  answerComplexity: number;
  timeAnalysis: number;
  patternDetection: number;
}

export interface ConfidenceBreakdown {
  factors: ConfidenceFactors;
  weights: {
    contentQuality: number;
    writingStyle: number;
    answerComplexity: number;
    timeAnalysis: number;
    patternDetection: number;
  };
  rawScore: number;
  redFlagPenalty: number;
  finalConfidence: number;
  explanation: string;
  confidenceLevel: 'very_high' | 'high' | 'moderate_high' | 'moderate' | 'low_moderate' | 'low';
}

export class ConfidenceCalculator {
  // Standard weights for confidence factors
  private static readonly WEIGHTS = {
    contentQuality: 0.25,
    writingStyle: 0.25,
    answerComplexity: 0.20,
    timeAnalysis: 0.15,
    patternDetection: 0.15
  };

  // Red flag penalty mapping
  private static readonly RED_FLAG_PENALTIES: Record<number, number> = {
    0: 0.0,
    1: -0.05,
    2: -0.1,
    3: -0.15,
    4: -0.2,
    5: -0.25,
    6: -0.3
  };

  /**
   * Calculate comprehensive confidence score with full breakdown
   */
  static calculateConfidence(
    factors: ConfidenceFactors,
    redFlagCount: number,
    cheatingProbability: number
  ): ConfidenceBreakdown {
    // Calculate weighted raw score
    const rawScore = 
      factors.contentQuality * this.WEIGHTS.contentQuality +
      factors.writingStyle * this.WEIGHTS.writingStyle +
      factors.answerComplexity * this.WEIGHTS.answerComplexity +
      factors.timeAnalysis * this.WEIGHTS.timeAnalysis +
      factors.patternDetection * this.WEIGHTS.patternDetection;

    // Apply red flag penalty
    const redFlagPenalty = this.RED_FLAG_PENALTIES[Math.min(redFlagCount, 6)] || -0.3;
    
    // Calculate final confidence (clamped to valid range)
    let finalConfidence = Math.max(0.0, Math.min(1.0, rawScore + redFlagPenalty));
    
    // Adjust confidence based on cheating probability
    // High cheating probability should correlate with high confidence in detection
    if (cheatingProbability > 0.7) {
      finalConfidence = Math.max(finalConfidence, 0.7); // Boost confidence for clear cases
    } else if (cheatingProbability < 0.3) {
      finalConfidence = Math.min(finalConfidence, 0.6); // Reduce confidence for unclear cases
    }

    // Generate explanation
    const explanation = this.generateExplanation(factors, redFlagCount, rawScore, finalConfidence);
    
    // Determine confidence level
    const confidenceLevel = this.getConfidenceLevel(finalConfidence);

    return {
      factors,
      weights: this.WEIGHTS,
      rawScore,
      redFlagPenalty,
      finalConfidence,
      explanation,
      confidenceLevel
    };
  }

  /**
   * Generate human-readable explanation of confidence score
   */
  private static generateExplanation(
    factors: ConfidenceFactors,
    redFlagCount: number,
    rawScore: number,
    finalConfidence: number
  ): string {
    const explanations: string[] = [];

    // Factor analysis
    if (factors.contentQuality > 0.8) {
      explanations.push("High content quality increases confidence");
    } else if (factors.contentQuality < 0.4) {
      explanations.push("Low content quality reduces confidence");
    }

    if (factors.writingStyle > 0.8) {
      explanations.push("Natural writing style increases confidence");
    } else if (factors.writingStyle < 0.4) {
      explanations.push("Artificial writing patterns reduce confidence");
    }

    if (factors.answerComplexity > 0.8) {
      explanations.push("Appropriate answer complexity increases confidence");
    } else if (factors.answerComplexity < 0.4) {
      explanations.push("Inappropriate complexity level reduces confidence");
    }

    if (factors.timeAnalysis > 0.8) {
      explanations.push("Time spent correlates well with answer quality");
    } else if (factors.timeAnalysis < 0.4) {
      explanations.push("Time-quality mismatch reduces confidence");
    }

    if (factors.patternDetection > 0.8) {
      explanations.push("Clear suspicious patterns detected");
    } else if (factors.patternDetection < 0.4) {
      explanations.push("No clear suspicious patterns found");
    }

    // Red flag impact
    if (redFlagCount === 0) {
      explanations.push("No red flags detected");
    } else if (redFlagCount <= 2) {
      explanations.push(`${redFlagCount} red flag(s) slightly reduce confidence`);
    } else {
      explanations.push(`${redFlagCount} red flags significantly reduce confidence`);
    }

    // Overall assessment
    if (finalConfidence > 0.8) {
      explanations.push("High confidence in assessment accuracy");
    } else if (finalConfidence < 0.5) {
      explanations.push("Low confidence - manual review recommended");
    }

    return explanations.join(". ");
  }

  /**
   * Categorize confidence level for easy interpretation
   */
  private static getConfidenceLevel(confidence: number): ConfidenceBreakdown['confidenceLevel'] {
    if (confidence >= 0.9) return 'very_high';
    if (confidence >= 0.8) return 'high';
    if (confidence >= 0.7) return 'moderate_high';
    if (confidence >= 0.6) return 'moderate';
    if (confidence >= 0.5) return 'low_moderate';
    return 'low';
  }

  /**
   * Get recommended action based on confidence level
   */
  static getRecommendedAction(confidenceLevel: ConfidenceBreakdown['confidenceLevel']): {
    action: string;
    priority: 'immediate' | 'high' | 'medium' | 'low' | 'verify';
    explanation: string;
  } {
    const recommendations = {
      'very_high': {
        action: 'Immediate Review Required',
        priority: 'immediate' as const,
        explanation: 'Very strong evidence of integrity violation detected'
      },
      'high': {
        action: 'High Priority Review',
        priority: 'high' as const,
        explanation: 'Strong evidence suggests likely integrity violation'
      },
      'moderate_high': {
        action: 'Medium Priority Review',
        priority: 'medium' as const,
        explanation: 'Probable integrity violation identified'
      },
      'moderate': {
        action: 'Review When Time Permits',
        priority: 'low' as const,
        explanation: 'Possible integrity violation - human judgment needed'
      },
      'low_moderate': {
        action: 'Low Priority Review',
        priority: 'low' as const,
        explanation: 'Uncertain assessment - likely false positive'
      },
      'low': {
        action: 'Verify System Performance',
        priority: 'verify' as const,
        explanation: 'Very low confidence - check system accuracy'
      }
    };

    return recommendations[confidenceLevel];
  }

  /**
   * Calculate audio analysis confidence using multi-layered approach
   */
  static calculateAudioConfidence(
    speakerCount: number,
    speakerSwitches: number,
    primarySpeakerRatio: number,
    transcriptionQuality: number,
    cheatingDetectionScore: number
  ): {
    speakerConfidence: number;
    overallConfidence: number;
    explanation: string;
  } {
    // Speaker diarization confidence
    let speakerConfidence = 1.0;

    // Reduce confidence for complex speaker scenarios
    if (speakerCount > 2) {
      speakerConfidence -= 0.1 * (speakerCount - 2);
    }

    // Reduce confidence for excessive switches
    if (speakerSwitches > 20) {
      speakerConfidence -= 0.2;
    }

    // Reduce confidence for unclear primary speaker
    if (speakerCount > 1 && primarySpeakerRatio < 0.4) {
      speakerConfidence -= 0.3;
    }

    speakerConfidence = Math.max(0.0, Math.min(1.0, speakerConfidence));

    // Overall confidence (conservative approach - use minimum)
    const overallConfidence = Math.min(
      speakerConfidence,
      transcriptionQuality,
      cheatingDetectionScore
    );

    // Generate explanation
    const explanation = this.generateAudioExplanation(
      speakerCount,
      speakerSwitches,
      primarySpeakerRatio,
      speakerConfidence,
      overallConfidence
    );

    return {
      speakerConfidence,
      overallConfidence,
      explanation
    };
  }

  private static generateAudioExplanation(
    speakerCount: number,
    speakerSwitches: number,
    primarySpeakerRatio: number,
    speakerConfidence: number,
    overallConfidence: number
  ): string {
    const explanations: string[] = [];

    if (speakerCount === 1) {
      explanations.push("Single speaker detected - high confidence");
    } else if (speakerCount === 2) {
      if (primarySpeakerRatio > 0.7) {
        explanations.push("Clear primary speaker identified");
      } else {
        explanations.push("Unclear speaker dominance reduces confidence");
      }
    } else {
      explanations.push(`${speakerCount} speakers detected - reduces confidence`);
    }

    if (speakerSwitches > 20) {
      explanations.push("Excessive speaker switching detected");
    } else if (speakerSwitches > 10) {
      explanations.push("Moderate speaker switching observed");
    }

    if (overallConfidence > 0.8) {
      explanations.push("High confidence in audio analysis");
    } else if (overallConfidence < 0.5) {
      explanations.push("Low confidence - manual review needed");
    }

    return explanations.join(". ");
  }
}
