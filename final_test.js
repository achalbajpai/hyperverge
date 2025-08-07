// Final comprehensive test to verify the assignment mapping fix

const BACKEND_URL = "http://localhost:8001";

async function findTaskIdForAssignmentId(assignmentId) {
   console.log(`\n=== Finding task_id for assignment_id ${assignmentId} ===`);

   // Step 1: Try direct fetch first
   console.log("1. Trying direct fetch...");
   try {
      const response = await fetch(`${BACKEND_URL}/tasks/${assignmentId}`);
      if (response.ok) {
         const taskData = await response.json();
         console.log(
            `   ✅ Direct fetch successful: task ${taskData.id} "${taskData.title}"`
         );
         return taskData;
      } else {
         console.log(`   ❌ Direct fetch failed: ${response.status}`);
      }
   } catch (error) {
      console.log(`   ❌ Direct fetch error: ${error.message}`);
   }

   // Step 2: Search through courses
   console.log("2. Searching through courses...");
   const coursesToCheck = [1, 2, 3, 4, 5];

   for (const courseId of coursesToCheck) {
      try {
         const tasksResponse = await fetch(
            `${BACKEND_URL}/courses/${courseId}/tasks`
         );
         if (tasksResponse.ok) {
            const tasks = await tasksResponse.json();
            console.log(`   Course ${courseId}: ${tasks.length} tasks`);

            const matchingTask = tasks.find(
               (task) =>
                  (task.course_task_id &&
                     task.course_task_id === assignmentId) ||
                  courseId * 1000 + task.id === assignmentId
            );

            if (matchingTask) {
               console.log(
                  `   ✅ Found in course ${courseId}: task ${matchingTask.id} (course_task_id: ${matchingTask.course_task_id})`
               );

               // Fetch the actual task data
               const taskResponse = await fetch(
                  `${BACKEND_URL}/tasks/${matchingTask.id}`
               );
               if (taskResponse.ok) {
                  const taskData = await taskResponse.json();
                  console.log(
                     `   ✅ Task data retrieved: "${taskData.title}" (${taskData.type})`
                  );
                  return taskData;
               } else {
                  console.log(
                     `   ❌ Could not fetch task data: ${taskResponse.status}`
                  );
               }
            }
         } else {
            console.log(`   ❌ Course ${courseId}: ${tasksResponse.status}`);
         }
      } catch (error) {
         console.log(`   ❌ Course ${courseId} error: ${error.message}`);
      }
   }

   console.log("   ❌ Assignment not found in any course");
   return null;
}

async function testAssignmentResolution() {
   console.log("🧪 Testing Assignment Resolution Logic");
   console.log("=====================================");

   // Test the problematic assignment ID 10
   const result = await findTaskIdForAssignmentId(10);

   if (result) {
      console.log("\n🎉 SUCCESS!");
      console.log(`Assignment ID 10 successfully resolved to:`);
      console.log(`  - Task ID: ${result.id}`);
      console.log(`  - Title: "${result.title}"`);
      console.log(`  - Type: ${result.type}`);
      console.log(`  - Status: ${result.status}`);
      console.log("\n✅ The frontend fix should work correctly!");
      console.log(
         'The 404 error "GET http://localhost:8001/tasks/10 404 (Not Found)" should be resolved.'
      );
   } else {
      console.log("\n❌ FAILED to resolve assignment ID 10");
      console.log("The fix needs more work.");
   }
}

testAssignmentResolution().catch(console.error);
