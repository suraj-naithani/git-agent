import { Octokit } from "@octokit/rest";
import { WebClient } from "@slack/web-api";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { chatLLM } from "../utils/model.js";

export const generateIdea = async (state) => {
    try {
        const model = chatLLM({ json: true });

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
        const model = chatLLM({ json: true });

        const prompt = `You are a project planner. Create a detailed implementation plan for the project: ${state.projectSpec}.
                        STRICTLY return only valid JSON, no markdown, no explanations.
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

        let repoDescription = `A ${projectSpec.complexity.toLowerCase()} ${projectSpec.type.toLowerCase()} project: ${projectSpec.title}. Built with ${projectSpec.techStack.join(', ')}.`;
        if (repoDescription.length > 350) {
            repoDescription = repoDescription.substring(0, 347) + '...';
        }

        // Get authenticated user's username
        const { data: user } = await github.users.getAuthenticated();
        const owner = user.login;

        let repo;
        try {
            const { data: existingRepo } = await github.repos.get({
                owner,
                repo: repoName
            });
            console.log(`Repository ${repoName} already exists. Using existing repository.`);
            repo = existingRepo;
        } catch (error) {
            if (error.status === 404) {
                repo = (await github.repos.createForAuthenticatedUser({
                    name: repoName,
                    description: repoDescription,
                    private: false
                })).data;
            } else {
                throw error;
            }
        }

        const readmeContent = `# ${projectSpec.title}\n\n${repoDescription}\n\n## Features\n${projectSpec.features.map(f => `- ${f}`).join('\n')}\n\n## Tech Stack\n${projectSpec.techStack.join(', ')}\n\n## Timeline\n${projectSpec.timeline}\n\n## Getting Started\nClone the repository and install dependencies:\n\`\`\`bash\ngit clone ${repo.html_url}\ncd ${repo.name}\nnpm install\n\`\`\``;

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
            message: readmeSha ? "Update README" : "Initial commit: Add README",
            content: Buffer.from(readmeContent).toString("base64"),
            branch: "main",
            sha: readmeSha
        });

        return { ...state, repo: { name: repo.name, url: repo.html_url } };
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
        const model = chatLLM();
        const parser = new StringOutputParser();

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
                    files: [{ path: "server/error.js", content: "// Invalid projectSpec or plan" }]
                }]
            };
        }

        if (!state.repo || !state.repo.name || !state.repo.url || state.repo.name === "mock-repo") {
            console.error("Error: No valid repository found");
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
        for (const task of plan.tasks) {
            const prompt = `You are an expert developer. Generate code for the following task in a ${projectSpec.type} project using ${projectSpec.techStack.join(", ")}:
            - Task: ${task.title}
            - Description: ${task.description}
            - File Path: ${task.filePath}
            Ensure the code follows best practices, is functional, and matches the project's tech stack. Return only the code content, no explanations, markdown, or code block markers (e.g., no \`\`\`html, \`\`\`css, \`\`\`javascript).`;

            const response = await model.invoke([["human", prompt]]);
            let codeContent = await parser.parse(response.content);

            // Custom cleaning to remove any remaining code block markers
            codeContent = codeContent
                .replace(/```(?:html|css|javascript|json)?\s*/g, "")
                .replace(/```/g, "")
                .trim();

            // Ensure file path is within server/ directory for backend files
            const fullPath = task.filePath.replace(/^\/+/, '').replace(/\/+/g, '/');

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
            } catch (error) {
                if (error.status === 404) {
                    sha = undefined; // File doesn't exist, proceed to create it
                } else {
                    throw error; // Other errors should be propagated
                }
            }

            await github.rest.repos.createOrUpdateFileContents({
                owner: owner,
                repo: state.repo.name,
                path: fullPath,
                message: `Add ${task.title} implementation`,
                content: Buffer.from(codeContent).toString("base64"),
                branch: "main",
                sha: sha // Include sha if file exists, undefined if creating new
            });

            commits.push({
                message: `Add ${task.title} implementation`,
                files: [{ path: fullPath, content: codeContent }]
            });
        }

        return { ...state, commits };
    } catch (error) {
        console.error("Error in developCode:", error);
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