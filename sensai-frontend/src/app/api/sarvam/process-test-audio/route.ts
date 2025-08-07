import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const { audio_data, audio_format, session_id, test_duration_minutes, assignment_id } = await request.json();

        if (!audio_data) {
            return NextResponse.json({ error: 'No audio data provided' }, { status: 400 });
        }

        console.log(`🎵 Processing ${Math.round(Buffer.from(audio_data, 'base64').length / 1024)} KB audio file...`);

        // Step 1: Send to Sarvam AI for multilingual transcription
        const sarvamResult = await transcribeWithSarvam(audio_data, audio_format);
        
        // Step 2: Send English transcription to OpenAI for cheating analysis
        const openaiResult = await analyzeWithOpenAI(sarvamResult.transcription_english, {
            session_id,
            test_duration_minutes,
            assignment_id,
            original_language: sarvamResult.detected_language
        });

        // Step 3: Combine results
        const finalResult = {
            // Sarvam Results
            transcription_original: sarvamResult.transcription_original,
            transcription_english: sarvamResult.transcription_english,
            detected_language: sarvamResult.detected_language,
            sarvam_confidence: sarvamResult.confidence,
            
            // OpenAI Results
            cheating_detected: openaiResult.cheating_detected,
            cheating_summary: openaiResult.cheating_summary,
            suspicious_phrases: openaiResult.suspicious_phrases,
            openai_analysis: openaiResult.detailed_analysis,
            openai_confidence: openaiResult.confidence,
            
            // Combined Metadata
            audio_duration_seconds: sarvamResult.duration || 0,
            test_duration_minutes,
            overall_confidence: Math.min(sarvamResult.confidence || 0.7, openaiResult.confidence || 0.7),
            processing_timestamp: new Date().toISOString(),
            audio_quality: sarvamResult.audio_quality || 'good'
        };

        console.log('✅ Audio processing pipeline completed successfully');
        return NextResponse.json(finalResult);

    } catch (error) {
        console.error('❌ Error in audio processing pipeline:', error);
        return NextResponse.json(
            { error: 'Failed to process audio', details: error.message },
            { status: 500 }
        );
    }
}

// Step 1: Transcribe audio using Sarvam AI
async function transcribeWithSarvam(audioBase64: string, audioFormat: string) {
    const sarvamApiKey = process.env.SARVAM_API_KEY;
    
    if (!sarvamApiKey) {
        console.warn('⚠️ Sarvam API key not found, using fallback');
        return generateSarvamFallback();
    }

    try {
        console.log('🔄 Sending audio to Sarvam AI for transcription...');
        
        // Convert base64 to blob for Sarvam API
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        
        // Create FormData for Sarvam API
        const formData = new FormData();
        const audioBlob = new Blob([audioBuffer], { type: audioFormat || 'audio/webm' });
        formData.append('file', audioBlob, 'test_audio.webm');
        formData.append('model', 'saarika:v1'); // Using Saarika model as specified
        
        // Sarvam API call for transcription
        const response = await fetch('https://api.sarvam.ai/speech-to-text', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${sarvamApiKey}`,
            },
            body: formData,
        });

        if (!response.ok) {
            throw new Error(`Sarvam API error: ${response.status} ${response.statusText}`);
        }

        const result = await response.json();
        console.log('✅ Sarvam AI transcription completed');

        // Sarvam returns both original language transcript and English translation
        return {
            transcription_original: result.transcript || '',
            transcription_english: result.transcript_english || result.transcript || '',
            detected_language: result.language_code || 'unknown',
            confidence: result.confidence || 0.8,
            duration: result.duration || 0,
            audio_quality: 'good'
        };

    } catch (error) {
        console.error('❌ Sarvam API failed:', error);
        return generateSarvamFallback();
    }
}

// Step 2: Analyze English transcription with OpenAI
async function analyzeWithOpenAI(englishTranscription: string, metadata: any) {
    const openaiKey = process.env.OPENAI_API_KEY;
    
    if (!openaiKey) {
        console.warn('⚠️ OpenAI API key not found, using fallback');
        return generateOpenAIFallback(englishTranscription);
    }

    if (!englishTranscription || englishTranscription.trim().length < 10) {
        return {
            cheating_detected: false,
            cheating_summary: 'No significant speech detected',
            suspicious_phrases: [],
            detailed_analysis: 'Minimal or no speech content found in audio',
            confidence: 0.95
        };
    }

    try {
        console.log('🔄 Sending transcription to OpenAI for cheating analysis...');

        const analysisPrompt = `
You are an AI academic integrity expert analyzing audio from a student test session.

TRANSCRIPTION: "${englishTranscription}"
TEST DURATION: ${metadata.test_duration_minutes} minutes
ORIGINAL LANGUAGE: ${metadata.original_language}
SESSION ID: ${metadata.session_id}

Analyze this transcription for signs of academic dishonesty. Look for:

🚨 CLEAR CHEATING INDICATORS:
- Asking for help ("what's the answer", "help me with", "tell me the solution")
- Receiving answers ("the answer is", "it should be", "try this", "write this")
- Reading questions aloud to get help
- Phone calls during test
- Conversations about test content
- References to external sources (Google, ChatGPT, websites)

⚠️ SUSPICIOUS PATTERNS:
- Multiple voices discussing academic topics
- Background conversations about homework/tests
- Coaching or guidance being provided
- Discussion of test strategies mid-test

Consider context: Brief self-talk, reading questions to oneself, or expressing frustration is normal.

Respond with ONLY a JSON object:
{
  "cheating_detected": boolean,
  "cheating_summary": "Brief explanation if cheating detected",
  "suspicious_phrases": ["phrase1", "phrase2"],
  "detailed_analysis": "Detailed explanation of findings",
  "confidence": number (0-1)
}`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
                        content: 'You are an academic integrity expert. Respond only with valid JSON.'
                    },
                    {
                        role: 'user',
                        content: analysisPrompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 800
            }),
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const result = await response.json();
        const analysis = JSON.parse(result.choices[0].message.content);
        
        console.log('✅ OpenAI analysis completed');
        return analysis;

    } catch (error) {
        console.error('❌ OpenAI analysis failed:', error);
        return generateOpenAIFallback(englishTranscription);
    }
}

// Fallback for when Sarvam API is unavailable
function generateSarvamFallback() {
    console.log('🔄 Using Sarvam fallback response');
    return {
        transcription_original: '[Audio recorded but Sarvam AI unavailable for transcription]',
        transcription_english: '[Audio recorded but Sarvam AI unavailable for transcription]',
        detected_language: 'unknown',
        confidence: 0.3,
        duration: 0,
        audio_quality: 'unknown'
    };
}

// Fallback for when OpenAI API is unavailable
function generateOpenAIFallback(transcription: string) {
    console.log('🔄 Using OpenAI fallback response');
    
    // Basic keyword detection as fallback
    const cheatingKeywords = [
        'help me', 'tell me', 'what is', 'answer is', 'google it', 'search for',
        'मदद', 'बताओ', 'उत्तर', 'সাহায্য', 'বলো', 'উত্তর', 'చెప్పు', 'సమాధానం'
    ];
    
    const foundKeywords = cheatingKeywords.filter(keyword => 
        transcription.toLowerCase().includes(keyword.toLowerCase())
    );
    
    return {
        cheating_detected: foundKeywords.length > 0,
        cheating_summary: foundKeywords.length > 0 ? `Potential cheating keywords detected: ${foundKeywords.join(', ')}` : 'No clear cheating indicators',
        suspicious_phrases: foundKeywords,
        detailed_analysis: `Basic keyword analysis completed (OpenAI unavailable). Found ${foundKeywords.length} suspicious phrases.`,
        confidence: 0.4
    };
}