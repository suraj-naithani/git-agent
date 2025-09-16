export const commitScheduleConfig = {
    // Test mode: commit every 1 minutes
    development: {
        mode: "development",
        interval: "1m",
        cronExpression: "*/1 * * * *",
        description: "Commit every 1 minutes for development"
    },

    // Production mode: commit at random times between 9 AM and 9 PM
    production: {
        mode: "production",
        interval: "random",
        cronExpression: "* 9-21 * * *",
        description: "Commit at random times between 9:00 AM and 9:00 PM"
    }
};

// Get current schedule based on environment
export const getCurrentSchedule = () => {
    const mode = process.env.COMMIT_MODE || "development";
    return commitScheduleConfig[mode] || commitScheduleConfig.test;
};

// Validate schedule configuration
export const validateSchedule = (schedule) => {
    if (!schedule.cronExpression) {
        throw new Error("Invalid schedule: missing cronExpression");
    }
    return true;
};
