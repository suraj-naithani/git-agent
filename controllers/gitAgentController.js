import { z } from "zod";
import AgentOrchestrator from "../agent/workflow.js";
import memoryService from "../services/memoryService.js";
import { cronScheduler } from "../services/serviceManager.js";
import { getGitHubTokens } from "../utils/githubTokens.js";

const inputSchema = z.object({
    projectName: z.string().nullable().optional().describe("Specific project name/idea to create (can be null for random project)"),
    description: z.string().optional().describe("Additional description or context about what you want the AI to create (optional)"),
    complexity: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
    techConstraints: z.array(z.string()).default(['Node.js', 'MongoDB'])
});

const gitAgent = async (req, res) => {
    try {
        const input = inputSchema.parse(req.body);

        // Resolve all configured GitHub tokens (multi-account support)
        const tokens = getGitHubTokens();
        if (!tokens || tokens.length === 0) {
            return res.status(400).json({
                success: false,
                message: "No GitHub tokens configured. Please set GITHUB_TOKEN or GITHUB_TOKEN_1..N in the environment."
            });
        }

        // Check if this is a new project or continuing existing one
        const isInitialized = await memoryService.isProjectInitialized();
        const isCompleted = await memoryService.isProjectCompleted();

        // If there's a previous project (initialized but not completed), clear memory for new project
        if (isInitialized && !isCompleted) {
            console.log("🔄 Previous project in progress. Clearing memory to start fresh project...");
            await memoryService.clearMemory();
            await memoryService.clearRepositoryInfo();
            console.log("✅ Memory and repository info cleared for new project");
        }

        if (isCompleted) {
            return res.status(200).json({
                success: true,
                data: { status: "Project completed" },
                message: 'Project is already completed'
            });
        }

        const isNewProject = !isInitialized;

        const config = {
            complexityDistribution: ['beginner', 'intermediate', 'advanced'],
            techStacks: input.techConstraints
        };

        const perAccountResults = [];
        let canonicalResult = null;

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const orchestrator = new AgentOrchestrator(config);

            let result;
            if (isNewProject) {
                // First run for this project: initialize project (idea → plan → repo setup)
                console.log(`🚀 [Account ${i + 1}] Running initial project setup cycle...`);

                // Save initial project parameters for auto-restart (only once, on first account)
                if (i === 0) {
                    await memoryService.saveInitialProjectParams(input);
                    console.log("✅ Initial project parameters saved for auto-restart");
                }

                result = await orchestrator.runInitialCycle({
                    projectName: input.projectName,
                    description: input.description,
                    complexity: input.complexity,
                    techConstraints: input.techConstraints,
                    githubToken: token
                });

                // Start cron scheduler only after successful project initialization (once)
                if (i === 0 && result.projectSpec && result.plan && result.repo) {
                    try {
                        await cronScheduler.start();
                        console.log("✅ Cron scheduler started after project initialization");
                    } catch (error) {
                        console.error("❌ Failed to start cron scheduler:", error);
                    }
                }
            } else {
                // Subsequent runs: continue development
                console.log(`🔄 [Account ${i + 1}] Running development cycle...`);

                // Check if cron scheduler is running (once, before first account)
                if (i === 0) {
                    const cronStatus = cronScheduler.getStatus();
                    if (!cronStatus.isRunning) {
                        console.log("⚠️ Cron scheduler not running. Starting it...");
                        try {
                            await cronScheduler.start();
                            console.log("✅ Cron scheduler started");
                        } catch (error) {
                            console.error("❌ Failed to start cron scheduler:", error);
                        }
                    }
                }

                result = await orchestrator.runDailyCycle(token);
            }

            if (!canonicalResult) {
                canonicalResult = result;
            }

            perAccountResults.push({
                tokenIndex: i + 1,
                status: result.status,
                repo: result.repo,
                currentTask: result.currentTask,
                remainingTasks: result.remainingTasks
            });
        }

        res.status(200).json({
            success: true,
            data: {
                projectSpec: canonicalResult?.projectSpec,
                plan: canonicalResult?.plan,
                repo: canonicalResult?.repo,
                commits: canonicalResult?.commits,
                qualityReport: canonicalResult?.qualityReport,
                documentation: canonicalResult?.documentation,
                learningMetrics: canonicalResult?.learningMetrics,
                currentTask: canonicalResult?.currentTask,
                remainingTasks: canonicalResult?.remainingTasks,
                status: canonicalResult?.status,
                accounts: perAccountResults
            },
            message: isNewProject ? 'Initial project setup completed successfully' : 'Development cycle executed successfully'
        });
    } catch (error) {
        console.error('Error in gitAgent controller:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to execute git agent workflow',
            error: error.message
        });
    }
};

export { gitAgent };