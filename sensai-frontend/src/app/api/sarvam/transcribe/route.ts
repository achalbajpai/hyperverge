import { NextRequest, NextResponse } from 'next/server';

// Sarvam AI API integration for multilingual speech detection
export async function POST(request: NextRequest) {
    try {
        const { audio_data, format, session_id } = await request.json();

        if (!audio_data || !session_id) {
            return NextResponse.json(
                { error: 'Missing required fields: audio_data, session_id' },
                { status: 400 }
            );
        }

        // For demo purposes, we'll simulate Sarvam API response
        // In production, you would call the actual Sarvam API
        const mockSarvamResponse = await simulateSarvamAPI(audio_data, format);

        // Log the transcription event to the backend for integrity monitoring
        if (mockSarvamResponse.text && mockSarvamResponse.text.length > 0) {
            try {
                await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || process.env.BACKEND_URL}/integrity/events?user_id=1`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: session_id,
                        event_type: 'voice_detected',
                        event_data: {
                            transcription: mockSarvamResponse.text,
                            language: mockSarvamResponse.language,
                            confidence: mockSarvamResponse.confidence,
                            duration: mockSarvamResponse.duration
                        },
                        confidence_score: 0.9
                    })
                });
            } catch (backendError) {
                console.error('Failed to log to backend:', backendError);
                // Don't fail the whole request if backend logging fails
            }
        }

        return NextResponse.json(mockSarvamResponse);

    } catch (error) {
        console.error('Sarvam API error:', error);
        return NextResponse.json(
            { error: 'Failed to process audio transcription' },
            { status: 500 }
        );
    }
}

// Simulate Sarvam API response for demo purposes
async function simulateSarvamAPI(audioData: string, format: string) {
    // In production, you would make the actual API call to Sarvam:
    /*
    const sarvamApiKey = process.env.SARVAM_API_KEY;
    const response = await fetch('https://api.sarvam.ai/speech-to-text', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${sarvamApiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            audio: audioData,
            format: format,
            language: 'auto' // Auto-detect language
        })
    });
    return await response.json();
    */

    // Simulate random detection for demo
    const scenarios = [
        {
            text: '',
            language: 'en',
            confidence: 0.0,
            duration: 0.0
        },
        {
            text: 'What is the answer to question two?',
            language: 'en',
            confidence: 0.95,
            duration: 2.3
        },
        {
            text: 'मुझे इस सवाल का जवाब बताओ',
            language: 'hi',
            confidence: 0.89,
            duration: 2.8
        },
        {
            text: 'এই প্রশ্নের উত্তর কী?',
            language: 'bn',
            confidence: 0.92,
            duration: 2.1
        },
        {
            text: 'Tell me the solution quickly',
            language: 'en',
            confidence: 0.87,
            duration: 1.9
        }
    ];

    // Simulate detection (90% chance of no speech, 10% chance of suspicious activity)
    const randomIndex = Math.random() < 0.9 ? 0 : Math.floor(Math.random() * (scenarios.length - 1)) + 1;
    
    return scenarios[randomIndex];
}

// Health check endpoint
export async function GET() {
    return NextResponse.json({
        status: 'healthy',
        service: 'sarvam-integration',
        timestamp: new Date().toISOString()
    });
}