// Test script to verify the assignment fetching fix

const BACKEND_URL = "http://localhost:8001";

async function testAssignmentFetch() {
   console.log("Testing assignment fetch with ID 10...");

   try {
      // First test: try to fetch task 10 directly (should fail)
      console.log("1. Testing direct task fetch /tasks/10");
      const directResponse = await fetch(`${BACKEND_URL}/tasks/10`);
      console.log(`   Status: ${directResponse.status}`);

      // Second test: get all courses and find task mapping
      console.log("2. Testing course tasks mapping");

      // Get user courses (this might require authentication, so let's try a different approach)
      // Let's test the course/{id}/tasks endpoint instead
      const courseTasksResponse = await fetch(`${BACKEND_URL}/courses/3/tasks`);
      console.log(`   Course 3 tasks status: ${courseTasksResponse.status}`);

      if (courseTasksResponse.ok) {
         const tasks = await courseTasksResponse.json();
         console.log("   Tasks from course 3:", JSON.stringify(tasks, null, 2));

         // Find task with course_task_id = 10
         const taskWithId10 = tasks.find((task) => task.course_task_id === 10);
         if (taskWithId10) {
            console.log(`   Found task with course_task_id 10:`, taskWithId10);
            console.log(`   Actual task_id is: ${taskWithId10.id}`);

            // Test fetching the actual task
            const actualTaskResponse = await fetch(
               `${BACKEND_URL}/tasks/${taskWithId10.id}`
            );
            console.log(
               `   Fetching actual task ${taskWithId10.id}: ${actualTaskResponse.status}`
            );

            if (actualTaskResponse.ok) {
               const actualTaskData = await actualTaskResponse.json();
               console.log(
                  "   Actual task data:",
                  JSON.stringify(actualTaskData, null, 2)
               );
            }
         } else {
            console.log("   No task found with course_task_id = 10");
         }
      }
   } catch (error) {
      console.error("Error in test:", error);
   }
}

testAssignmentFetch();
