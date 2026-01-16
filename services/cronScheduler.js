import cron from "node-cron";
import { getCurrentSchedule, validateSchedule } from "../config/commitSchedule.js";
import memoryService from "./memoryService.js";
import { getGitHubTokens } from "../utils/githubTokens.js";
import notificationService from "./notificationService.js";
import { Octokit } from "@octokit/rest";

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

                    // Resolve all configured GitHub tokens (multi-account support)
                    const tokens = getGitHubTokens();
                    if (!tokens || tokens.length === 0) {
                        console.log("❌ No GitHub tokens configured. Skipping scheduled development cycle.");
                        return;
                    }

                    // Track commit results for each account
                    const commitResults = [];
                    let shouldStopScheduler = false;

                    // Run the daily development cycle for each configured account
                    for (let i = 0; i < tokens.length; i++) {
                        const token = tokens[i];
                        let accountName = `Account ${i + 1}`;
                        
                        // Get account name from GitHub
                        try {
                            const github = new Octokit({ auth: token });
                            const { data: user } = await github.users.getAuthenticated();
                            accountName = user.login;
                        } catch (error) {
                            console.warn(`⚠️ Could not get account name for token ${i + 1}:`, error.message);
                        }

                        console.log(`🔄 [Cron][${accountName}] Executing scheduled development cycle...`);
                        
                        let commitSuccess = false;
                        let errorMessage = null;
                        let taskInfo = null;

                        try {
                            const result = await this.orchestrator.runDailyCycle(token);

                            if (result.status === "Project completed") {
                                console.log(`🎉 [${accountName}] Project completed, checking for auto-restart...`);
                                const restarted = await this.handleAutoRestart();
                                if (!restarted) {
                                    console.log(`⚠️ [${accountName}] Auto-restart not available, will stop scheduler after all accounts processed`);
                                    shouldStopScheduler = true;
                                }
                                commitResults.push({
                                    accountName,
                                    success: true,
                                    status: "Project completed",
                                    message: "Project completed successfully"
                                });
                            } else if (result.status === "Project not initialized") {
                                console.log(`⚠️ [${accountName}] Project not initialized, skipping cycle`);
                                commitResults.push({
                                    accountName,
                                    success: false,
                                    status: "Project not initialized",
                                    message: "Project not initialized"
                                });
                            } else if (result.status === "No tasks available") {
                                console.log(`⚠️ [${accountName}] No tasks available, skipping cycle`);
                                commitResults.push({
                                    accountName,
                                    success: false,
                                    status: "No tasks available",
                                    message: "No tasks available"
                                });
                            } else {
                                commitSuccess = true;
                                taskInfo = {
                                    task: result.currentTask || 'Unknown',
                                    remainingTasks: result.remainingTasks || 'Unknown',
                                    filesCommitted: result.commits?.length || 0
                                };
                                console.log(`✅ [${accountName}] Scheduled cycle completed successfully:`);
                                console.log(`   - Task: ${taskInfo.task}`);
                                console.log(`   - Remaining tasks: ${taskInfo.remainingTasks}`);
                                console.log(`   - Files committed: ${taskInfo.filesCommitted}`);
                                
                                commitResults.push({
                                    accountName,
                                    success: true,
                                    status: "Success",
                                    message: `Task completed: ${taskInfo.task}`,
                                    taskInfo
                                });
                            }
                        } catch (error) {
                            errorMessage = error.message;
                            console.error(`❌ [${accountName}] Error during development cycle:`, error);
                            commitResults.push({
                                accountName,
                                success: false,
                                status: "Error",
                                message: errorMessage
                            });
                        }
                    }

                    // Send summary notification to Slack after all accounts are processed
                    try {
                        await notificationService.sendCommitSummary(commitResults);
                    } catch (notifyError) {
                        console.warn("⚠️ Failed to send commit summary notification:", notifyError.message);
                    }

                    // Stop scheduler if needed (after processing all accounts and sending summary)
                    if (shouldStopScheduler) {
                        console.log("🛑 Stopping cron scheduler as project completed and auto-restart not available");
                        this.stop();
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

            // Run the development cycle for all configured tokens (multi-account)
            const tokens = getGitHubTokens();
            if (!tokens || tokens.length === 0) {
                console.log("❌ No GitHub tokens configured. Skipping manual development cycle.");
                return { status: "No GitHub tokens configured" };
            }

            const results = [];
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                console.log(`🔧 [Manual][Account ${i + 1}] Running development cycle...`);
                const result = await this.orchestrator.runDailyCycle(token);
                results.push({
                    tokenIndex: i + 1,
                    status: result.status,
                    currentTask: result.currentTask,
                    remainingTasks: result.remainingTasks,
                    commits: result.commits
                });
            }

            console.log("✅ Manual multi-account cycle completed");

            return { status: "ok", accounts: results };
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
                    
                    // Send auto-restart notification
                    try {
                        await notificationService.sendAutoRestartNotification({
                            projectName: initialParams.projectName || "AI Generated Project",
                            complexity: initialParams.complexity || "beginner",
                            techStack: initialParams.techConstraints || ["Node.js"],
                            repo: result.repo
                        });
                    } catch (notifyError) {
                        console.warn("⚠️ Failed to send auto-restart notification:", notifyError.message);
                    }
                    
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
