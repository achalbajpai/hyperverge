// Test frontend fetchAssignment function
import { fetchAssignment } from '../sensai-frontend/src/lib/student-api.js';

async function testFrontendFetch() {
    console.log('Testing frontend fetchAssignment with ID 10...');
    
    try {
        const result = await fetchAssignment(10);
        console.log('Result:', JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

testFrontendFetch();
