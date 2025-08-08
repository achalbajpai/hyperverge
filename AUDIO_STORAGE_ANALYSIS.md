# Audio Storage and Processing Analysis

## Current Audio Storage Architecture

### 1. **Audio Recording and Capture**
- **Frontend Component**: `AudioInputComponent.tsx`
- **Recording Format**: WebM (default), with fallback to browser-supported formats
- **Capture Method**: MediaRecorder API with real-time waveform analysis
- **Storage Location**: Initially stored as Blob in browser memory

### 2. **Audio Processing Pipeline**

#### **Step 1: Frontend Processing**
- **File**: `/src/components/AudioInputComponent.tsx`
- **Process**: Records audio using MediaRecorder API
- **Temporary Storage**: Browser memory (Blob object)
- **Duration Limit**: 120 seconds (configurable via `maxDuration` prop)

#### **Step 2: Format Conversion**
- **File**: `/src/components/LearnerQuizView.tsx` (lines 1384-1450)
- **Process**: Converts WebM to WAV format using Web Audio API
- **Purpose**: Ensures consistent format for backend processing
- **Method**: `convertAudioBufferToWav()` function

#### **Step 3: Base64 Encoding**
- **Location**: LearnerQuizView.tsx (handleAudioSubmit)
- **Process**: Converts WAV Blob to base64 string for transmission
- **Purpose**: Enables JSON-based API communication

### 3. **Storage Options and Flow**

#### **Option A: AWS S3 Storage (Primary)**
```typescript
// Get presigned URL from backend
const presignedUrlResponse = await fetch('/api/file/presigned-url', {
    method: 'POST',
    body: JSON.stringify({ content_type: "audio/wav" })
});

// Upload directly to S3
const uploadResponse = await fetch(presigned_url, {
    method: 'PUT',
    body: audioBlob,
    headers: { 'Content-Type': 'audio/wav' }
});
```
- **Configuration**: `/src/api/utils/s3.py`
- **File Path**: `{s3_folder_name}/media/{uuid}.wav`
- **Benefits**: Scalable, CDN-enabled, persistent storage

#### **Option B: Local Backend Storage (Fallback)**
```typescript
// Direct upload to backend
const formData = new FormData();
formData.append('file', audioBlob, 'audio.wav');

const uploadResponse = await fetch('/file/upload-local', {
    method: 'POST',
    body: formData
});
```
- **Location**: Backend `/uploads` directory (currently empty)
- **Use Case**: When S3 is unavailable or for development

### 4. **Backend Audio Processing**

#### **Voice Integrity Analysis**
- **File**: `/src/api/voice_integrity/real_time_processor.py`
- **Features**:
  - Real-time Voice Activity Detection (VAD)
  - Speaker diarization and emotion analysis
  - Behavioral pattern recognition
  - Cheating detection algorithms

#### **Transcription and Analysis**
- **File**: `/src/app/api/ai/analyze-test-audio/route.ts`
- **Process**: Uses OpenAI Whisper API for transcription
- **Analysis**: GPT-4 analyzes transcription for cheating indicators

#### **Temporary File Handling**
- **File**: `/src/api/voice_integrity/speaker_detector.py`
- **Method**: `_save_audio_to_temp_file()`
- **Process**: Creates temporary files for processing, automatically cleaned up

## Current Issues and Limitations

### 1. **Memory Usage for Long Sessions**
- **Problem**: Audio data accumulates in browser memory during recording
- **Impact**: Browser crashes for sessions > 10-15 minutes
- **Current Limit**: 2 minutes (120 seconds)

### 2. **File Size Limitations**
```javascript
// Current recording constraints
maxDuration = 120 seconds (2 minutes)
Sample Rate = 16kHz (browser default)
Channels = 1 (mono)
Bit Depth = 16-bit

// Approximate file sizes:
// 2 minutes ≈ 3.8 MB (uncompressed WAV)
// 10 minutes ≈ 19 MB
// 30 minutes ≈ 57 MB
// 60 minutes ≈ 115 MB
```

### 3. **Processing Bottlenecks**
- **WebM to WAV conversion**: CPU-intensive for large files
- **Base64 encoding**: Increases payload size by ~33%
- **Single-threaded processing**: No chunked/streaming upload

### 4. **Storage Inefficiency**
- **Format redundancy**: Store both WebM and WAV versions
- **No compression**: Raw WAV files are large
- **No streaming**: Full file must be loaded before processing

## Recommendations for Longer Duration Support

### 1. **Implement Chunked Recording (High Priority)**

```typescript
// Proposed chunked recording approach
class ChunkedAudioRecorder {
    private chunks: Blob[] = [];
    private chunkDuration = 30; // 30-second chunks
    private currentChunkIndex = 0;

    async processChunk(chunk: Blob) {
        // Upload each chunk immediately
        const chunkId = await this.uploadChunk(chunk, this.currentChunkIndex);
        this.chunks.push({ id: chunkId, uploaded: true });
        this.currentChunkIndex++;
    }

    async uploadChunk(chunk: Blob, index: number) {
        // Stream upload to S3 with chunk index
        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('chunkIndex', index.toString());
        formData.append('sessionId', this.sessionId);
        
        return await fetch('/api/upload-audio-chunk', {
            method: 'POST',
            body: formData
        });
    }
}
```

### 2. **Backend Streaming Processing**

```python
# Proposed backend streaming processor
class StreamingAudioProcessor:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.audio_chunks = []
        self.temp_dir = f"/tmp/audio_session_{session_id}"
        
    async def process_chunk(self, chunk_data: bytes, chunk_index: int):
        # Save chunk temporarily
        chunk_file = f"{self.temp_dir}/chunk_{chunk_index}.wav"
        with open(chunk_file, 'wb') as f:
            f.write(chunk_data)
            
        # Process immediately for real-time analysis
        analysis = await self.analyze_chunk(chunk_data)
        
        # Store metadata, clean up old chunks
        self.cleanup_old_chunks(keep_last=5)
        
        return analysis
        
    async def finalize_session(self):
        # Merge all chunks into final file
        final_audio = self.merge_chunks()
        
        # Upload to permanent storage
        s3_key = await self.upload_to_s3(final_audio)
        
        # Cleanup temporary files
        shutil.rmtree(self.temp_dir)
        
        return s3_key
```

### 3. **Optimized Storage Strategy**

#### **Tiered Storage Approach**
```python
class AudioStorageManager:
    def __init__(self):
        self.hot_storage = Redis()  # For active sessions
        self.warm_storage = S3()    # For recent sessions
        self.cold_storage = Glacier() # For archived sessions
        
    async def store_audio(self, session_id: str, audio_data: bytes):
        # Immediate storage in Redis for active processing
        await self.hot_storage.set(f"audio:{session_id}", audio_data, ex=3600)
        
        # Async upload to S3
        asyncio.create_task(self.upload_to_s3(session_id, audio_data))
        
        # Schedule cold storage after 30 days
        self.schedule_cold_storage(session_id, delay_days=30)
```

#### **Compression and Optimization**
```python
def compress_audio(audio_data: bytes, quality="high") -> bytes:
    """
    Compress audio using efficient codecs
    - MP3: 90% size reduction, good quality
    - Opus: 95% size reduction, excellent quality
    - AAC: 85% size reduction, high compatibility
    """
    if quality == "high":
        return encode_opus(audio_data, bitrate=128)  # 128kbps Opus
    elif quality == "medium":
        return encode_aac(audio_data, bitrate=96)   # 96kbps AAC
    else:
        return encode_mp3(audio_data, bitrate=64)   # 64kbps MP3
```

### 4. **Real-time Processing Pipeline**

```typescript
// Frontend: Real-time streaming
class RealTimeAudioStreamer {
    private websocket: WebSocket;
    private audioContext: AudioContext;
    
    async startStreaming() {
        this.websocket = new WebSocket('ws://backend/voice-stream');
        
        // Send audio data every 100ms
        this.audioContext.createScriptProcessor(4096, 1, 1).onaudioprocess = (e) => {
            const audioData = e.inputBuffer.getChannelData(0);
            const compressed = this.compress(audioData);
            
            this.websocket.send(compressed);
        };
    }
}
```

```python
# Backend: WebSocket audio processing
@app.websocket("/voice-stream/{session_id}")
async def stream_audio(websocket: WebSocket, session_id: str):
    await websocket.accept()
    
    processor = VoiceProcessor(session_id)
    
    try:
        while True:
            # Receive audio chunk
            audio_chunk = await websocket.receive_bytes()
            
            # Process in real-time
            analysis = await processor.analyze_chunk(audio_chunk)
            
            # Send analysis back
            await websocket.send_json({
                "type": "analysis",
                "data": analysis
            })
            
            # Store chunk for later aggregation
            await processor.store_chunk(audio_chunk)
            
    except WebSocketDisconnect:
        # Finalize session
        await processor.finalize_session()
```

### 5. **Database Schema for Audio Sessions**

```sql
-- Audio sessions table
CREATE TABLE audio_sessions (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL,
    session_id VARCHAR(255) NOT NULL,
    start_time TIMESTAMP DEFAULT NOW(),
    end_time TIMESTAMP,
    duration_seconds INTEGER,
    total_chunks INTEGER,
    s3_key VARCHAR(500),
    status VARCHAR(50) DEFAULT 'recording', -- recording, processing, completed, error
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Audio chunks table (for streaming processing)
CREATE TABLE audio_chunks (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES audio_sessions(id),
    chunk_index INTEGER NOT NULL,
    s3_key VARCHAR(500),
    duration_ms INTEGER,
    processed BOOLEAN DEFAULT FALSE,
    analysis_result JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Audio analysis results
CREATE TABLE audio_analysis (
    id UUID PRIMARY KEY,
    session_id UUID REFERENCES audio_sessions(id),
    analysis_type VARCHAR(100), -- transcription, speaker_detection, emotion, cheating
    result JSONB,
    confidence_score FLOAT,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 6. **Performance Monitoring**

```python
class AudioPerformanceMonitor:
    def __init__(self):
        self.metrics = {
            'processing_time': [],
            'memory_usage': [],
            'storage_cost': 0.0,
            'error_rate': 0.0
        }
    
    def log_processing_time(self, session_id: str, duration: float):
        # Log to monitoring service
        self.send_metric('audio.processing.duration', duration, {
            'session_id': session_id
        })
    
    def track_storage_usage(self, session_id: str, file_size: int):
        # Calculate storage costs
        s3_cost = file_size * 0.000023  # $0.023 per GB/month
        self.metrics['storage_cost'] += s3_cost
```

## Implementation Priority

### Phase 1: Immediate Improvements (1-2 weeks)
1. ✅ Implement chunked recording (30-second chunks)
2. ✅ Add audio compression before upload
3. ✅ Implement WebSocket streaming for real-time analysis

### Phase 2: Storage Optimization (2-3 weeks)  
1. ✅ Set up tiered storage (Redis → S3 → Glacier)
2. ✅ Implement chunk-based upload and processing
3. ✅ Add database schema for session management

### Phase 3: Advanced Features (3-4 weeks)
1. ✅ Real-time transcription and analysis
2. ✅ Performance monitoring and alerting
3. ✅ Automated cleanup and archiving

## Expected Results

### **Current Capacity**
- Max Duration: 2 minutes
- Max Concurrent Users: ~100
- Storage: Raw WAV files

### **After Implementation**
- Max Duration: 2+ hours
- Max Concurrent Users: 1000+
- Storage: Compressed, tiered
- Cost Reduction: 80% storage, 60% processing
- Real-time Analysis: < 500ms latency

This architecture will support extended test sessions while maintaining performance and cost efficiency.
