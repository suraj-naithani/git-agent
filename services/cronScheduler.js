import cron from "node-cron";
import { getCurrentSchedule, validateSchedule } from "../config/commitSchedule.js";
import memoryService from "./memoryService.js";

class CronScheduler {
    constructor (orchestrator) {
        this.orchestrator = orchestrator;
        this.jobs = new Map();
        this.isRunning = false;
        this.autoRestartEnabled = true; // Enable auto-restart by default
    }

    // Start the cron scheduler
    async start() {
        try {
            if (this.isRunning) {
                console.log("⚠️ Cron scheduler is already running");
                return;
            }

            const schedule = getCurrentSchedule();
            validateSchedule(schedule);

            console.log(`🚀 Starting cron scheduler with ${schedule.mode} mode`);
            console.log(`⏰ Schedule: ${schedule.description} (${schedule.cronExpression})`);

            // Schedule the daily development cycle
            const job = cron.schedule(schedule.cronExpression, async () => {
                try {
                    console.log(`\n🕐 [${new Date().toISOString()}] Running scheduled development cycle...`);

                    // Check if project is completed
                    const isCompleted = await memoryService.isProjectCompleted();
                    if (isCompleted) {
                        console.log("🎉 Project completed, checking for auto-restart...");
                        const restarted = await this.handleAutoRestart();
                        if (!restarted) {
                            console.log("🛑 Auto-restart not available, stopping cron job");
                            this.stop();
                        }
                        return;
                    }

                    // Check if we have remaining tasks
                    const remainingTasks = await memoryService.getRemainingTasks();
                    if (!remainingTasks || remainingTasks.length === 0) {
                        console.log("⚠️ No remaining tasks, checking if project should continue...");
                        const canContinue = await memoryService.continueDevelopment();
                        if (!canContinue) {
                            console.log("🎉 No more tasks available, stopping cron job");
                            this.stop();
                            return;
                        }
                        console.log("🔄 Development continued, proceeding with cycle...");
                    }

                    // Run the daily development cycle
                    console.log("🔄 Executing scheduled development cycle...");
                    const result = await this.orchestrator.runDailyCycle();

                    if (result.status === "Project completed") {
                        console.log("🎉 Project completed, checking for auto-restart...");
                        const restarted = await this.handleAutoRestart();
                        if (!restarted) {
                            console.log("🛑 Auto-restart not available, stopping cron job");
                            this.stop();
                        }
                    } else if (result.status === "Project not initialized") {
                        console.log("⚠️ Project not initialized, skipping cycle");
                    } else if (result.status === "No tasks available") {
                        console.log("⚠️ No tasks available, skipping cycle");
                    } else {
                        console.log(`✅ Scheduled cycle completed successfully:`);
                        console.log(`   - Task: ${result.currentTask || 'Unknown'}`);
                        console.log(`   - Remaining tasks: ${result.remainingTasks || 'Unknown'}`);
                        console.log(`   - Files committed: ${result.commits?.length || 0}`);
                    }
                } catch (error) {
                    console.error("❌ Error in scheduled development cycle:", error);

                    // Save error to memory
                    await memoryService.saveTaskProgress("CRON_ERROR", "failed", {
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }, {
                scheduled: false, // Don't start immediately
                timezone: "UTC"
            });

            // Store the job reference
            this.jobs.set("dailyDevelopment", job);

            // Start the job
            job.start();
            this.isRunning = true;

            console.log("✅ Cron scheduler started successfully");

        } catch (error) {
            console.error("❌ Failed to start cron scheduler:", error);
            throw error;
        }
    }

    // Stop the cron scheduler
    stop() {
        try {
            console.log("🛑 Stopping cron scheduler...");

            // Stop all jobs
            for (const [name, job] of this.jobs) {
                job.stop();
                console.log(`⏹️ Stopped job: ${name}`);
            }

            this.jobs.clear();
            this.isRunning = false;

            console.log("✅ Cron scheduler stopped successfully");
        } catch (error) {
            console.error("❌ Error stopping cron scheduler:", error);
        }
    }

    // Get scheduler status
    getStatus() {
        return {
            isRunning: this.isRunning,
            activeJobs: Array.from(this.jobs.keys()),
            currentSchedule: getCurrentSchedule()
        };
    }

    // Manually trigger a development cycle (useful for testing)
    async triggerManualCycle() {
        try {
            console.log("🔧 Manually triggering development cycle...");

            if (!this.isRunning) {
                console.log("⚠️ Cron scheduler not running. Starting it first...");
                await this.start();
            }

            // Check if project is completed
            const isCompleted = await memoryService.isProjectCompleted();
            if (isCompleted) {
                console.log("🎉 Project already completed");
                return { status: "Project completed" };
            }

            // Run the development cycle
            const result = await this.orchestrator.runDailyCycle();
            console.log("✅ Manual cycle completed");

            return result;
        } catch (error) {
            console.error("❌ Error in manual cycle:", error);
            throw error;
        }
    }

    // Restart the scheduler (useful for configuration changes)
    async restart() {
        try {
            console.log("🔄 Restarting cron scheduler...");
            this.stop();
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
            await this.start();
            console.log("✅ Cron scheduler restarted successfully");
        } catch (error) {
            console.error("❌ Error restarting cron scheduler:", error);
            throw error;
        }
    }

    // Handle auto-restart when project completes
    async handleAutoRestart() {
        try {
            // Check if auto-restart is enabled
            if (!this.autoRestartEnabled) {
                console.log("⚠️ Auto-restart is disabled");
                return false;
            }

            // Get stored initial project parameters
            const initialParams = await memoryService.getInitialProjectParams();
            if (!initialParams) {
                console.log("⚠️ No initial project parameters found for auto-restart");
                return false;
            }

            console.log("🔄 Auto-restart: Starting new project with stored parameters...");
            console.log(`   - Project: ${initialParams.projectName || 'Random'}`);
            console.log(`   - Complexity: ${initialParams.complexity}`);
            console.log(`   - Tech Stack: ${initialParams.techConstraints?.join(', ') || 'Default'}`);

            // Clear memory and repository info (preserving initial params)
            await memoryService.clearMemory(true); // preserveInitialParams = true
            await memoryService.clearRepositoryInfo();

            // Re-save initial params to memory after clearing (for persistence)
            await memoryService.saveInitialProjectParams(initialParams);

            // Wait a moment for cleanup
            await new Promise(resolve => setTimeout(resolve, 500));

            // Start new project with stored parameters
            try {
                const result = await this.orchestrator.runInitialCycle({
                    projectName: initialParams.projectName,
                    description: initialParams.description,
                    complexity: initialParams.complexity,
                    techConstraints: initialParams.techConstraints
                });

                if (result.projectSpec && result.plan && result.repo) {
                    console.log("✅ Auto-restart successful: New project initialized");
                    console.log(`   - New repository: ${result.repo.name}`);
                    // Cron scheduler is already running, so it will continue with the new project
                    return true;
                } else {
                    console.error("❌ Auto-restart failed: Project initialization incomplete");
                    return false;
                }
            } catch (initError) {
                console.error("❌ Error during auto-restart project initialization:", initError);
                return false;
            }
        } catch (error) {
            console.error("❌ Error in auto-restart handler:", error);
            return false;
        }
    }

    // Enable/disable auto-restart
    setAutoRestart(enabled) {
        this.autoRestartEnabled = enabled;
        console.log(`🔄 Auto-restart ${enabled ? 'enabled' : 'disabled'}`);
    }
}

export default CronScheduler;
