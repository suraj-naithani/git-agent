export const commitScheduleConfig = {
    // Test mode: commit every 2 minutes
    test: {
        mode: "test",
        interval: "2m",
        cronExpression: "*/2 * * * *",
        description: "Commit every 2 minutes for testing"
    },

    // Production mode: commit daily at 9:00 AM
    production: {
        mode: "production",
        interval: "daily",
        cronExpression: "0 9 * * *",
        description: "Commit daily at 9:00 AM"
    }
};

// Get current schedule based on environment
export const getCurrentSchedule = () => {
    const mode = process.env.COMMIT_MODE || "test";
    return commitScheduleConfig[mode] || commitScheduleConfig.test;
};

// Validate schedule configuration
export const validateSchedule = (schedule) => {
    if (!schedule.cronExpression) {
        throw new Error("Invalid schedule: missing cronExpression");
    }
    return true;
};
