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
