// Test the updated fetchAssignment function fix

const BACKEND_URL = 'http://localhost:8001';

async function testFetchAssignmentFix() {
    console.log('Testing fetchAssignment fix...');
    
    // Test 1: Try fetching assignment ID 10 directly (should fail initially)
    console.log('1. Direct fetch of /tasks/10:');
    try {
        const directResponse = await fetch(`${BACKEND_URL}/tasks/10`);
        console.log(`   Status: ${directResponse.status}`);
    } catch (error) {
        console.log(`   Error: ${error.message}`);
    }
    
    // Test 2: Check course 3 tasks to find mapping
    console.log('2. Checking course 3 tasks for assignment ID 10:');
    try {
        const courseTasksResponse = await fetch(`${BACKEND_URL}/courses/3/tasks`);
        if (courseTasksResponse.ok) {
            const tasks = await courseTasksResponse.json();
            const matchingTask = tasks.find(task => task.course_task_id === 10);
            if (matchingTask) {
                console.log(`   Found matching task: ID ${matchingTask.id}, course_task_id ${matchingTask.course_task_id}`);
                
                // Test 3: Fetch the actual task
                console.log('3. Fetching actual task using task_id:');
                const actualTaskResponse = await fetch(`${BACKEND_URL}/tasks/${matchingTask.id}`);
                console.log(`   Status: ${actualTaskResponse.status}`);
                
                if (actualTaskResponse.ok) {
                    const taskData = await actualTaskResponse.json();
                    console.log(`   Task title: "${taskData.title}"`);
                    console.log(`   Task type: ${taskData.type}`);
                    console.log('   ✅ Fix should work - assignment ID 10 can be resolved to task ID', matchingTask.id);
                } else {
                    console.log('   ❌ Could not fetch actual task data');
                }
            } else {
                console.log('   ❌ No task found with course_task_id = 10');
            }
        } else {
            console.log(`   ❌ Could not fetch course 3 tasks: ${courseTasksResponse.status}`);
        }
    } catch (error) {
        console.log(`   Error: ${error.message}`);
    }
}

testFetchAssignmentFix();
