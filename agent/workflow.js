import { StateGraph, START, END } from "@langchain/langgraph";
import { z } from "zod";
import { Octokit } from "@octokit/rest";
import { generateIdea, manageRepository, planProject } from "./agents.js";
import { developNextTask } from "./developmentAgent.js";
import memoryService from "../services/memoryService.js";
import notificationService from "../services/notificationService.js";

// Define the state schema for the graph
const stateSchema = z.object({
    projectName: z.string().nullable().optional().describe("Specific project name/idea provided by user (can be null for random project)"),
    description: z.string().nullable().optional().describe("Additional description or context about what the user wants to create"),
    complexity: z.string().describe("Complexity level of the project (e.g., beginner, intermediate, advanced)"),
    techConstraints: z.array(z.string()).describe("Technological constraints or preferences for the project"),
    projectSpec: z.string().nullable().describe("Generated project specification in JSON format"),
    plan: z.string().nullable().describe("Detailed implementation plan in JSON format"),
    repo: z.object({ name: z.string(), url: z.string() }).nullable().describe("Repository details"),
    commits: z.array(z.any()).nullable().describe("List of commit details"),
    qualityReport: z.string().nullable().describe("Code quality report in JSON format"),
    documentation: z.string().nullable().describe("Project documentation including README"),
    learningMetrics: z.any().nullable().describe("Learning and optimization metrics"),
    currentTask: z.string().nullable().describe("Current task being processed"),
    remainingTasks: z.number().nullable().describe("Number of remaining tasks"),
    githubToken: z.string().nullable().optional().describe("GitHub token used for this run (supports multi-account)")
});

// Create initial setup graph (idea → plan → repo setup)
const initialSetupGraph = new StateGraph(stateSchema)
    .addNode("generateIdea", generateIdea)
    .addNode("planProject", planProject)
    .addNode("manageRepository", manageRepository)
    .addEdge(START, "generateIdea")
    .addEdge("generateIdea", "planProject")
    .addEdge("planProject", "manageRepository")
    .addEdge("manageRepository", END);

// Compile the initial setup graph
const compiledInitialGraph = initialSetupGraph.compile();

// Orchestrator class for running the workflow with episodic memory
class AgentOrchestrator {
    constructor (config) {
        this.config = config;
        this.compiledInitialGraph = compiledInitialGraph;
    }

    // Run initial cycle: idea → plan → repo setup
    async runInitialCycle(input) {
        try {
            console.log("🚀 Starting initial project setup cycle...");

            const initialState = {
                projectName: input.projectName ?? null,
                description: input.description || null,
                complexity: input.complexity || "beginner",
                techConstraints: input.techConstraints || ["Node.js"],
                projectSpec: null,
                plan: null,
                repo: null,
                commits: null,
                qualityReport: null,
                documentation: null,
                learningMetrics: null,
                currentTask: null,
                remainingTasks: null,
                githubToken: input.githubToken ?? null
            };

            const result = await this.compiledInitialGraph.invoke(initialState);

            // Save project plan to memory for future development cycles
            if (result.plan) {
                try {
                    const plan = JSON.parse(result.plan);
                    await memoryService.saveProjectPlan(plan, result.projectSpec);
                    console.log(`📋 Saved ${plan.tasks?.length || 0} tasks to memory`);
                } catch (error) {
                    console.error("Error saving plan to memory:", error);
                }
            }

            // Save repository information to memory (only for single-account mode)
            // For multi-account mode, each account has its own repo, so we don't overwrite memory
            if (result.repo && !input.githubToken) {
                try {
                    await memoryService.saveRepositoryInfo(result.repo);
                    console.log(`📁 Saved repository info: ${result.repo.name}`);
                } catch (error) {
                    console.error("Error saving repository info to memory:", error);
                }
            } else if (result.repo && input.githubToken) {
                // Multi-account mode: log but don't save to shared memory
                const github = new Octokit({ auth: input.githubToken });
                const { data: user } = await github.users.getAuthenticated();
                console.log(`📁 [Account: ${user.login}] Repository: ${result.repo.name} (not saved to shared memory)`);
            }

            // Send project start notification
            try {
                await notificationService.sendProjectStartNotification({
                    projectName: input.projectName || "AI Generated Project",
                    complexity: input.complexity || "beginner",
                    techStack: input.techConstraints || ["Node.js"],
                    repo: result.repo
                });
            } catch (notifyError) {
                console.warn("⚠️ Failed to send project start notification:", notifyError.message);
            }

            // Mark initialization as complete
            await memoryService.saveInitializationStatus("done");
            console.log("✅ Initial project setup completed and saved to memory");

            return result;
        } catch (error) {
            console.error('Initial cycle error:', error);
            throw error;
        }
    }

    // Run daily development cycle: generate next task → commit
    async runDailyCycle(githubToken = null) {
        try {
            console.log("🔄 Starting daily development cycle...");

            // Check if project is initialized
            const isInitialized = await memoryService.isProjectInitialized();
            if (!isInitialized) {
                console.log("⚠️ Project not initialized. Run initial cycle first.");
                return { status: "Project not initialized" };
            }

            // Check if project is completed
            const isCompleted = await memoryService.isProjectCompleted();
            if (isCompleted) {
                console.log("🎉 Project already completed. No more tasks.");
                return { status: "Project completed" };
            }

            // Get project state from memory using the new methods
            const projectSpec = await memoryService.getProjectSpec();
            const remainingTasks = await memoryService.getRemainingTasks();

            console.log(`📋 Found ${remainingTasks.length} remaining tasks`);
            console.log(`📋 Project spec: ${projectSpec ? 'Available' : 'Not found'}`);

            // Check if we have the project spec and at least some tasks
            if (!projectSpec) {
                console.log("⚠️ No project spec found in memory");
                return { status: "No project spec available" };
            }

            // If no remaining tasks, try to get the original plan from memory
            if (!remainingTasks || remainingTasks.length === 0) {
                console.log("🔄 No remaining tasks, checking original plan...");
                const memory = await memoryService.loadMemoryVariables();

                // Try to find the original plan in memory
                let originalPlanFound = false;
                for (const step of memory.past_steps || []) {
                    const stepContent = step.content || '';
                    if (stepContent.includes("remainingTasks")) {
                        try {
                            const parsed = JSON.parse(stepContent);
                            if (parsed.remainingTasks && Array.isArray(parsed.remainingTasks) && parsed.remainingTasks.length > 0) {
                                console.log(`📋 Found original plan with ${parsed.remainingTasks.length} tasks, resetting remaining tasks`);
                                await memoryService.updateRemainingTasks(parsed.remainingTasks);
                                originalPlanFound = true;
                                break;
                            }
                        } catch (parseError) {
                            console.log("Could not parse original plan from memory");
                        }
                    }
                }

                if (originalPlanFound) {
                    console.log("🔄 Restarting cycle with reset tasks...");
                    return await this.runDailyCycle(); // Recursive call with reset tasks
                } else {
                    console.log("🎉 No more tasks available - project truly completed");
                    await memoryService.markProjectCompleted();
                    return { status: "Project completed" };
                }
            }

            // Log current state for debugging
            console.log(`🔍 Current workflow state:`);
            console.log(`   - Remaining tasks: ${remainingTasks.length}`);
            console.log(`   - Next task: ${remainingTasks[0]?.title || 'None'}`);
            console.log(`   - Project spec available: ${!!projectSpec}`);

            // For multi-account support: each account needs its own repo
            // If githubToken is provided, we need to find/create repo for that specific account
            let repo;
            if (githubToken) {
                // Multi-account mode: find or create repo for this specific account
                const github = new Octokit({ auth: githubToken });
                const { data: user } = await github.users.getAuthenticated();
                const owner = user.login;

                // Get repo name from project spec
                let projectSpecObj;
                try {
                    projectSpecObj = typeof projectSpec === 'string' ? JSON.parse(projectSpec) : projectSpec;
                } catch (e) {
                    projectSpecObj = { title: "new-project" };
                }

                const repoName = (projectSpecObj.title || "new-project")
                    .toLowerCase()
                    .replace(/[^a-z0-9\s-]/g, '')
                    .replace(/\s+/g, '-')
                    .replace(/-+/g, '-')
                    .replace(/^-|-$/g, '')
                    .substring(0, 100);

                try {
                    // Try to get existing repo for this account
                    const { data: existingRepo } = await github.repos.get({
                        owner,
                        repo: repoName
                    });
                    repo = {
                        name: existingRepo.name,
                        url: existingRepo.html_url
                    };
                    console.log(`📁 [Account: ${owner}] Found existing repository: ${repo.name}`);
                } catch (error) {
                    if (error.status === 404) {
                        // Repo doesn't exist for this account, create it
                        const repoDescription = `A ${projectSpecObj.complexity?.toLowerCase() || 'intermediate'} ${projectSpecObj.type?.toLowerCase() || 'software'} project: ${projectSpecObj.title}.`;
                        const { data: newRepo } = await github.repos.createForAuthenticatedUser({
                            name: repoName,
                            description: repoDescription,
                            private: false,
                            auto_init: false,
                            gitignore_template: 'Node',
                            license_template: 'mit'
                        });
                        repo = {
                            name: newRepo.name,
                            url: newRepo.html_url
                        };
                        console.log(`📁 [Account: ${owner}] Created new repository: ${repo.name}`);
                    } else {
                        throw error;
                    }
                }
            } else {
                // Single-account mode: use repo from memory
                repo = await memoryService.getRepositoryInfo();
                if (!repo) {
                    // Generate new repository name based on project spec
                    let projectSpecObj;
                    try {
                        projectSpecObj = typeof projectSpec === 'string' ? JSON.parse(projectSpec) : projectSpec;
                    } catch (e) {
                        projectSpecObj = { title: "new-project" };
                    }
                    const repoName = (projectSpecObj.title || "new-project")
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, '-');
                    repo = {
                        name: process.env.GITHUB_REPO_NAME || repoName,
                        url: process.env.GITHUB_REPO_URL || `https://github.com/yourusername/${repoName}`
                    };
                    console.log(`📁 Generated new repository: ${repo.name}`);
                    await memoryService.saveRepositoryInfo(repo);
                } else {
                    console.log(`📁 Found repository in memory: ${repo.name}`);
                }
            }

            const state = {
                projectSpec,
                plan: { tasks: remainingTasks },
                repo,
                githubToken: githubToken ?? null
            };

            console.log(`🔄 Running development agent for next task...`);
            // Run development agent for next task
            const result = await developNextTask(state);

            console.log(`✅ Daily cycle completed. Task: ${result.currentTask}`);
            return result;
        } catch (error) {
            console.error('Daily cycle error:', error);
            throw error;
        }
    }

    // Legacy method for backward compatibility
    async runCycle(input) {
        console.log("⚠️ Using legacy runCycle. Consider using runInitialCycle for new projects.");
        return await this.runInitialCycle(input);
    }
}

export default AgentOrchestrator;