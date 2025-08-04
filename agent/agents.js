import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Octokit } from "@octokit/rest";
import { WebClient } from "@slack/web-api";

export const generateIdea = async (state) => {
    try {
        if (!process.env.GOOGLE_API_KEY) {
            console.error("Error: GOOGLE_API_KEY not found");
            return {
                ...state,
                projectSpec: JSON.stringify({
                    title: "Mock Project (No API Key)",
                    type: "Web App",
                    complexity: state.complexity,
                    techStack: state.techConstraints,
                    features: ["Feature 1", "Feature 2"],
                    timeline: "2 weeks"
                })
            };
        }

        const model = new ChatGoogleGenerativeAI({
            model: "gemini-1.5-flash",
            apiKey: process.env.GOOGLE_API_KEY,
            responseFormat: "json"
        });
        const prompt = `You are an expert software architect. Generate one creative software project idea in JSON format.
                        Constraints:
                        - Complexity: ${state.complexity}
                        - Tech Stack: ${state.techConstraints.join(", ") || "No constraints"}
                        Return JSON:
                        {
                          "title": "Project Name",
                          "type": "Web App | CLI Tool | API | etc.",
                          "complexity": "Beginner | Intermediate | Advanced",
                          "techStack": ["..."],
                          "features": ["..."],
                          "timeline": "..."
                        }`;

        const response = await model.invoke([["human", prompt]]);
        const cleaned = response.content.replace(/```json|```/g, "").trim();
        return { ...state, projectSpec: cleaned };
    } catch (error) {
        console.error("Error in generateIdea:", error);
        return {
            ...state,
            projectSpec: JSON.stringify({
                title: "Error Project",
                type: "Web App",
                complexity: state.complexity,
                techStack: state.techConstraints,
                features: ["Feature 1", "Feature 2"],
                timeline: "2 weeks"
            })
        };
    }
};

export const planProject = async (state) => {
    try {
        if (!process.env.GOOGLE_API_KEY) {
            console.error("Error: GOOGLE_API_KEY not found");
            return {
                ...state,
                plan: JSON.stringify({
                    tasks: [
                        { title: "Mock Task", description: "Placeholder task", filePath: "src/mock.js" }
                    ],
                    timeline: "1 week",
                    dependencies: []
                })
            };
        }

        const model = new ChatGoogleGenerativeAI({
            model: "gemini-1.5-flash",
            apiKey: process.env.GOOGLE_API_KEY,
            responseFormat: "json"
        });

        const prompt = `You are a project planner. Create a detailed implementation plan for the project: ${state.projectSpec}.
                        Return JSON:
                        {
                          "tasks": [{"title": "Task Name", "description": "Task Description", "filePath": "path/to/file"}],
                          "timeline": "Estimated timeline",
                          "dependencies": ["..."]
                        }`;

        const response = await model.invoke([["human", prompt]]);
        const cleaned = response.content.replace(/```json|```/g, "").trim();
        return { ...state, plan: cleaned };
    } catch (error) {
        console.error("Error in planProject:", error);
        return {
            ...state,
            plan: JSON.stringify({
                tasks: [],
                timeline: "1 week",
                dependencies: []
            })
        };
    }
};

export const manageRepository = async (state) => {
    try {
        if (!process.env.GITHUB_TOKEN) {
            console.error("Error: GITHUB_TOKEN not found");
            return {
                ...state,
                repo: { name: "mock-repo", url: "http://mock-repo.com" }
            };
        }

        const github = new Octokit({ auth: process.env.GITHUB_TOKEN });
        let projectSpec;
        try {
            projectSpec = JSON.parse(state.projectSpec);
        } catch (e) {
            console.error("Invalid projectSpec JSON:", state.projectSpec);
            return { ...state, repo: { name: "mock-repo", url: "http://mock-repo.com" } };
        }

        const repoName = projectSpec.title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .substring(0, 100); // GitHub repo name limit

        const repoDescription = `A ${projectSpec.complexity.toLowerCase()} ${projectSpec.type.toLowerCase()} project: ${projectSpec.title}. Built with ${projectSpec.techStack.join(', ')}.`;

        // Get authenticated user's username
        const { data: user } = await github.users.getAuthenticated();
        const owner = user.login;

        const repo = await github.repos.createForAuthenticatedUser({
            name: `${repoName}`,
            description: repoDescription,
            private: false
        });

        const readmeContent = `# ${projectSpec.title}\n\n${repoDescription}\n\n## Features\n${projectSpec.features.map(f => `- ${f}`).join('\n')}\n\n## Tech Stack\n${projectSpec.techStack.join(', ')}\n\n## Timeline\n${projectSpec.timeline}\n\n## Getting Started\nClone the repository and install dependencies:\n\`\`\`bash\ngit clone ${repo.data.html_url}\ncd ${repo.data.name}\nnpm install\n\`\`\``;

        await github.rest.repos.createOrUpdateFileContents({
            owner: owner,
            repo: repo.data.name,
            path: "README.md",
            message: "Initial commit: Add README",
            content: Buffer.from(readmeContent).toString("base64"),
            branch: "main"
        });

        return { ...state, repo: { name: repo.data.name, url: repo.data.html_url } };
    } catch (error) {
        console.error("Error in manageRepository:", error);
        return {
            ...state,
            repo: { name: "mock-repo", url: "http://mock-repo.com" }
        };
    }
};

export const developCode = async (state) => {
    try {
        if (!process.env.GOOGLE_API_KEY || !process.env.GITHUB_TOKEN) {
            console.error("Error: GOOGLE_API_KEY or GITHUB_TOKEN not found");
            return {
                ...state,
                commits: [{
                    message: "Mock commit: Placeholder code",
                    files: [{ path: "src/mock.js", content: "// Placeholder code" }]
                }]
            };
        }

        let projectSpec, plan;
        try {
            projectSpec = JSON.parse(state.projectSpec);
            plan = JSON.parse(state.plan);
        } catch (e) {
            console.error("Invalid projectSpec or plan JSON:", e);
            return {
                ...state,
                commits: [{
                    message: "Mock commit: Invalid input",
                    files: [{ path: "src/error.js", content: "// Invalid projectSpec or plan" }]
                }]
            };
        }

        if (!state.repo || !state.repo.name || !state.repo.url) {
            console.error("Error: No valid repository found");
            return {
                ...state,
                commits: [{
                    message: "Mock commit: No repository",
                    files: [{ path: "src/error.js", content: "// No repository available" }]
                }]
            };
        }

        const github = new Octokit({ auth: process.env.GITHUB_TOKEN });
        const { data: user } = await github.users.getAuthenticated();
        const owner = user.login;

        const model = new ChatGoogleGenerativeAI({
            model: "gemini-1.5-flash",
            apiKey: process.env.GOOGLE_API_KEY
        });

        const commits = [];
        for (const task of plan.tasks) {
            const prompt = `You are an expert developer. Generate code for the following task in a ${projectSpec.type} project using ${projectSpec.techStack.join(", ")}:
            - Task: ${task.title}
            - Description: ${task.description}
            - File Path: ${task.filePath}
            Ensure the code follows best practices, is functional, and matches the project's tech stack. Return only the code content, no explanations or markdown.`;

            const response = await model.invoke([["human", prompt]]);
            const codeContent = response.content.trim();

            await github.rest.repos.createOrUpdateFileContents({
                owner: owner,
                repo: state.repo.name,
                path: task.filePath,
                message: `Add ${task.title} implementation`,
                content: Buffer.from(codeContent).toString("base64"),
                branch: "main"
            });

            commits.push({
                message: `Add ${task.title} implementation`,
                files: [{ path: task.filePath, content: codeContent }]
            });
        }

        return { ...state, commits };
    } catch (error) {
        console.error("Error in developCode:", error);
        return {
            ...state,
            commits: [{
                message: "Mock commit: Error in code generation",
                files: [{ path: "src/error.js", content: "// Error generating code" }]
            }]
        };
    }
};

export const notifyStatus = async (state) => {
    try {
        const slack = new WebClient(process.env.SLACK_TOKEN);
        const message = `Project Update: ${state.repo.name}\nCommits: ${state.commits.length}\nStatus: In Progress`;
        await slack.chat.postMessage({
            channel: process.env.SLACK_CHANNEL,
            text: message
        });
        return { ...state };
    } catch (error) {
        console.error("Error in notifyStatus:", error);
        return { ...state };
    }
};

export const ensureQuality = async (state) => {
    try {
        return {
            ...state,
            qualityReport: JSON.stringify({ score: 85, issues: ["Minor formatting issue"] })
        };
    } catch (error) {
        console.error("Error in ensureQuality:", error);
        return { ...state, qualityReport: JSON.stringify({ score: 0, issues: [] }) };
    }
};

export const manageContent = async (state) => {
    try {
        return { ...state, documentation: "# Mock README\nProject description" };
    } catch (error) {
        console.error("Error in manageContent:", error);
        return { ...state, documentation: "" };
    }
};

export const optimizeLearning = async (state) => {
    try {
        return { ...state, learningMetrics: { avgScore: 85 } };
    } catch (error) {
        console.error("Error in optimizeLearning:", error);
        return { ...state, learningMetrics: {} };
    }
};