import { Octokit } from "@octokit/rest";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { chatLLM } from "../utils/model.js";
import memoryService from "../services/memoryService.js";
import notificationService from "../services/notificationService.js";

// Enhanced error logging utility
const logError = (agentName, error, context = {}) => {
    console.error(`[${agentName}] Error:`, {
        message: error.message,
        stack: error.stack,
        context,
        timestamp: new Date().toISOString()
    });
};

// Input validation utility
const validateState = (state, requiredFields = []) => {
    const missing = requiredFields.filter(field => !state[field]);
    if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
    return true;
};

// Helper function to validate file paths
const validateFilePath = (filePath) => {
    if (!filePath || typeof filePath !== 'string') {
        return { isValid: false, cleaned: null, reason: 'Invalid input type' };
    }

    // Check for comma-separated paths (common AI mistake)
    if (filePath.includes(',')) {
        return { isValid: false, cleaned: null, reason: 'Contains comma-separated paths', hasMultiplePaths: true };
    }

    // Check for other invalid characters that shouldn't be in file paths
    const invalidChars = /[<>:"|?*\x00-\x1f]/;
    if (invalidChars.test(filePath)) {
        return { isValid: false, cleaned: null, reason: 'Contains invalid characters' };
    }

    return { isValid: true, cleaned: filePath };
};

// Helper function to extract first valid path from comma-separated string
const extractFirstValidPath = (filePath) => {
    if (!filePath || typeof filePath !== 'string') {
        return null;
    }

    // Split by comma and find the first valid path
    const paths = filePath.split(',').map(p => p.trim()).filter(p => p.length > 0);
    
    for (const path of paths) {
        const validation = validateFilePath(path);
        if (validation.isValid) {
            return path;
        }
    }

    // If no valid path found, return the first one cleaned up
    if (paths.length > 0) {
        return paths[0];
    }

    return null;
};

// Helper function to validate and normalize file paths
const normalizeFilePath = (filePath, taskTitle) => {
    if (!filePath || typeof filePath !== 'string') {
        console.warn(`⚠️ Invalid filePath provided: ${filePath}, using task title to generate path`);
        return `src/${taskTitle.toLowerCase().replace(/\s+/g, '-')}.js`;
    }

    const originalPath = filePath;
    let normalizedPath = filePath.trim();

    // Check for comma-separated paths (common AI generation mistake)
    if (normalizedPath.includes(',')) {
        console.warn(`⚠️ Detected comma-separated paths in filePath: "${originalPath}"`);
        const extractedPath = extractFirstValidPath(normalizedPath);
        if (extractedPath) {
            normalizedPath = extractedPath;
            console.log(`📝 Extracted first valid path: "${normalizedPath}"`);
        } else {
            console.warn(`⚠️ Could not extract valid path from: "${originalPath}", using fallback`);
            normalizedPath = `src/${taskTitle.toLowerCase().replace(/\s+/g, '-')}.js`;
            return normalizedPath;
        }
    }

    // Validate the path
    const validation = validateFilePath(normalizedPath);
    if (!validation.isValid && validation.reason !== 'Contains comma-separated paths') {
        console.warn(`⚠️ Invalid file path detected: "${originalPath}" (${validation.reason}), using fallback`);
        normalizedPath = `src/${taskTitle.toLowerCase().replace(/\s+/g, '-')}.js`;
        return normalizedPath;
    }

    // Clean up the path
    normalizedPath = normalizedPath
        .replace(/^\/+/, '') // Remove leading slashes
        .replace(/\/+/g, '/') // Normalize multiple slashes
        .replace(/^\.\//, '') // Remove leading ./
        .trim();

    // Handle directory paths by creating appropriate files
    if (normalizedPath.endsWith('/') || normalizedPath === 'root' || normalizedPath === 'frontend' || normalizedPath === 'backend') {
        if (normalizedPath === 'root' || normalizedPath === '') {
            normalizedPath = 'src/main.js';
        } else if (normalizedPath === 'frontend') {
            normalizedPath = 'frontend/src/main.js';
        } else if (normalizedPath === 'backend') {
            normalizedPath = 'backend/src/main.js';
        } else {
            // For other directories, create an index file
            normalizedPath = normalizedPath.replace(/\/$/, '') + '/index.js';
        }
    }

    // Ensure the path has a proper file extension
    if (!normalizedPath.includes('.')) {
        normalizedPath = `${normalizedPath}.js`;
    }

    // Validate the final path - ensure no double slashes
    normalizedPath = normalizedPath.replace(/\/+/g, '/');
    normalizedPath = normalizedPath.replace(/^\/+|\/+$/g, '');

    // Validate the final path
    if (normalizedPath.length === 0) {
        normalizedPath = `src/${taskTitle.toLowerCase().replace(/\s+/g, '-')}.js`;
    }

    // Log if path was modified
    if (originalPath !== normalizedPath && !originalPath.includes(',')) {
        console.log(`📝 Path normalized: "${originalPath}" -> "${normalizedPath}"`);
    }

    return normalizedPath;
};

export const developNextTask = async (state) => {
    try {
        // Validate input state
        validateState(state, ['projectSpec', 'plan', 'repo']);

        const model = chatLLM();
        const parser = new StringOutputParser();

        // Parse and validate inputs
        let projectSpec, plan;
        try {
            // projectSpec comes as a string from memory, so parse it
            projectSpec = JSON.parse(state.projectSpec);

            // plan is already an object from the workflow, no need to parse
            plan = state.plan;

            console.log("✅ Input validation passed");
            console.log("📋 Project spec type:", typeof projectSpec);
            console.log("📋 Plan type:", typeof plan);
        } catch (parseError) {
            logError('developNextTask', parseError, { projectSpec: state.projectSpec, plan: state.plan });
            throw new Error('Invalid projectSpec or plan JSON');
        }

        // Validate repository
        if (!state.repo || !state.repo.name || !state.repo.url || state.repo.name === "mock-repo") {
            console.error("❌ Repository validation failed:", state.repo);
            throw new Error('No valid repository found');
        }

        console.log(`🏗️ Repository validated: ${state.repo.name}`);

        // Get remaining tasks from memory
        const remainingTasks = await memoryService.getRemainingTasks();
        let currentTask;

        console.log(`📋 Remaining tasks from memory: ${remainingTasks.length}`);
        console.log(`📋 Plan tasks: ${plan.tasks ? plan.tasks.length : 0}`);
        console.log(`📋 Plan structure:`, JSON.stringify(plan, null, 2).substring(0, 200) + "...");

        if (remainingTasks && remainingTasks.length > 0) {
            // Get the next task from remaining tasks
            currentTask = remainingTasks[0];
            console.log(`🎯 Selected task from memory: ${currentTask.title}`);
        } else if (plan.tasks && plan.tasks.length > 0) {
            // If no remaining tasks in memory, get the first uncompleted task
            currentTask = plan.tasks[0];
            console.log(`🎯 Selected task from plan: ${currentTask.title}`);
        } else {
            // No tasks available
            console.log("🎉 No more tasks available - project completed!");
            await memoryService.saveProjectCompletion();
            return {
                ...state,
                commits: [],
                status: "Project completed - no more tasks"
            };
        }

        // Validate and clean up filePath in the selected task
        if (currentTask && currentTask.filePath) {
            const originalFilePath = currentTask.filePath;
            
            // Check for invalid paths and log warnings
            if (originalFilePath.includes(',')) {
                console.warn(`⚠️ Task "${currentTask.title}" has comma-separated filePath: "${originalFilePath}"`);
                console.warn(`⚠️ This will be cleaned up during normalization`);
            }
            
            // Validate the path structure
            const validation = validateFilePath(originalFilePath);
            if (!validation.isValid && validation.reason !== 'Contains comma-separated paths') {
                console.warn(`⚠️ Task "${currentTask.title}" has invalid filePath: "${originalFilePath}" (${validation.reason})`);
            }
        } else if (currentTask && !currentTask.filePath) {
            console.warn(`⚠️ Task "${currentTask.title}" is missing filePath, will generate one from task title`);
        }

        console.log(`🔄 Development Agent processing task: ${currentTask.title}`);

        // Enhanced code generation prompt - FORCE actual code generation
        const prompt = `You are the Development Agent. Your job is to generate ACTUAL, IMPLEMENTABLE CODE for the current task.

CRITICAL REQUIREMENTS:
- You MUST generate REAL, FUNCTIONAL CODE - not explanations or descriptions
- The code should be production-ready and immediately runnable
- Follow the exact file path and tech stack specified
- Include proper imports, error handling, and best practices
- NO explanatory text, NO markdown, NO code block markers
- ONLY the actual code content

Project Context:
- Type: ${projectSpec.type}
- Tech Stack: ${projectSpec.techStack.join(", ")}
- Complexity: ${projectSpec.complexity}

Current Task:
- Title: ${currentTask.title}
- Description: ${currentTask.description}
- File Path: ${currentTask.filePath}
- Priority: ${projectSpec.priority || 'medium'}

Code Requirements:
- Generate the actual implementation code for this specific task
- Use the correct file extension based on the file path
- Follow the project's tech stack (${projectSpec.techStack.join(", ")})
- Make the code functional and implementable
- Add appropriate comments for complex logic
- Handle errors and edge cases properly

IMPORTANT: Return ONLY the raw code content. Do not include any explanations, descriptions, or markdown formatting.`;

        const response = await model.invoke([["human", prompt]]);
        let codeContent = await parser.parse(response.content);

        // Enhanced code cleaning and validation
        codeContent = codeContent
            .replace(/```(?:html|css|javascript|json|python|java|cpp|csharp|php|go|rust|swift|kotlin|scala|r|matlab|julia|dart|typescript|jsx|tsx)?\s*/gi, "")
            .replace(/```/g, "")
            .trim();

        // Validate that we actually got code, not explanatory text
        if (!codeContent || codeContent.length < 10) {
            throw new Error('Generated content is too short - likely not actual code');
        }

        // Check for common non-code patterns and retry if needed
        const nonCodePatterns = [
            /since the task does not require/i,
            /no code will be generated/i,
            /this task involves/i,
            /the following code/i,
            /here is the code/i,
            /explanation/i,
            /description/i
        ];

        let hasNonCodePattern = false;
        for (const pattern of nonCodePatterns) {
            if (pattern.test(codeContent)) {
                hasNonCodePattern = true;
                console.warn(`⚠️ Warning: Generated content may contain explanatory text: ${pattern.source}`);
            }
        }

        // If we got explanatory text instead of code, try one more time with a stronger prompt
        if (hasNonCodePattern && codeContent.length < 200) {
            console.log("🔄 Retrying with stronger code generation prompt...");

            const retryPrompt = `CRITICAL: You must generate ACTUAL CODE, not explanations.

Task: ${currentTask.title}
File: ${currentTask.filePath}
Tech Stack: ${projectSpec.techStack.join(", ")}

Generate ONLY the raw code implementation. No explanations, no descriptions, no markdown.
The code must be functional and immediately runnable.`;

            const retryResponse = await model.invoke([["human", retryPrompt]]);
            codeContent = await parser.parse(retryResponse.content);
            codeContent = codeContent
                .replace(/```(?:html|css|javascript|json|python|java|cpp|csharp|php|go|rust|swift|kotlin|scala|r|matlab|julia|dart|typescript|jsx|tsx)?\s*/gi, "")
                .replace(/```/g, "")
                .trim();

            console.log(`📝 Retry code content length: ${codeContent.length} characters`);
        }

        console.log(`📝 Final code content length: ${codeContent.length} characters`);
        console.log(`📝 Code preview: ${codeContent.substring(0, 100)}...`);

        // Validate and normalize file path
        let fullPath = normalizeFilePath(currentTask.filePath, currentTask.title);
        console.log(`📁 Normalized file path: ${currentTask.filePath} -> ${fullPath}`);

        // GitHub operations (support per-state token for multi-account runs)
        const effectiveToken = state.githubToken || process.env.GITHUB_TOKEN;
        if (!effectiveToken) {
            throw new Error('GITHUB_TOKEN not found in environment variables');
        }

        const github = new Octokit({ auth: effectiveToken });
        const { data: user } = await github.users.getAuthenticated();
        const owner = user.login;

        console.log(`🔑 GitHub authenticated as: ${owner}`);
        console.log(`📁 Working with repository: ${state.repo.name}`);

        // Check if the file already exists to get its sha
        let sha;
        try {
            const { data } = await github.rest.repos.getContent({
                owner: owner,
                repo: state.repo.name,
                path: fullPath,
                branch: "main"
            });
            sha = data.sha;
            console.log(`📝 File exists at ${fullPath}, will update`);
        } catch (error) {
            if (error.status === 404) {
                sha = undefined;
                console.log(`🆕 File doesn't exist at ${fullPath}, will create new`);
                // Log additional context for debugging
                console.log(`🔍 Path context: original="${currentTask.filePath}", normalized="${fullPath}"`);
            } else {
                // Enhanced error logging for non-404 errors
                console.error(`❌ Error checking file existence:`, {
                    status: error.status,
                    message: error.message,
                    originalPath: currentTask.filePath,
                    normalizedPath: fullPath,
                    repo: state.repo.name,
                    owner: owner
                });
                throw error;
            }
        }

        // Commit the file with meaningful message
        const commitMessage = `feat: implement ${currentTask.title}`;

        console.log(`📤 Committing to GitHub: ${fullPath}`);
        console.log(`📤 Commit message: ${commitMessage}`);
        console.log(`📤 Content length: ${codeContent.length} characters`);
        console.log(`📤 Repository: ${state.repo.name}`);
        console.log(`📤 Branch: main`);

        try {
            await github.rest.repos.createOrUpdateFileContents({
                owner: owner,
                repo: state.repo.name,
                path: fullPath,
                message: commitMessage,
                content: Buffer.from(codeContent).toString("base64"),
                branch: "main",
                sha: sha
            });

            console.log(`✅ Successfully committed: ${fullPath}`);

            // Send Slack notification for successful commit
            try {
                await notificationService.sendCommitNotification({
                    message: commitMessage,
                    files: [{ path: fullPath, content: codeContent }],
                    repo: state.repo,
                    task: currentTask.title
                });
            } catch (notifyError) {
                console.warn("⚠️ Failed to send Slack notification:", notifyError.message);
            }
        } catch (commitError) {
            console.error(`❌ GitHub commit failed:`, commitError);
            console.error(`❌ Error details:`, {
                status: commitError.status,
                message: commitError.message,
                path: fullPath,
                repo: state.repo.name
            });

            // Send error notification
            try {
                await notificationService.sendErrorNotification({
                    error: commitError,
                    context: `GitHub commit failed for ${fullPath}`,
                    repo: state.repo
                });
            } catch (notifyError) {
                console.warn("⚠️ Failed to send error notification:", notifyError.message);
            }

            throw new Error(`GitHub commit failed: ${commitError.message}`);
        }

        // Update memory with task completion
        await memoryService.saveTaskProgress(currentTask.title, "completed", {
            filePath: fullPath,
            commitMessage,
            timestamp: new Date().toISOString()
        });

        // Remove completed task from remaining tasks
        const updatedRemainingTasks = remainingTasks.filter(task => task.title !== currentTask.title);
        await memoryService.updateRemainingTasks(updatedRemainingTasks);

        // Check if all tasks are completed
        if (updatedRemainingTasks.length === 0) {
            console.log("🎉 All tasks completed! Project finished.");
            await memoryService.markProjectCompleted();
            console.log("✅ Project marked as completed - cron will stop automatically");
        }

        // Send task completion notification
        try {
            await notificationService.sendTaskCompletionNotification({
                taskTitle: currentTask.title,
                remainingTasks: updatedRemainingTasks.length,
                repo: state.repo
            });
        } catch (notifyError) {
            console.warn("⚠️ Failed to send task completion notification:", notifyError.message);
        }

        return {
            ...state,
            commits: [{
                message: commitMessage,
                files: [{ path: fullPath, content: codeContent }]
            }],
            currentTask: currentTask.title,
            remainingTasks: updatedRemainingTasks.length
        };

    } catch (error) {
        logError('developNextTask', error, { state });

        // Save error to memory
        await memoryService.saveTaskProgress("ERROR", "failed", {
            error: error.message,
            timestamp: new Date().toISOString()
        });

        throw error;
    }
};
