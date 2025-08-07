import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { audio_data, format, session_id, test_duration_minutes } = await request.json();

        if (!audio_data) {
            return NextResponse.json({ error: 'No audio data provided' }, { status: 400 });
        }

        // Convert base64 back to binary for OpenAI processing
        const audioBuffer = Buffer.from(audio_data, 'base64');
        
        // Create a FormData object for OpenAI Whisper API
        const formData = new FormData();
        const audioBlob = new Blob([audioBuffer], { type: format || 'audio/webm' });
        formData.append('file', audioBlob, 'test_audio.webm');
        formData.append('model', 'whisper-1');
        formData.append('language', 'en'); // Can be auto-detected
        formData.append('response_format', 'verbose_json');

        // Step 1: Transcribe audio with OpenAI Whisper
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
            console.warn('OpenAI API key not found, using fallback simulation');
            return generateFallbackResponse(session_id, test_duration_minutes);
        }

        const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openaiKey}`,
            },
            body: formData,
        });

        if (!transcriptionResponse.ok) {
            console.warn('OpenAI transcription failed, using fallback');
            return generateFallbackResponse(session_id, test_duration_minutes);
        }

        const transcriptionResult = await transcriptionResponse.json();
        const fullTranscription = transcriptionResult.text || '';

        if (!fullTranscription || fullTranscription.trim().length === 0) {
            return NextResponse.json({
                transcription: '',
                cheating_detected: false,
                cheating_summary: 'No speech detected',
                suspicious_phrases: [],
                speech_duration: 0,
                test_duration_minutes,
                confidence: 0.95,
                detailed_analysis: 'No significant speech activity detected during test',
                confidence_scores: { transcription: 0.95, analysis: 0.95 }
            });
        }

        // Step 2: Analyze transcription for cheating indicators with GPT-4
        const analysisPrompt = `
You are an AI academic integrity analyzer. Analyze this audio transcription from a student taking an online test.

Test Audio Transcription: "${fullTranscription}"
Test Duration: ${test_duration_minutes} minutes
Session ID: ${session_id}

Analyze the transcription for signs of academic dishonesty and provide:

1. cheating_detected (boolean): True if clear evidence of cheating
2. cheating_summary (string): Brief summary if cheating detected
3. suspicious_phrases (array): List of concerning phrases/words
4. detailed_analysis (string): Detailed explanation of findings
5. confidence (float 0-1): Confidence in analysis

Look for indicators like:
- Asking for help ("what's the answer to...", "help me with...", "tell me...")
- Receiving assistance ("the answer is...", "it should be...", "try this...")
- Reading questions aloud to others
- Discussing test content
- Phone calls or conversations during test
- Multiple voices
- Background conversations about academic topics
- References to external sources (Google, ChatGPT, etc.)

Languages to consider: English, Hindi, Bengali, Telugu, Tamil, and other Indian languages.

Respond with ONLY a JSON object with the following structure:
{
  "cheating_detected": boolean,
  "cheating_summary": "string",
  "suspicious_phrases": ["phrase1", "phrase2"],
  "detailed_analysis": "string",
  "confidence": number
}
`;

        const analysisResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openaiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an academic integrity analysis expert. Respond only with valid JSON.'
                    },
                    {
                        role: 'user',
                        content: analysisPrompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 1000
            }),
        });

        if (!analysisResponse.ok) {
            console.warn('OpenAI analysis failed, providing basic transcription');
            return generateBasicTranscriptionResponse(fullTranscription, test_duration_minutes);
        }

        const analysisResult = await analysisResponse.json();
        let analysis;
        
        try {
            analysis = JSON.parse(analysisResult.choices[0].message.content);
        } catch (parseError) {
            console.warn('Failed to parse OpenAI analysis, using basic response');
            return generateBasicTranscriptionResponse(fullTranscription, test_duration_minutes);
        }

        // Combine transcription and analysis results
        const finalResponse = {
            transcription: fullTranscription,
            cheating_detected: analysis.cheating_detected || false,
            cheating_summary: analysis.cheating_summary || '',
            suspicious_phrases: analysis.suspicious_phrases || [],
            speech_duration: transcriptionResult.duration || 0,
            test_duration_minutes,
            confidence: analysis.confidence || 0.85,
            detailed_analysis: analysis.detailed_analysis || 'Analysis completed',
            confidence_scores: {
                transcription: 0.95,
                analysis: analysis.confidence || 0.85
            }
        };

        return NextResponse.json(finalResponse);

    } catch (error) {
        console.error('Error in audio analysis:', error);
        return NextResponse.json(
            { error: 'Failed to analyze audio' },
            { status: 500 }
        );
    }
}

// Fallback response when OpenAI is unavailable
function generateFallbackResponse(session_id: string, test_duration_minutes: number) {
    return NextResponse.json({
        transcription: '[Audio analysis unavailable - OpenAI API not accessible]',
        cheating_detected: false,
        cheating_summary: 'Unable to analyze audio content',
        suspicious_phrases: [],
        speech_duration: 0,
        test_duration_minutes,
        confidence: 0.5,
        detailed_analysis: 'Audio was recorded but could not be analyzed due to API limitations. Manual review recommended.',
        confidence_scores: { transcription: 0.5, analysis: 0.5 }
    });
}

// Basic response with transcription but no analysis
function generateBasicTranscriptionResponse(transcription: string, test_duration_minutes: number) {
    return NextResponse.json({
        transcription,
        cheating_detected: false,
        cheating_summary: 'Analysis incomplete',
        suspicious_phrases: [],
        speech_duration: transcription.length / 10, // Rough estimate
        test_duration_minutes,
        confidence: 0.7,
        detailed_analysis: 'Transcription completed but detailed analysis failed. Manual review of transcription recommended.',
        confidence_scores: { transcription: 0.95, analysis: 0.3 }
    });
}