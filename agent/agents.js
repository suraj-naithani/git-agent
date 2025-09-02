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

// AI-powered README generation function with retry logic
const generateAIReadme = async (projectSpec, repo) => {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔄 Attempting to generate README (attempt ${attempt}/${maxRetries})...`);

            const model = chatLLM();
            const parser = new StringOutputParser();

            const prompt = `You are a SENIOR TECHNICAL WRITER and SOFTWARE DOCUMENTATION EXPERT with 15+ years of experience at top tech companies. Create a PROFESSIONAL, OPTIMIZED, and ENGAGING README.md file for this project.

                            PROJECT DETAILS:
                            ${JSON.stringify(projectSpec, null, 2)}
                            
                            REPOSITORY: ${repo.name}
                            REPO URL: ${repo.html_url}
                            
                            REQUIREMENTS:
                            1. **PROFESSIONAL FORMATTING**: Use proper Markdown syntax with emojis, badges, and clear sections
                            2. **OPTIMIZED STRUCTURE**: Follow industry best practices for README organization
                            3. **ENGAGING CONTENT**: Make it attractive and informative for developers
                            4. **TECHNICAL ACCURACY**: Ensure all technical details are correct and up-to-date
                            5. **COMPLETE SECTIONS**: Include all essential README sections
                            6. **PRODUCTION READY**: Make it suitable for professional GitHub repositories
                            
                            MANDATORY SECTIONS (in this order):
                            1. **Project Title** - With badges (build status, version, license, etc.)
                            2. **Project Description** - Clear, concise overview
                            3. **Features** - Bullet points of key features
                            4. **Tech Stack** - Organized by frontend/backend/database/etc.
                            5. **Installation** - Setup instructions with bullet points
                            6. **Usage** - How to use the project
                            7. **API Documentation** - If it's an API project
                            8. **Testing** - How to run tests
                            9. **Deployment** - Deployment instructions
                            10. **Contributing** - Guidelines for contributors
                            11. **License** - License information
                            12. **Acknowledgments** - Credits and thanks
                            
                            TECH STACK ORGANIZATION:
                            - Group technologies logically (Frontend, Backend, Database, DevOps, etc.)
                            - Use appropriate icons/emojis for each technology
                            - Include version requirements if critical
                            
                            INSTALLATION INSTRUCTIONS (CRITICAL FORMATTING):
                            - Use bullet points (-) for each step
                            - Put ALL commands in \`\`\`bash code blocks
                            - Each command should be on a separate line
                            - Make it copy-paste friendly
                            - NEVER put commands inline with text
                            - NEVER use "bash" prefix before commands
                            
                            CRITICAL WARNINGS:
                            - NEVER put installation commands inline like "bash git clone" - use proper code blocks
                            - ALWAYS put commands in separate \`\`\`bash code blocks
                            - ALWAYS use bullet points (-) for installation steps
                            
                            Return ONLY the complete README.md content in Markdown format. No explanations, no code blocks, just the raw README content.`;

            const response = await model.invoke([["human", prompt]]);
            let readmeContent = await parser.parse(response.content);

            // Clean up the response
            readmeContent = readmeContent
                .replace(/```(?:markdown|md)?\s*/gi, "")
                .replace(/```/g, "")
                .trim();

            // Validate that we got actual README content
            if (!readmeContent || readmeContent.length < 100) {
                throw new Error('Generated README content is too short');
            }

            // Check if it starts with a proper heading
            if (!readmeContent.startsWith('#')) {
                readmeContent = `# ${projectSpec.title}\n\n${readmeContent}`;
            }

            console.log(`✅ AI-generated README content (${readmeContent.length} characters)`);
            return readmeContent;

        } catch (error) {
            lastError = error;
            console.error(`❌ AI README generation attempt ${attempt} failed:`, error.message);

            if (attempt < maxRetries) {
                console.log(`🔄 Retrying in 2 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    // If all retries failed, throw the last error
    console.error(`❌ All ${maxRetries} attempts to generate README failed`);
    throw new Error(`Failed to generate README after ${maxRetries} attempts: ${lastError.message}`);
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
                        ${state.description ? `\nUSER DESCRIPTION: "${state.description}"\nPlease incorporate this description and context into the project specification.` : ''}

                        Requirements:
                        - ${state.projectName ? `Create a project that matches the name "${state.projectName}"` : 'Ensure the project is feasible and implementable'}
                        - ${state.projectName ? 'Make the project name match exactly what the user requested' : 'Select appropriate tech stack for the complexity level'}
                        - ${state.description ? 'Incorporate the user\'s description and context into the project features and description' : ''}
                        - Create engaging features that demonstrate technical skills
                        - Provide realistic timeline estimates
                        - Choose modern, relevant technologies that work well together
                        - Consider the project's specific needs and requirements

                        ${state.projectName ? `IMPORTANT: The project title MUST be exactly "${state.projectName}" as requested by the user.` : ''}
                        ${state.description ? `IMPORTANT: The project description and features MUST reflect the user's description: "${state.description}"` : ''}

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
                description: state.description || (state.projectName ? `Fallback project for ${state.projectName} due to error` : "Fallback project due to error"),
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

        // Generate README content using AI for better quality
        const readmeContent = await generateAIReadme(projectSpec, repo);

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









