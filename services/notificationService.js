import axios from "axios";

class NotificationService {
    constructor () {
        this.slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
        this.isEnabled = !!this.slackWebhookUrl;
    }

    // Send Slack notification
    async sendSlackNotification(message, attachments = []) {
        if (!this.isEnabled) {
            console.log("⚠️ Slack notifications disabled - no webhook URL provided");
            return false;
        }

        try {
            const payload = {
                text: message,
                attachments: attachments
            };

            const response = await axios.post(this.slackWebhookUrl, payload, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 200) {
                console.log("✅ Slack notification sent successfully");
                return true;
            } else {
                console.error("❌ Slack notification failed:", response.status);
                return false;
            }
        } catch (error) {
            console.error("❌ Error sending Slack notification:", error.message);
            return false;
        }
    }

    // Send commit notification
    async sendCommitNotification(commitData) {
        const { message, files, repo, task } = commitData;

        const messageText = `🚀 New code committed to *${repo.name}*`;

        const attachments = [
            {
                color: "#36a64f",
                title: "Commit Details",
                fields: [
                    {
                        title: "Repository",
                        value: repo.name,
                        short: true
                    },
                    {
                        title: "Task",
                        value: task || "Unknown",
                        short: true
                    },
                    {
                        title: "Commit Message",
                        value: message,
                        short: false
                    },
                    {
                        title: "Files Modified",
                        value: files.map(f => `• \`${f.path}\``).join('\n'),
                        short: false
                    }
                ],
                footer: "AI Development Agent",
                ts: Math.floor(Date.now() / 1000)
            }
        ];

        return await this.sendSlackNotification(messageText, attachments);
    }

    // Send project start notification
    async sendProjectStartNotification(projectData) {
        const { projectName, complexity, techStack, repo } = projectData;

        const messageText = `🎯 New AI project started: *${projectName}*`;

        const attachments = [
            {
                color: "#ff6b6b",
                title: "Project Details",
                fields: [
                    {
                        title: "Project Name",
                        value: projectName,
                        short: true
                    },
                    {
                        title: "Complexity",
                        value: complexity,
                        short: true
                    },
                    {
                        title: "Tech Stack",
                        value: techStack.join(', '),
                        short: false
                    },
                    {
                        title: "Repository",
                        value: repo ? `${repo.name} (${repo.url})` : "Not created yet",
                        short: false
                    }
                ],
                footer: "AI Development Agent",
                ts: Math.floor(Date.now() / 1000)
            }
        ];

        return await this.sendSlackNotification(messageText, attachments);
    }

    // Send task completion notification
    async sendTaskCompletionNotification(taskData) {
        const { taskTitle, remainingTasks, repo } = taskData;

        const messageText = `✅ Task completed: *${taskTitle}*`;

        const attachments = [
            {
                color: "#4ecdc4",
                title: "Task Progress",
                fields: [
                    {
                        title: "Completed Task",
                        value: taskTitle,
                        short: true
                    },
                    {
                        title: "Remaining Tasks",
                        value: remainingTasks.toString(),
                        short: true
                    },
                    {
                        title: "Repository",
                        value: repo.name,
                        short: true
                    },
                    {
                        title: "Status",
                        value: remainingTasks > 0 ? "In Progress" : "Project Complete! 🎉",
                        short: true
                    }
                ],
                footer: "AI Development Agent",
                ts: Math.floor(Date.now() / 1000)
            }
        ];

        return await this.sendSlackNotification(messageText, attachments);
    }

    // Send error notification
    async sendErrorNotification(errorData) {
        const { error, context, repo } = errorData;

        const messageText = `❌ Error occurred during development`;

        const attachments = [
            {
                color: "#ff4757",
                title: "Error Details",
                fields: [
                    {
                        title: "Error Message",
                        value: error.message || "Unknown error",
                        short: false
                    },
                    {
                        title: "Context",
                        value: context || "No context provided",
                        short: false
                    },
                    {
                        title: "Repository",
                        value: repo ? repo.name : "Unknown",
                        short: true
                    },
                    {
                        title: "Timestamp",
                        value: new Date().toISOString(),
                        short: true
                    }
                ],
                footer: "AI Development Agent",
                ts: Math.floor(Date.now() / 1000)
            }
        ];

        return await this.sendSlackNotification(messageText, attachments);
    }

    // Send commit summary notification for all accounts
    async sendCommitSummary(commitResults) {
        if (!commitResults || commitResults.length === 0) {
            console.log("⚠️ No commit results to summarize");
            return false;
        }

        const successfulAccounts = commitResults.filter(r => r.success);
        const failedAccounts = commitResults.filter(r => !r.success);
        const totalAccounts = commitResults.length;

        const messageText = `📊 Daily Commit Summary - ${new Date().toLocaleDateString()}`;

        // Build fields for successful accounts
        const successFields = [];
        if (successfulAccounts.length > 0) {
            successfulAccounts.forEach(result => {
                let value = `Status: ${result.status}`;
                if (result.taskInfo) {
                    value += `\nTask: ${result.taskInfo.task}`;
                    value += `\nRemaining: ${result.taskInfo.remainingTasks}`;
                    value += `\nFiles: ${result.taskInfo.filesCommitted}`;
                } else if (result.message) {
                    value += `\n${result.message}`;
                }
                successFields.push({
                    title: `✅ ${result.accountName}`,
                    value: value,
                    short: true
                });
            });
        }

        // Build fields for failed accounts
        const failureFields = [];
        if (failedAccounts.length > 0) {
            failedAccounts.forEach(result => {
                let value = `Status: ${result.status}`;
                if (result.message) {
                    value += `\n${result.message}`;
                }
                failureFields.push({
                    title: `❌ ${result.accountName}`,
                    value: value,
                    short: true
                });
            });
        }

        const attachments = [
            {
                color: failedAccounts.length === 0 ? "#36a64f" : (successfulAccounts.length > 0 ? "#ffa500" : "#ff4757"),
                title: "Commit Results Summary",
                fields: [
                    {
                        title: "Total Accounts",
                        value: totalAccounts.toString(),
                        short: true
                    },
                    {
                        title: "Successful",
                        value: `${successfulAccounts.length} ✅`,
                        short: true
                    },
                    {
                        title: "Failed",
                        value: `${failedAccounts.length} ❌`,
                        short: true
                    },
                    {
                        title: "Success Rate",
                        value: `${Math.round((successfulAccounts.length / totalAccounts) * 100)}%`,
                        short: true
                    },
                    ...successFields,
                    ...failureFields
                ],
                footer: "AI Development Agent - Daily Scheduler",
                ts: Math.floor(Date.now() / 1000)
            }
        ];

        return await this.sendSlackNotification(messageText, attachments);
    }

    // Check if notifications are enabled
    isNotificationEnabled() {
        return this.isEnabled;
    }

    // Get notification status
    getStatus() {
        return {
            enabled: this.isEnabled,
            webhookConfigured: !!this.slackWebhookUrl,
            service: "slack"
        };
    }
}

export default new NotificationService();
