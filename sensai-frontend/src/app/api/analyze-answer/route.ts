import { NextRequest, NextResponse } from 'next/server';
import { ConfidenceCalculator, ConfidenceFactors, ConfidenceBreakdown } from '../confidence-calculator';

// Nebius AI configuration
const NEBIUS_AI_API_URL = 'https://api.studio.nebius.ai/v1/chat/completions';
const NEBIUS_MODEL = 'Qwen/Qwen3-235B-A22B';

interface AnalyzeAnswerRequest {
  answer: string;
  questionId: string;
  userId: string;
  questionText?: string;
  submissionContext?: {
    timeSpent: number; // in seconds
    wordCount: number;
    characterCount: number;
    submissionTime: string;
  };
}

interface CheatingAnalysis {
  thinking: string;
  overall_assessment: string;
  cheating_probability: number;
  confidence_level: number;
  red_flags: string[];
  reasoning: string;
  recommendations: string[];
  analysis_details: {
    content_quality: {
      score: number;
      notes: string;
    };
    writing_style: {
      score: number;
      notes: string;
    };
    answer_complexity: {
      score: number;
      notes: string;
    };
    time_analysis: {
      score: number;
      notes: string;
    };
  };
}

interface EnhancedAnalysisResponse extends CheatingAnalysis {
  confidence_breakdown: ConfidenceBreakdown;
  recommended_action: {
    action: string;
    priority: 'immediate' | 'high' | 'medium' | 'low' | 'verify';
    explanation: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeAnswerRequest = await request.json();
    const { answer, questionId, userId, questionText, submissionContext } = body;

    if (!answer || !questionId || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields: answer, questionId, userId' },
        { status: 400 }
      );
    }

    console.log('📝 Analyzing answer for cheating detection', {
      userId,
      questionId,
      answerLength: answer.length,
      timeSpent: submissionContext?.timeSpent,
      wordCount: submissionContext?.wordCount
    });

    // Get API key from environment
    const nebiusApiKey = process.env.NEBIUS_API_KEY;
    if (!nebiusApiKey) {
      console.error('❌ NEBIUS_API_KEY not found in environment variables');
      return NextResponse.json(
        { error: 'Nebius API key not configured' },
        { status: 500 }
      );
    }

    // Create comprehensive analysis prompt
    const analysisPrompt = createAnalysisPrompt(answer, questionText, submissionContext);

    // Call Nebius AI for analysis
    const analysisResponse = await fetch(NEBIUS_AI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${nebiusApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: NEBIUS_MODEL,
        messages: [
          {
            role: 'user',
            content: analysisPrompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.1, // Low temperature for consistent analysis
      }),
    });

    if (!analysisResponse.ok) {
      const errorText = await analysisResponse.text();
      console.error('❌ Nebius AI API Error:', {
        status: analysisResponse.status,
        statusText: analysisResponse.statusText,
        error: errorText
      });
      throw new Error(`Nebius AI API error: ${analysisResponse.status} - ${errorText}`);
    }

    const analysisResult = await analysisResponse.json();
    const aiContent = analysisResult.choices?.[0]?.message?.content;

    if (!aiContent) {
      throw new Error('No analysis content received from Nebius AI');
    }

    // Parse the AI response to extract JSON
    const parsedAnalysis = parseAIResponse(aiContent);

    console.log('✅ Analysis completed', {
      userId,
      questionId,
      cheatingProbability: parsedAnalysis.cheating_probability,
      confidenceLevel: parsedAnalysis.confidence_level,
      redFlagsCount: parsedAnalysis.red_flags?.length || 0
    });

    // If cheating probability is moderate or high, create an integrity flag
    if (parsedAnalysis.cheating_probability > 0.1 || parsedAnalysis.red_flags?.length >= 3) {
      console.log(`🔍 Creating integrity flag for Q${questionId}:`, {
        cheating_probability: parsedAnalysis.cheating_probability,
        red_flags: parsedAnalysis.red_flags?.length,
        userId
      });
      
      await createIntegrityFlag({
        userId: userId, // Keep as string, function will convert to number
        questionId,
        analysis: parsedAnalysis,
        answer,
        submissionContext
      });
    } else {
      console.log(`ℹ️ No flag created for Q${questionId}:`, {
        cheating_probability: parsedAnalysis.cheating_probability,
        red_flags: parsedAnalysis.red_flags?.length,
        threshold: 'Below 0.3 and < 3 red flags'
      });
    }

    // Calculate enhanced confidence score with detailed breakdown
    const confidenceFactors: ConfidenceFactors = {
      contentQuality: parsedAnalysis.analysis_details?.content_quality?.score || 0.5,
      writingStyle: parsedAnalysis.analysis_details?.writing_style?.score || 0.5,
      answerComplexity: parsedAnalysis.analysis_details?.answer_complexity?.score || 0.5,
      timeAnalysis: parsedAnalysis.analysis_details?.time_analysis?.score || 0.5,
      patternDetection: parsedAnalysis.cheating_probability // Use cheating probability as pattern detection confidence
    };

    const confidenceBreakdown = ConfidenceCalculator.calculateConfidence(
      confidenceFactors,
      parsedAnalysis.red_flags?.length || 0,
      parsedAnalysis.cheating_probability
    );

    const recommendedAction = ConfidenceCalculator.getRecommendedAction(
      confidenceBreakdown.confidenceLevel
    );

    // Create enhanced analysis response
    const enhancedAnalysis: EnhancedAnalysisResponse = {
      ...parsedAnalysis,
      confidence_level: confidenceBreakdown.finalConfidence, // Use calculated confidence
      confidence_breakdown: confidenceBreakdown,
      recommended_action: recommendedAction
    };

    return NextResponse.json({
      success: true,
      analysis: enhancedAnalysis,
      metadata: {
        questionId,
        userId,
        timestamp: new Date().toISOString(),
        answerLength: answer.length,
        wordCount: submissionContext?.wordCount || 0,
        confidence_explanation: confidenceBreakdown.explanation,
        confidence_level_text: confidenceBreakdown.confidenceLevel.replace('_', ' ').toUpperCase()
      }
    });

  } catch (error) {
    console.error('❌ Answer analysis error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to analyze answer',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

function createAnalysisPrompt(answer: string, questionText?: string, submissionContext?: any): string {
  const contextInfo = submissionContext ? `
Submission Context:
- Time spent: ${submissionContext.timeSpent} seconds
- Word count: ${submissionContext.wordCount}
- Character count: ${submissionContext.characterCount}
- Submission time: ${submissionContext.submissionTime}
` : '';

  const questionInfo = questionText ? `
Question: ${questionText}
` : '';

  return `You are an expert academic integrity analyzer. Analyze the following student answer for potential cheating indicators.

${questionInfo}
Student Answer:
"${answer}"

${contextInfo}

Analyze this answer for potential cheating and academic dishonesty. Look for:

1. **AI-Generated Content Indicators:**
   - Overly polished or formal language for the academic level
   - Perfect grammar and structure that seems unnatural
   - Generic or template-like responses
   - Lack of personal voice or authentic mistakes

2. **Copy-Paste Indicators:**
   - Inconsistent formatting or style
   - Sudden changes in writing quality
   - Technical terms without context
   - Information that seems out of scope

3. **Time vs Quality Analysis:**
   - Answer complexity vs time spent
   - Unrealistic completion speed
   - Disproportionate quality to time invested

4. **Content Analysis:**
   - Relevance to the question
   - Depth and understanding demonstrated
   - Use of advanced concepts without foundation
   - Plagiarism indicators

5. **Writing Pattern Analysis:**
   - Consistency in style and voice
   - Natural flow and transitions
   - Appropriate vocabulary level
   - Personal insights vs generic information

Provide your analysis in the following JSON format:

<thinking>
[Your detailed thinking process about the analysis - examine each indicator carefully]
</thinking>

{
  "overall_assessment": "Brief summary of your findings",
  "cheating_probability": 0.0-1.0, // 0 = no cheating indicators, 1 = strong cheating indicators
  "confidence_level": 0.0-1.0, // How confident you are in your assessment
  "red_flags": ["list", "of", "specific", "concerning", "indicators"],
  "reasoning": "Detailed explanation of why you reached this conclusion",
  "recommendations": ["suggested", "actions", "for", "instructors"],
  "analysis_details": {
    "content_quality": {
      "score": 0.0-1.0, // 0 = poor quality, 1 = excellent quality
      "notes": "Assessment of content quality and authenticity"
    },
    "writing_style": {
      "score": 0.0-1.0, // 0 = inconsistent/suspicious, 1 = natural/consistent
      "notes": "Assessment of writing style consistency"
    },
    "answer_complexity": {
      "score": 0.0-1.0, // 0 = too simple/complex for context, 1 = appropriate complexity
      "notes": "Assessment of answer complexity vs expected level"
    },
    "time_analysis": {
      "score": 0.0-1.0, // 0 = suspicious timing, 1 = reasonable timing
      "notes": "Assessment of time spent vs answer quality"
    }
  }
}

Be thorough but fair in your analysis. Consider that students have different writing abilities and knowledge levels.`;
}

function parseAIResponse(content: string): CheatingAnalysis {
  try {
    // Extract JSON from the response - it might be wrapped in markdown or have thinking tags
    let jsonStr = content;
    
    // Remove thinking tags if present
    jsonStr = jsonStr.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
    
    // Extract JSON if wrapped in code blocks
    const jsonMatch = jsonStr.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }
    
    // Try to find JSON object in the text
    const startIndex = jsonStr.indexOf('{');
    const lastIndex = jsonStr.lastIndexOf('}');
    
    if (startIndex !== -1 && lastIndex !== -1 && lastIndex > startIndex) {
      jsonStr = jsonStr.substring(startIndex, lastIndex + 1);
    }
    
    const parsed = JSON.parse(jsonStr);
    
    // Validate required fields and provide defaults
    return {
      thinking: content.match(/<thinking>([\s\S]*?)<\/thinking>/)?.[1]?.trim() || '',
      overall_assessment: parsed.overall_assessment || 'Analysis completed',
      cheating_probability: Math.max(0, Math.min(1, parsed.cheating_probability || 0)),
      confidence_level: Math.max(0, Math.min(1, parsed.confidence_level || 0.5)),
      red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags : [],
      reasoning: parsed.reasoning || 'No specific reasoning provided',
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      analysis_details: {
        content_quality: {
          score: Math.max(0, Math.min(1, parsed.analysis_details?.content_quality?.score || 0.5)),
          notes: parsed.analysis_details?.content_quality?.notes || 'No notes available'
        },
        writing_style: {
          score: Math.max(0, Math.min(1, parsed.analysis_details?.writing_style?.score || 0.5)),
          notes: parsed.analysis_details?.writing_style?.notes || 'No notes available'
        },
        answer_complexity: {
          score: Math.max(0, Math.min(1, parsed.analysis_details?.answer_complexity?.score || 0.5)),
          notes: parsed.analysis_details?.answer_complexity?.notes || 'No notes available'
        },
        time_analysis: {
          score: Math.max(0, Math.min(1, parsed.analysis_details?.time_analysis?.score || 0.5)),
          notes: parsed.analysis_details?.time_analysis?.notes || 'No notes available'
        }
      }
    };
  } catch (error) {
    console.error('❌ Error parsing AI response:', error);
    console.error('Raw content:', content);
    
    // Return a default analysis if parsing fails
    return {
      thinking: 'Failed to parse AI response',
      overall_assessment: 'Analysis parsing failed',
      cheating_probability: 0.1, // Low probability when we can't analyze
      confidence_level: 0.1, // Low confidence due to parsing failure
      red_flags: ['Analysis parsing error'],
      reasoning: 'Failed to parse the AI analysis response properly',
      recommendations: ['Manual review recommended due to analysis error'],
      analysis_details: {
        content_quality: { score: 0.5, notes: 'Unable to analyze due to parsing error' },
        writing_style: { score: 0.5, notes: 'Unable to analyze due to parsing error' },
        answer_complexity: { score: 0.5, notes: 'Unable to analyze due to parsing error' },
        time_analysis: { score: 0.5, notes: 'Unable to analyze due to parsing error' }
      }
    };
  }
}

async function createIntegrityFlag(data: {
  userId: string;
  questionId: string;
  analysis: CheatingAnalysis;
  answer: string;
  submissionContext?: any;
}) {
  try {
    // Convert userId to integer if it's a string
    const numericUserId = parseInt(data.userId);
    if (isNaN(numericUserId)) {
      console.error('❌ Invalid user ID - must be numeric:', data.userId);
      return;
    }

    // Convert questionId to integer if it's numeric, otherwise leave as null
    const numericQuestionId = /^\d+$/.test(data.questionId) ? parseInt(data.questionId) : null;

    const flagData = {
      flag_type: 'behavioral_anomaly', // Use valid enum value
      severity: data.analysis.cheating_probability > 0.8 ? 'high' : 'medium',
      confidence_score: data.analysis.confidence_level,
      question_id: numericQuestionId,
      session_id: `answer-analysis-${Date.now()}`,
      ai_analysis: `Automated answer analysis detected potential cheating. 

Overall Assessment: ${data.analysis.overall_assessment}

Cheating Probability: ${Math.round(data.analysis.cheating_probability * 100)}%

Red Flags Detected:
${data.analysis.red_flags.map(flag => `• ${flag}`).join('\n')}

Reasoning: ${data.analysis.reasoning}

Content Quality Score: ${Math.round(data.analysis.analysis_details.content_quality.score * 100)}%
Writing Style Score: ${Math.round(data.analysis.analysis_details.writing_style.score * 100)}%
Complexity Score: ${Math.round(data.analysis.analysis_details.answer_complexity.score * 100)}%
Time Analysis Score: ${Math.round(data.analysis.analysis_details.time_analysis.score * 100)}%

Recommendations:
${data.analysis.recommendations.map(rec => `• ${rec}`).join('\n')}`,
      evidence_data: {
        question_id: data.questionId,
        answer_excerpt: data.answer.substring(0, 500),
        full_analysis: data.analysis,
        submission_context: data.submissionContext,
        analysis_timestamp: new Date().toISOString(),
        word_count: data.submissionContext?.wordCount || 0,
        time_spent_seconds: data.submissionContext?.timeSpent || 0,
        cheating_indicators: data.analysis.red_flags
      }
    };

    console.log('🚨 Creating integrity flag:', {
      userId: numericUserId,
      questionId: data.questionId,
      numericQuestionId,
      flagType: flagData.flag_type,
      severity: flagData.severity,
      cheatingProbability: data.analysis.cheating_probability
    });

    const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/flags?user_id=${numericUserId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(flagData),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to create integrity flag:', {
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        requestData: flagData
      });
      return;
    }

    const createdFlag = await response.json();
    console.log('✅ Integrity flag created successfully:', {
      flagId: createdFlag.id,
      userId: numericUserId,
      severity: flagData.severity,
      confidence: flagData.confidence_score
    });

    return createdFlag;
  } catch (error) {
    console.error('❌ Error creating integrity flag:', error);
    // Don't throw here - we don't want to fail the analysis if flag creation fails
  }
}
