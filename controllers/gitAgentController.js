import { z } from "zod";
import AgentOrchestrator from "../agent/workflow.js";
import memoryService from "../services/memoryService.js";
import { cronScheduler } from "../services/serviceManager.js";

const inputSchema = z.object({
    projectName: z.string().nullable().optional().describe("Specific project name/idea to create (can be null for random project)"),
    description: z.string().optional().describe("Additional description or context about what you want the AI to create (optional)"),
    complexity: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
    techConstraints: z.array(z.string()).default(['Node.js', 'MongoDB'])
});

const gitAgent = async (req, res) => {
    try {
        const input = inputSchema.parse(req.body);

        const config = {
            complexityDistribution: ['beginner', 'intermediate', 'advanced'],
            techStacks: input.techConstraints
        };

        const orchestrator = new AgentOrchestrator(config);

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

        let result;
        if (!isInitialized) {
            // First run: initialize project (idea → plan → repo setup)
            console.log("🚀 Running initial project setup cycle...");
            result = await orchestrator.runInitialCycle({
                projectName: input.projectName,
                description: input.description,
                complexity: input.complexity,
                techConstraints: input.techConstraints
            });

            // Start cron scheduler only after successful project initialization
            if (result.projectSpec && result.plan && result.repo) {
                try {
                    await cronScheduler.start();
                    console.log("✅ Cron scheduler started after project initialization");
                } catch (error) {
                    console.error("❌ Failed to start cron scheduler:", error);
                }
            }
        } else {
            // Subsequent runs: continue development
            console.log("🔄 Running development cycle...");

            // Check if cron scheduler is running
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

            result = await orchestrator.runDailyCycle();
        }

        res.status(200).json({
            success: true,
            data: {
                projectSpec: result.projectSpec,
                plan: result.plan,
                repo: result.repo,
                commits: result.commits,
                qualityReport: result.qualityReport,
                documentation: result.documentation,
                learningMetrics: result.learningMetrics,
                currentTask: result.currentTask,
                remainingTasks: result.remainingTasks,
                status: result.status
            },
            message: isInitialized ? 'Development cycle executed successfully' : 'Initial project setup completed successfully'
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