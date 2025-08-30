import { Octokit } from "@octokit/rest";
import { WebClient } from "@slack/web-api";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { chatLLM } from "../utils/model.js";

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

export const generateIdea = async (state) => {
    try {
        // Validate input state
        validateState(state, ['complexity']);

        const model = chatLLM({ json: true });

        // Enhanced prompt with better project variety and constraints
        const prompt = `You are an expert software architect specializing in diverse project creation. Generate one creative software project idea in JSON format.
                        ${state.projectName ? `SPECIFIC PROJECT REQUEST: The user wants to create a project called "${state.projectName}". Please create a project specification that matches this name/idea while ensuring it's feasible and implementable.` : `Constraints:
                        - Complexity: ${state.complexity}
                        - Tech Stack: ${state.techConstraints?.join(", ") || "No constraints"}
                        - Project Variety: Focus on creating unique, innovative concepts`}

                        Requirements:
                        - ${state.projectName ? `Create a project that matches the name "${state.projectName}"` : 'Ensure the project is feasible and implementable'}
                        - ${state.projectName ? 'Make the project name match exactly what the user requested' : 'Select appropriate tech stack for the complexity level'}
                        - Create engaging features that demonstrate technical skills
                        - Provide realistic timeline estimates
                        - Choose modern, relevant technologies that work well together
                        - Consider the project's specific needs and requirements

                        ${state.projectName ? `IMPORTANT: The project title MUST be exactly "${state.projectName}" as requested by the user.` : ''}

                        Return ONLY valid JSON in this exact format:
                        {
                          "title": "${state.projectName || 'Project Name'}",
                          "type": "Web App | CLI Tool | API | Library | Mobile App | Data Processing | Automation Script",
                          "complexity": "Beginner | Intermediate | Advanced",
                          "techStack": ["technology1", "technology2"],
                          "features": ["feature1", "feature2", "feature3"],
                          "timeline": "estimated duration",
                          "description": "Brief project description",
                          "targetAudience": "Who would use this project"
                        }`;

        const response = await model.invoke([["human", prompt]]);
        const cleaned = response.content.replace(/```json|```/g, "").trim();

        // Validate JSON response
        try {
            JSON.parse(cleaned);
        } catch (parseError) {
            logError('generateIdea', parseError, { response: response.content });
            throw new Error('Invalid JSON response from model');
        }

        return { ...state, projectSpec: cleaned };
    } catch (error) {
        logError('generateIdea', error, { state });

        // Fallback response - maintains exact same output format
        return {
            ...state,
            projectSpec: JSON.stringify({
                title: state.projectName || "Random Project",
                type: "Web App",
                complexity: state.complexity,
                techStack: state.techConstraints || ["Node.js"],
                features: ["Feature 1", "Feature 2"],
                timeline: "2 weeks",
                description: state.projectName ? `Fallback project for ${state.projectName} due to error` : "Fallback project due to error",
                targetAudience: "Developers"
            })
        };
    }
};

export const planProject = async (state) => {
    try {
        // Validate input state
        validateState(state, ['projectSpec']);

        const model = chatLLM({ json: true });

        // Parse and validate project specification
        let projectSpec;
        try {
            projectSpec = JSON.parse(state.projectSpec);
        } catch (parseError) {
            logError('planProject', parseError, { projectSpec: state.projectSpec });
            throw new Error('Invalid projectSpec JSON');
        }

        // Enhanced planning prompt with better task breakdown
        const prompt = `You are an expert project planner and software architect. Create a detailed implementation plan for the following project:
                        Project: ${JSON.stringify(projectSpec, null, 2)}

                        Requirements:
                        - Break down the project into logical, implementable tasks
                        - Each task should be atomic and commit-worthy
                        - Consider dependencies between tasks
                        - Provide realistic timeline estimates
                        - Include file paths that make sense for the project structure
                        - Ensure tasks align with the project's complexity level

                        Return ONLY valid JSON in this exact format:
                        {
                          "tasks": [
                            {
                              "title": "Task Name",
                              "description": "Detailed task description",
                              "filePath": "path/to/file",
                              "estimatedTime": "time estimate",
                              "priority": "high|medium|low"
                            }
                          ],
                                                  "timeline": "Estimated timeline",
                          "dependencies": ["dependency1", "dependency2"],
                          "milestones": ["milestone1", "milestone2"],
                          "riskFactors": ["risk1", "risk2"]}`;

        const response = await model.invoke([["human", prompt]]);
        const cleaned = response.content.replace(/```json|```/g, "").trim();

        // Validate JSON response
        try {
            const plan = JSON.parse(cleaned);
            if (!plan.tasks || !Array.isArray(plan.tasks)) {
                throw new Error('Invalid plan structure: missing tasks array');
            }
        } catch (parseError) {
            logError('planProject', parseError, { response: response.content });
            throw new Error('Invalid JSON response from model');
        }

        return { ...state, plan: cleaned };
    } catch (error) {
        logError('planProject', error, { state });

        // Fallback response - maintains exact same output format
        return {
            ...state,
            plan: JSON.stringify({
                tasks: [],
                timeline: "1 week",
                dependencies: [],
                milestones: [],
                riskFactors: []
            })
        };
    }
};

export const manageRepository = async (state) => {
    try {
        // Validate input state
        validateState(state, ['projectSpec']);

        // Check for GitHub token
        if (!process.env.GITHUB_TOKEN) {
            logError('manageRepository', new Error('GITHUB_TOKEN not found'), { state });
            return {
                ...state,
                repo: { name: "mock-repo", url: "http://mock-repo.com" }
            };
        }

        const github = new Octokit({ auth: process.env.GITHUB_TOKEN });

        // Parse and validate project specification
        let projectSpec;
        try {
            projectSpec = JSON.parse(state.projectSpec);
        } catch (parseError) {
            logError('manageRepository', parseError, { projectSpec: state.projectSpec });
            return { ...state, repo: { name: "mock-repo", url: "http://mock-repo.com" } };
        }

        // Enhanced repository name generation
        const repoName = projectSpec.title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/-+/g, '-') // Replace multiple hyphens with single
            .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
            .substring(0, 100); // GitHub repo name limit

        // Enhanced repository description
        let repoDescription = `A ${projectSpec.complexity?.toLowerCase() || 'intermediate'} ${projectSpec.type?.toLowerCase() || 'software'} project: ${projectSpec.title}.`;

        if (projectSpec.description) {
            repoDescription += ` ${projectSpec.description}`;
        }

        if (projectSpec.techStack && projectSpec.techStack.length > 0) {
            repoDescription += ` Built with ${projectSpec.techStack.join(', ')}.`;
        }

        // Truncate description if too long
        if (repoDescription.length > 350) {
            repoDescription = repoDescription.substring(0, 347) + '...';
        }

        // Get authenticated user's username
        const { data: user } = await github.users.getAuthenticated();
        const owner = user.login;

        let repo;
        try {
            // Check if repository already exists
            const { data: existingRepo } = await github.repos.get({
                owner,
                repo: repoName
            });
            console.log(`Repository ${repoName} already exists. Using existing repository.`);
            repo = existingRepo;
        } catch (error) {
            if (error.status === 404) {
                // Create new repository
                repo = (await github.repos.createForAuthenticatedUser({
                    name: repoName,
                    description: repoDescription,
                    private: false,
                    auto_init: false, // Don't auto-initialize to avoid conflicts
                    gitignore_template: 'Node', // Add appropriate .gitignore
                    license_template: 'mit' // Add MIT license
                })).data;
                console.log(`Created new repository: ${repoName}`);
            } else {
                throw error;
            }
        }

        // Enhanced README content generation
        const readmeContent = generateReadmeContent(projectSpec, repo);

        // Update or create README
        let readmeSha;
        try {
            const { data } = await github.rest.repos.getContent({
                owner,
                repo: repoName,
                path: "README.md"
            });
            readmeSha = data.sha;
        } catch (err) {
            if (err.status !== 404) throw err;
        }

        await github.rest.repos.createOrUpdateFileContents({
            owner,
            repo: repoName,
            path: "README.md",
            message: readmeSha ? "Update README with project details" : "Initial commit: Add comprehensive README",
            content: Buffer.from(readmeContent).toString("base64"),
            branch: "main",
            sha: readmeSha
        });

        return { ...state, repo: { name: repo.name, url: repo.html_url } };
    } catch (error) {
        logError('manageRepository', error, { state });
        return {
            ...state,
            repo: { name: "mock-repo", url: "http://mock-repo.com" }
        };
    }
};

// Helper function to generate comprehensive README content
const generateReadmeContent = (projectSpec, repo) => {
    const features = projectSpec.features || [];
    const techStack = projectSpec.techStack || [];
    const timeline = projectSpec.timeline || 'TBD';
    const description = projectSpec.description || '';
    const targetAudience = projectSpec.targetAudience || 'Developers';

    return `# ${projectSpec.title}
                ${description ? `${description}\n\n` : ''}## 🎯 Project Overview
                This is a ${projectSpec.complexity?.toLowerCase() || 'intermediate'} ${projectSpec.type?.toLowerCase() || 'software'} project designed for ${targetAudience}.

                ## ✨ Features
                ${features.map(f => `- ${f}`).join('\n')}

                ## 🛠️ Tech Stack
                ${techStack.join(', ')}

                ## 📅 Timeline
                ${timeline}

                ## 🚀 Getting Started

                ### Prerequisites
                - Node.js (if applicable)
                - Required dependencies

                ### Installation
                \`\`\`bash
                git clone ${repo.html_url}
                cd ${repo.name}
                npm install  # or appropriate package manager command
                \`\`\`

                ### Usage
                \`\`\`bash
                npm start  # or appropriate start command
                \`\`\`

                ## 📝 License
                This project is licensed under the MIT License.

                ## 🤝 Contributing
                Contributions are welcome! Please feel free to submit a Pull Request.

                ---
                *Generated by AI Git Agent Team*`;
};

// Helper function to validate and normalize file paths
const normalizeFilePath = (filePath, taskTitle) => {
    let normalizedPath = filePath
        .replace(/^\/+/, '') // Remove leading slashes
        .replace(/\/+/g, '/') // Normalize multiple slashes
        .replace(/^\.\//, '') // Remove leading ./
        .trim();

    // Handle directory paths by creating appropriate files
    if (normalizedPath.endsWith('/') || normalizedPath === 'root' || normalizedPath === 'frontend' || normalizedPath === 'backend') {
        if (normalizedPath === 'root' || normalizedPath === '') {
            normalizedPath = 'README.md';
        } else if (normalizedPath === 'frontend') {
            normalizedPath = 'frontend/package.json';
        } else if (normalizedPath === 'backend') {
            normalizedPath = 'backend/package.json';
        } else {
            normalizedPath = normalizedPath.replace(/\/$/, '') + '/index.js';
        }
    }

    // Ensure the path has a proper file extension
    if (!normalizedPath.includes('.')) {
        normalizedPath = `${normalizedPath}.js`;
    }

    // Validate the final path - ensure no double slashes
    normalizedPath = normalizedPath.replace(/\/+/g, '/');

    // Remove any leading/trailing slashes
    normalizedPath = normalizedPath.replace(/^\/+|\/+$/g, '');

    // Validate the final path
    if (normalizedPath.length === 0) {
        normalizedPath = `src/${taskTitle.toLowerCase().replace(/\s+/g, '-')}.js`;
    }

    return normalizedPath;
};

export const developCode = async (state) => {
    try {
        // Validate input state
        validateState(state, ['projectSpec', 'plan']);

        const model = chatLLM();
        const parser = new StringOutputParser();

        // Parse and validate inputs
        let projectSpec, plan;
        try {
            projectSpec = JSON.parse(state.projectSpec);
            plan = JSON.parse(state.plan);
        } catch (parseError) {
            logError('developCode', parseError, { projectSpec: state.projectSpec, plan: state.plan });
            return {
                ...state,
                commits: [{
                    message: "Mock commit: Invalid input",
                    files: [{ path: "server/error.js", content: "// Invalid projectSpec or plan" }]
                }]
            };
        }

        // Validate repository
        if (!state.repo || !state.repo.name || !state.repo.url || state.repo.name === "mock-repo") {
            logError('developCode', new Error('No valid repository found'), { repo: state.repo });
            return {
                ...state,
                commits: [{
                    message: "Mock commit: No repository",
                    files: [{ path: "server/error.js", content: "// No repository available" }]
                }]
            };
        }

        const github = new Octokit({ auth: process.env.GITHUB_TOKEN });
        const { data: user } = await github.users.getAuthenticated();
        const owner = user.login;

        const commits = [];

        // Process tasks with enhanced error handling
        for (const task of plan.tasks) {
            try {
                console.log(`Processing task: ${task.title} (${task.filePath})`);

                // Enhanced code generation prompt
                const prompt = `You are an expert developer specializing in ${projectSpec.type} projects. Generate production-ready code for the following task:
                                Project Context:
                                - Type: ${projectSpec.type}
                                - Tech Stack: ${projectSpec.techStack.join(", ")}
                                - Complexity: ${projectSpec.complexity}

                                Task Details:
                                - Title: ${task.title}
                                            - Description: ${task.description}
                                            - File Path: ${task.filePath}
                                - Priority: ${task.priority || 'medium'}

                                Requirements:
                                - Write clean, well-structured code following best practices
                                - Include appropriate error handling and validation
                                - Follow the project's tech stack and patterns
                                - Ensure the code is functional and implementable
                                - Add helpful comments for complex logic
                                - Consider the project's complexity level

                                Return ONLY the code content - no explanations, markdown, or code block markers.`;

                const response = await model.invoke([["human", prompt]]);
                let codeContent = await parser.parse(response.content);

                // Enhanced code cleaning
                codeContent = codeContent
                    .replace(/```(?:html|css|javascript|json|python|java|cpp|csharp|php|go|rust|swift|kotlin|scala|r|matlab|julia|dart|typescript|jsx|tsx)?\s*/gi, "")
                    .replace(/```/g, "")
                    .trim();

                // Validate and normalize file path
                let fullPath = normalizeFilePath(task.filePath, task.title);
                console.log(`Normalized file path: ${task.filePath} -> ${fullPath}`);

                // Final path validation to prevent malformed paths
                if (fullPath.includes('//') || fullPath.startsWith('/') || fullPath.endsWith('/')) {
                    console.log(`Invalid path detected: ${fullPath}, cleaning up...`);
                    fullPath = fullPath.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
                    console.log(`Cleaned path: ${fullPath}`);
                }

                // Additional safety check - ensure path is not empty
                if (!fullPath || fullPath.length === 0) {
                    console.log(`Empty path after normalization, using fallback path`);
                    fullPath = `src/${task.title.toLowerCase().replace(/\s+/g, '-')}.js`;
                }

                // Check if the file already exists to get its sha
                let sha;
                try {
                    const { data } = await github.rest.repos.getContent({
                        owner: owner,
                        repo: state.repo.name,
                        path: fullPath,
                        branch: "main"
                    });
                    sha = data.sha; // File exists, retrieve its sha
                    console.log(`File exists at ${fullPath}, will update`);
                } catch (error) {
                    if (error.status === 404) {
                        sha = undefined; // File doesn't exist, proceed to create it
                        console.log(`File doesn't exist at ${fullPath}, will create new`);
                    } else if (error.status === 400) {
                        // Bad request - likely trying to access a directory or invalid path
                        console.log(`Skipping invalid path: ${fullPath}, creating file instead`);
                        sha = undefined;
                    } else if (error.status === 403) {
                        // Forbidden - repository access issues
                        console.log(`Access denied for path: ${fullPath}, skipping task`);
                        continue;
                    } else if (error.status === 422) {
                        // Unprocessable entity - malformed path
                        console.log(`Malformed path detected: ${fullPath}, attempting to fix...`);
                        // Try to fix the path by cleaning it up
                        const fixedPath = fullPath.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
                        if (fixedPath !== fullPath) {
                            console.log(`Fixed path: ${fullPath} -> ${fixedPath}`);
                            fullPath = fixedPath;
                            sha = undefined;
                        } else {
                            console.log(`Could not fix path: ${fullPath}, skipping task`);
                            continue;
                        }
                    } else if (error.status >= 500) {
                        // Server errors - retry once
                        console.log(`GitHub server error for path: ${fullPath}, retrying...`);
                        try {
                            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                            const { data } = await github.rest.repos.getContent({
                                owner: owner,
                                repo: state.repo.name,
                                path: fullPath,
                                branch: "main"
                            });
                            sha = data.sha;
                        } catch (retryError) {
                            console.log(`Retry failed for path: ${fullPath}, creating new file`);
                            sha = undefined;
                        }
                    } else {
                        // Other errors - log and continue
                        console.log(`Unexpected error for path: ${fullPath}: ${error.status} - ${error.message}`);
                        sha = undefined;
                    }
                }

                // Commit the file with meaningful message
                const commitMessage = `feat: ${task.title} implementation`;

                // Retry mechanism for file operations
                let fileOperationSuccess = false;
                let retryCount = 0;
                const maxRetries = 3;

                while (!fileOperationSuccess && retryCount < maxRetries) {
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
                        fileOperationSuccess = true;
                    } catch (fileError) {
                        retryCount++;

                        // Handle specific error types
                        if (fileError.status === 422) {
                            // Malformed path - try to fix it
                            console.log(`Malformed path in file operation: ${fullPath}`);
                            const fixedPath = fullPath.replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
                            if (fixedPath !== fullPath) {
                                console.log(`Attempting to fix path: ${fullPath} -> ${fixedPath}`);
                                fullPath = fixedPath;
                                // Reset retry count since we're trying a new path
                                retryCount = 0;
                                continue;
                            } else {
                                console.log(`Could not fix malformed path: ${fullPath}`);
                                throw fileError; // Give up if we can't fix it
                            }
                        }

                        if (retryCount >= maxRetries) {
                            throw fileError; // Give up after max retries
                        }

                        console.log(`File operation failed for ${fullPath}, retrying (${retryCount}/${maxRetries})...`);
                        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount)); // Exponential backoff
                    }
                }

                commits.push({
                    message: commitMessage,
                    files: [{ path: fullPath, content: codeContent }]
                });

                console.log(`Successfully committed: ${fullPath}`);

            } catch (taskError) {
                logError('developCode', taskError, { task, projectSpec });

                // Continue with other tasks instead of failing completely
                commits.push({
                    message: `Error: Failed to implement ${task.title}`,
                    files: [{ path: `server/error-${task.title.toLowerCase().replace(/\s+/g, '-')}.js`, content: `// Error implementing ${task.title}: ${taskError.message}` }]
                });

                console.log(`Task failed: ${task.title}, continuing with next task`);
            }
        }

        return { ...state, commits };
    } catch (error) {
        logError('developCode', error, { state });
        return {
            ...state,
            commits: [{
                message: "Mock commit: Error in code generation",
                files: [{ path: "server/error.js", content: "// Error generating code" }]
            }]
        };
    }
};

export const notifyStatus = async (state) => {
    try {
        // Validate input state
        validateState(state, ['repo', 'commits']);

        if (!process.env.SLACK_TOKEN) {
            logError('notifyStatus', new Error('SLACK_TOKEN not found'), { state });
            return { ...state };
        }

        const slack = new WebClient(process.env.SLACK_TOKEN);

        // Enhanced notification message with more details
        const projectSpec = state.projectSpec ? JSON.parse(state.projectSpec) : {};
        const commitCount = state.commits?.length || 0;
        const repoName = state.repo?.name || 'Unknown';
        const repoUrl = state.repo?.url || '#';

        const message = `🚀 *Project Update: ${repoName}*
                            📊 *Status Summary:*
                            • Commits: ${commitCount}
                            • Project Type: ${projectSpec.type || 'Unknown'}
                            • Complexity: ${projectSpec.complexity || 'Unknown'}
                            • Status: ${commitCount > 0 ? 'In Progress' : 'Initialized'}

                            🔗 *Repository:* ${repoUrl}

                            ${commitCount > 0 ? `📝 *Recent Commits:*
                            ${state.commits.slice(-3).map(commit => `• ${commit.message}`).join('\n')}` : ''}

                            ---
                            *Generated by AI Git Agent Team*`;

        await slack.chat.postMessage({
            channel: process.env.SLACK_CHANNEL || '#general',
            text: message,
            unfurl_links: false
        });

        console.log(`Slack notification sent for ${repoName}`);
        return { ...state };
    } catch (error) {
        logError('notifyStatus', error, { state });
        return { ...state };
    }
};

export const ensureQuality = async (state) => {
    try {
        // Validate input state
        validateState(state, ['commits', 'projectSpec']);

        const projectSpec = JSON.parse(state.projectSpec);
        const commits = state.commits || [];

        // Enhanced quality assessment
        let qualityScore = 100;
        const issues = [];

        // Check commit message quality
        commits.forEach(commit => {
            if (commit.message.length < 10) {
                qualityScore -= 5;
                issues.push("Commit message too short");
            }
            if (commit.message.includes("Error:") || commit.message.includes("Mock commit:")) {
                qualityScore -= 15;
                issues.push("Error in commit detected");
            }
        });

        // Check project specification completeness
        if (!projectSpec.features || projectSpec.features.length === 0) {
            qualityScore -= 10;
            issues.push("Missing project features");
        }

        if (!projectSpec.techStack || projectSpec.techStack.length === 0) {
            qualityScore -= 10;
            issues.push("Missing tech stack specification");
        }

        // Ensure score doesn't go below 0
        qualityScore = Math.max(0, qualityScore);

        // Add quality recommendations
        const recommendations = [];
        if (qualityScore < 80) {
            recommendations.push("Review commit messages for clarity");
        }
        if (qualityScore < 70) {
            recommendations.push("Check for implementation errors");
        }

        return {
            ...state,
            qualityReport: JSON.stringify({
                score: qualityScore,
                issues: issues.length > 0 ? issues : ["No major issues detected"],
                recommendations,
                timestamp: new Date().toISOString()
            })
        };
    } catch (error) {
        logError('ensureQuality', error, { state });
        return {
            ...state,
            qualityReport: JSON.stringify({
                score: 0,
                issues: ["Error in quality assessment"],
                recommendations: ["Check system logs"],
                timestamp: new Date().toISOString()
            })
        };
    }
};

export const manageContent = async (state) => {
    try {
        // Validate input state
        validateState(state, ['projectSpec', 'repo']);

        const projectSpec = JSON.parse(state.projectSpec);
        const repo = state.repo;

        // Enhanced documentation generation
        const documentation = generateEnhancedDocumentation(projectSpec, repo);

        return { ...state, documentation };
    } catch (error) {
        logError('manageContent', error, { state });
        return { ...state, documentation: "# Error: Could not generate documentation" };
    }
};

// Helper function for enhanced documentation
const generateEnhancedDocumentation = (projectSpec, repo) => {
    const features = projectSpec.features || [];
    const techStack = projectSpec.techStack || [];
    const timeline = projectSpec.timeline || 'TBD';
    const description = projectSpec.description || '';
    const targetAudience = projectSpec.targetAudience || 'Developers';

    return `# ${projectSpec.title}
            ${description ? `${description}\n\n` : ''}## 🎯 Project Overview
            This is a ${projectSpec.complexity?.toLowerCase() || 'intermediate'} ${projectSpec.type?.toLowerCase() || 'software'} project designed for ${targetAudience}.

            ## ✨ Features
            ${features.map(f => `- ${f}`).join('\n')}

            ## 🛠️ Tech Stack
            ${techStack.join(', ')}

            ## 📅 Timeline
            ${timeline}

            ## 🚀 Getting Started

            ### Prerequisites
            - Node.js (if applicable)
            - Required dependencies

            ### Installation
            \`\`\`bash
            git clone ${repo.html_url}
            cd ${repo.name}
            npm install  # or appropriate package manager command
            \`\`\`

            ### Usage
            \`\`\`bash
            npm start  # or appropriate start command
            \`\`\`

            ## 📝 License
            This project is licensed under the MIT License.

            ## 🤝 Contributing
            Contributions are welcome! Please feel free to submit a Pull Request.

            ## 📚 Additional Resources
            - Project Repository: ${repo.url}
            - Issue Tracker: ${repo.url}/issues
            - Pull Requests: ${repo.url}/pulls

            ---
            *Generated by AI Git Agent Team*`;
};

export const optimizeLearning = async (state) => {
    try {
        // Validate input state
        validateState(state, ['qualityReport', 'commits']);

        const qualityReport = state.qualityReport ? JSON.parse(state.qualityReport) : {};
        const commits = state.commits || [];

        // Enhanced learning metrics calculation
        const avgScore = qualityReport.score || 0;
        const commitCount = commits.length;
        const errorCommits = commits.filter(c => c.message.includes('Error:') || c.message.includes('Mock commit:')).length;
        const successRate = commitCount > 0 ? ((commitCount - errorCommits) / commitCount) * 100 : 100;

        // Learning insights
        const insights = [];
        if (avgScore < 70) {
            insights.push("Focus on improving code quality");
        }
        if (errorCommits > 0) {
            insights.push("Review error handling in commits");
        }
        if (successRate < 80) {
            insights.push("Improve task implementation success rate");
        }

        // Performance trends
        const performanceTrend = avgScore > 80 ? "improving" : avgScore > 60 ? "stable" : "needs attention";

        return {
            ...state,
            learningMetrics: {
                avgScore,
                commitCount,
                successRate: Math.round(successRate * 100) / 100,
                errorRate: Math.round((errorCommits / Math.max(commitCount, 1)) * 100 * 100) / 100,
                insights: insights.length > 0 ? insights : ["All metrics within acceptable ranges"],
                performanceTrend,
                timestamp: new Date().toISOString()
            }
        };
    } catch (error) {
        logError('optimizeLearning', error, { state });
        return {
            ...state,
            learningMetrics: {
                avgScore: 0,
                commitCount: 0,
                successRate: 0,
                errorRate: 100,
                insights: ["Error in learning analysis"],
                performanceTrend: "unknown",
                timestamp: new Date().toISOString()
            }
        };
    }
};