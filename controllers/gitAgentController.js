import { z } from "zod";
import { randomUUID } from "crypto";
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

        // STEP 1: Stop cron scheduler completely to prevent it from using old project data
        console.log("🛑 Stopping any running cron scheduler...");
        try {
            cronScheduler.stop();
            console.log("✅ Cron scheduler stopped");
        } catch (error) {
            console.log("⚠️ Cron scheduler was not running or error stopping:", error.message);
        }

        // STEP 2: Clear ALL memory and state completely (including initial params)
        console.log("🧹 Clearing ALL previous project state, memory, and repository info...");
        await memoryService.clearMemory(false); // Don't preserve initial params - we want completely fresh
        await memoryService.clearRepositoryInfo();
        await memoryService.clearInitialProjectParams();
        console.log("✅ All memory, state, and repository info completely cleared");

        // STEP 3: Use clean project name without any unique identifiers
        // The uniqueness comes from clearing all memory and starting fresh
        const modifiedInput = {
            ...input,
            projectName: input.projectName // Keep original name as-is, no modifications
        };

        console.log(`🆕 Starting completely new project`);
        if (input.projectName) {
            console.log(`   Project name: "${input.projectName}"`);
        }

        // Always treat this as a new project
        const isNewProject = true;

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
                console.log(`🚀 [Account ${i + 1}] Running initial project setup cycle with unique project...`);

                // Save initial project parameters for auto-restart (only once, on first account)
                // Use modified input with unique name
                if (i === 0) {
                    await memoryService.saveInitialProjectParams(modifiedInput);
                    console.log("✅ Initial project parameters saved for auto-restart");
                }

                result = await orchestrator.runInitialCycle({
                    projectName: modifiedInput.projectName,
                    description: modifiedInput.description,
                    complexity: modifiedInput.complexity,
                    techConstraints: modifiedInput.techConstraints,
                    githubToken: token
                });

                // Start cron scheduler only after successful project initialization (once)
                // This ensures the scheduler uses the NEW project data, not old data
                if (i === 0 && result.projectSpec && result.plan && result.repo) {
                    try {
                        // Wait a moment to ensure all state is saved
                        await new Promise(resolve => setTimeout(resolve, 500));
                        await cronScheduler.start();
                        console.log("✅ Cron scheduler started with NEW project data");
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