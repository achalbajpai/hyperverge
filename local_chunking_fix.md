# Local Storage Chunking Fix

## Problem
Audio chunking works fine with S3 but fails with local storage due to synchronous processing and memory limitations.

## Solution 1: Implement Streaming Upload for Local Storage

### Backend Changes (FastAPI)

```python
# In sensai-ai/src/api/routes/file.py

@router.post("/upload-local-chunked")
async def upload_file_locally_chunked(
    file: UploadFile = File(...), 
    content_type: str = Form(...),
    chunk_size: int = Form(8192)  # 8KB chunks
):
    try:
        # Create the folder if it doesn't exist
        os.makedirs(settings.local_upload_folder, exist_ok=True)

        # Generate a unique filename
        file_uuid = str(uuid.uuid4())
        file_extension = content_type.split("/")[1]
        filename = f"{file_uuid}.{file_extension}"
        file_path = os.path.join(settings.local_upload_folder, filename)

        # Stream the file in chunks to avoid memory issues
        with open(file_path, "wb") as f:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                f.write(chunk)

        # Generate the URL to access the file statically
        static_url = f"/uploads/{filename}"

        return {
            "file_key": filename,
            "file_path": file_path,
            "file_uuid": file_uuid,
            "static_url": static_url,
        }

    except Exception as e:
        logger.error(f"Error uploading file locally: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Failed to upload file locally")
```

### Frontend Changes

```typescript
// In sensai-frontend/src/components/LearnerQuizView.tsx
// Replace the local upload with chunked approach

const uploadAudioChunked = async (audioBlob: Blob) => {
    const chunkSize = 64 * 1024; // 64KB chunks
    const totalChunks = Math.ceil(audioBlob.size / chunkSize);
    
    const file_uuid = uuidv4();
    
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, audioBlob.size);
        const chunk = audioBlob.slice(start, end);
        
        const formData = new FormData();
        formData.append('chunk', chunk);
        formData.append('chunk_index', chunkIndex.toString());
        formData.append('total_chunks', totalChunks.toString());
        formData.append('file_uuid', file_uuid);
        formData.append('content_type', 'audio/wav');
        
        const uploadResponse = await fetch(
            `${process.env.NEXT_PUBLIC_BACKEND_URL}/file/upload-chunk`, 
            {
                method: 'POST',
                body: formData
            }
        );
        
        if (!uploadResponse.ok) {
            throw new Error(`Failed to upload chunk ${chunkIndex}`);
        }
    }
    
    // Finalize the upload
    const finalizeResponse = await fetch(
        `${process.env.NEXT_PUBLIC_BACKEND_URL}/file/finalize-chunked-upload`, 
        {
            method: 'POST',
            body: JSON.stringify({ file_uuid, content_type: 'audio/wav' }),
            headers: { 'Content-Type': 'application/json' }
        }
    );
    
    return await finalizeResponse.json();
};
```

## Solution 2: Memory-Optimized Local Processing

```python
# Async generator for streaming file processing
async def process_audio_stream(file_path: str, chunk_size: int = 8192):
    """Stream audio file processing to avoid memory issues."""
    with open(file_path, 'rb') as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            yield chunk

# Updated WebSocket handler
async def process_audio_chunk(self, session_id: str, audio_data: bytes) -> Dict:
    """Process audio in smaller chunks to avoid memory issues."""
    if session_id not in self.active_sessions:
        return {"error": "Session not found"}
    
    voice_session = self.active_sessions[session_id]
    
    # Process in smaller sub-chunks for local storage
    chunk_size = 4096  # 4KB chunks
    results = []
    
    for i in range(0, len(audio_data), chunk_size):
        sub_chunk = audio_data[i:i + chunk_size]
        result = await voice_session.process_audio(sub_chunk)
        results.append(result)
    
    return {
        "chunks_processed": len(results),
        "results": results
    }
```

## Solution 3: Configuration-Based Approach

```python
# In settings.py
class Settings(BaseSettings):
    # ... existing settings
    local_storage_chunk_size: int = 8192  # 8KB chunks for local
    s3_storage_chunk_size: int = 5242880   # 5MB chunks for S3
    use_chunked_local_upload: bool = True
    max_local_file_size: int = 50 * 1024 * 1024  # 50MB limit
```

## Quick Fix for Immediate Relief

```typescript
// In the frontend, add retry logic for local uploads
const uploadWithRetry = async (audioBlob: Blob, maxRetries: number = 3) => {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Try smaller blob if previous attempts failed
            if (attempt > 0) {
                // Compress audio quality for local storage
                const compressedBlob = await compressAudioBlob(audioBlob, 0.8 - (attempt * 0.2));
                audioBlob = compressedBlob;
            }
            
            const formData = new FormData();
            formData.append('file', audioBlob, 'audio.wav');
            formData.append('content_type', 'audio/wav');

            const uploadResponse = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/file/upload-local`, 
                {
                    method: 'POST',
                    body: formData,
                    timeout: 60000 // 60 second timeout
                }
            );

            if (uploadResponse.ok) {
                return await uploadResponse.json();
            }
        } catch (error) {
            console.warn(`Upload attempt ${attempt + 1} failed:`, error);
            if (attempt === maxRetries - 1) {
                throw error;
            }
        }
    }
};
```
