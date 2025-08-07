import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
    try {
        const { content, question, userId } = await request.json();

        if (!content || !question) {
            return NextResponse.json(
                { error: 'Missing required fields: content, question' },
                { status: 400 }
            );
        }

        if (!process.env.OPENAI_API_KEY) {
            console.warn('OpenAI API key not configured, using mock response');
            return NextResponse.json(simulatePlagiarismCheck(content));
        }

        // Use OpenAI to analyze the content for plagiarism and suspicious patterns
        const plagiarismAnalysis = await analyzePlagiarismWithOpenAI(content, question);

        // Log the analysis to the backend for tracking
        try {
            await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL}/ai/analysis`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    content: content.substring(0, 500), // First 500 chars for logging
                    question: question,
                    analysis_result: plagiarismAnalysis,
                    timestamp: new Date().toISOString()
                })
            });
        } catch (loggingError) {
            console.error('Failed to log analysis:', loggingError);
        }

        return NextResponse.json(plagiarismAnalysis);

    } catch (error) {
        console.error('Plagiarism check error:', error);
        return NextResponse.json(
            { error: 'Failed to analyze content for plagiarism' },
            { status: 500 }
        );
    }
}

async function analyzePlagiarismWithOpenAI(content: string, question: string) {
    try {
        const prompt = `
You are an academic integrity expert. Analyze the following student answer for potential plagiarism, AI-generated content, and suspicious patterns.

Question: "${question}"

Student Answer: "${content}"

Please analyze this answer and provide:
1. Whether it appears to be plagiarized (true/false)
2. Confidence level (0-1)
3. Specific reasons for your assessment
4. Similarity to common online sources or AI patterns
5. Any suspicious patterns found
6. Severity level (low/medium/high)

Respond in JSON format:
{
  "isPlagiarized": boolean,
  "confidence": number,
  "reason": "string",
  "similarityScore": number,
  "suspiciousPatterns": ["array of patterns"],
  "severity": "low|medium|high",
  "aiGenerated": boolean,
  "sources": ["potential source indicators"],
  "recommendations": "string"
}

Focus on:
- Generic/template-like responses
- Overly sophisticated language for the context
- Copy-paste indicators (formatting, style inconsistencies)
- AI-generated patterns (too perfect structure, etc.)
- Content that seems too advanced or too basic for the question
`;

        const response = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [
                {
                    role: "system",
                    content: "You are an expert in academic integrity and plagiarism detection. Provide accurate, evidence-based analysis."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            temperature: 0.1,
            max_tokens: 1000,
        });

        const analysisText = response.choices[0]?.message?.content;
        if (!analysisText) {
            throw new Error('No analysis received from OpenAI');
        }

        // Parse the JSON response
        const analysis = JSON.parse(analysisText);
        
        // Add some metadata
        analysis.analyzedAt = new Date().toISOString();
        analysis.contentLength = content.length;
        analysis.model = 'gpt-4';

        return analysis;

    } catch (error) {
        console.error('OpenAI API error:', error);
        
        // Fallback to simulated analysis if OpenAI fails
        return simulatePlagiarismCheck(content);
    }
}

// Simulate plagiarism analysis for demo/fallback
function simulatePlagiarismCheck(content: string) {
    const suspiciousIndicators = [
        'copy', 'paste', 'wikipedia', 'stack overflow', 'chatgpt',
        'perfect grammar', 'overly complex', 'template-like'
    ];

    const contentLower = content.toLowerCase();
    const foundIndicators = suspiciousIndicators.filter(indicator => 
        contentLower.includes(indicator.toLowerCase())
    );

    // Simple heuristics for demo
    const isPlagiarized = content.length > 500 || foundIndicators.length > 0 || 
                         content.includes('©') || content.includes('source:');
    
    const isAiGenerated = content.includes('As an AI') || content.includes('I don\'t have personal') ||
                          (content.split('.').length > 10 && content.length > 800);

    return {
        isPlagiarized,
        confidence: isPlagiarized ? 0.85 : 0.15,
        reason: isPlagiarized ? 
            `Content shows potential plagiarism indicators: ${foundIndicators.join(', ')}` :
            'Content appears to be original',
        similarityScore: isPlagiarized ? 0.78 : 0.12,
        suspiciousPatterns: foundIndicators,
        severity: isPlagiarized ? 'high' : 'low',
        aiGenerated: isAiGenerated,
        sources: isPlagiarized ? ['online_content', 'ai_generated'] : [],
        recommendations: isPlagiarized ? 
            'Review content for potential integrity violations' :
            'Content appears authentic',
        analyzedAt: new Date().toISOString(),
        contentLength: content.length,
        model: 'simulated'
    };
}

// Health check
export async function GET() {
    return NextResponse.json({
        status: 'healthy',
        service: 'openai-plagiarism-check',
        hasApiKey: !!process.env.OPENAI_API_KEY,
        timestamp: new Date().toISOString()
    });
}