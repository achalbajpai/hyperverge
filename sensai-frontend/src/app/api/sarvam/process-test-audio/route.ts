import { NextRequest, NextResponse } from 'next/server';
import 'dotenv/config';
import FormData from 'form-data';

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
            
            // Nebius Results (formerly OpenAI)
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

        // Step 4: Save to integrity database if cheating detected or suspicious
        if (openaiResult.cheating_detected || openaiResult.confidence > 0.5) {
            try {
                const flagData = {
                    session_id: session_id,
                    flag_type: 'proctoring_violation',
                    severity: openaiResult.cheating_detected ? 'high' : 'medium',
                    confidence_score: openaiResult.confidence,
                    evidence_data: {
                        full_transcription: sarvamResult.transcription_english,
                        original_transcription: sarvamResult.transcription_original,
                        detected_language: sarvamResult.detected_language,
                        sarvam_confidence: sarvamResult.confidence,
                        cheating_detected: openaiResult.cheating_detected,
                        cheating_summary: openaiResult.cheating_summary,
                        suspicious_phrases: openaiResult.suspicious_phrases,
                        openai_analysis: openaiResult.detailed_analysis,
                        openai_confidence: openaiResult.confidence,
                        audio_duration_seconds: sarvamResult.duration || 0,
                        test_duration_minutes,
                        overall_confidence: Math.min(sarvamResult.confidence || 0.7, openaiResult.confidence || 0.7),
                        processing_pipeline: "Sarvam AI → Nebius",
                        audio_quality: sarvamResult.audio_quality || 'good'
                    },
                    ai_analysis: `SARVAM + NEBIUS Audio Analysis: ${openaiResult.cheating_detected ? '🚨 CHEATING DETECTED' : '✅ No cheating detected'}. 
            
Original Language: ${sarvamResult.detected_language}
English Translation: "${sarvamResult.transcription_english}"
Nebius Analysis: ${openaiResult.detailed_analysis}
Suspicious Phrases: ${openaiResult.suspicious_phrases.join(', ') || 'None'}`,
                    task_id: assignment_id ? parseInt(assignment_id) : undefined,
                    question_id: undefined  // No question ID available in this context
                };

                console.log('🔍 Sending flag data to backend:', JSON.stringify(flagData, null, 2));

                const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/integrity/flags?user_id=1`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(flagData)
                });
                
                if (response.ok) {
                    const result = await response.json();
                    console.log('✅ Integrity flag saved to database:', result);
                } else {
                    const errorText = await response.text();
                    console.error('❌ Failed to save integrity flag:');
                    console.error('Status:', response.status, response.statusText);
                    console.error('Response:', errorText);
                }
            } catch (error) {
                console.error('❌ Failed to save integrity flag:', error);
            }
        }

        console.log('✅ Audio processing pipeline completed successfully');
        return NextResponse.json(finalResult);

    } catch (error) {
        console.error('❌ Error in audio processing pipeline:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        return NextResponse.json(
            { error: 'Failed to process audio', details: errorMessage },
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
        
        // Convert base64 to buffer for Sarvam API
        const audioBuffer = Buffer.from(audioBase64, 'base64');
        
        // Create FormData using Node.js form-data library
        const form = new FormData();
        form.append('file', audioBuffer, {
            filename: 'audio.webm',
            contentType: 'audio/webm'
        });
        form.append('model', 'saarika:v2.5');
        form.append('language_code', 'unknown');
        
        // Sarvam API call for transcription
        const response = await fetch('https://api.sarvam.ai/speech-to-text', {
            method: 'POST',
            headers: {
                'api-subscription-key': sarvamApiKey,
                ...form.getHeaders(),
            },
            body: form.getBuffer(),
        });

        if (!response.ok) {
            // Get the actual error response for debugging
            const errorText = await response.text();
            console.error('Sarvam API error details:', errorText);
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

// Step 2: Analyze English transcription with Nebius AI
async function analyzeWithOpenAI(englishTranscription: string, metadata: any) {
    const nebiusKey = process.env.NEBIUS_API_KEY;
    
    console.log('🔑 Nebius key length:', nebiusKey ? nebiusKey.length : 'undefined');
    console.log('🔑 Nebius key starts with:', nebiusKey ? nebiusKey.substring(0, 10) + '...' : 'undefined');
    
    if (!nebiusKey) {
        console.warn('⚠️ Nebius API key not found, using fallback');
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
        console.log('🔄 Sending transcription to Nebius AI for cheating analysis...');

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

        const response = await fetch('https://api.studio.nebius.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${nebiusKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'Qwen/Qwen3-235B-A22B',
                temperature: 0.6,
                top_p: 0.95,
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
                max_tokens: 800
            }),
        });

        if (!response.ok) {
            throw new Error(`Nebius API error: ${response.status}`);
        }

        const result = await response.json();
        let analysisContent = result.choices[0].message.content;
        
        console.log('🔍 Raw Nebius response:', analysisContent.substring(0, 200) + '...');
        
        // Handle Nebius AI thinking tags - extract JSON from response
        if (analysisContent.includes('<think>') || analysisContent.includes('</think>')) {
            // Try multiple patterns to find JSON
            let jsonMatch = analysisContent.match(/\{[^}]*"cheating_detected"[^}]*\}/);
            if (!jsonMatch) {
                jsonMatch = analysisContent.match(/\{[\s\S]*?"cheating_detected"[\s\S]*?\}/);
            }
            if (!jsonMatch) {
                // Look for JSON after </think> tag
                const afterThink = analysisContent.split('</think>')[1];
                if (afterThink) {
                    jsonMatch = afterThink.match(/\{[\s\S]*\}/);
                }
            }
            if (!jsonMatch) {
                // Look for any JSON-like structure with our expected fields
                jsonMatch = analysisContent.match(/\{[\s\S]*?"confidence"[\s\S]*?\}/);
            }
            
            if (jsonMatch) {
                analysisContent = jsonMatch[0];
                console.log('🔍 Extracted JSON:', analysisContent);
            } else {
                console.warn('⚠️ No JSON found in Nebius response, using fallback');
                return generateOpenAIFallback(englishTranscription);
            }
        }
        
        const analysis = JSON.parse(analysisContent);
        
        console.log('✅ Nebius AI analysis completed');
        return analysis;

    } catch (error) {
        console.error('❌ Nebius analysis failed:', error);
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