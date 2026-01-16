// Helper function to generate random cron expression between two hours
const generateRandomCronBetween = (startHour, endHour) => {
    const randomHour = Math.floor(Math.random() * (endHour - startHour)) + startHour;
    const randomMinute = Math.floor(Math.random() * 60);
    return `${randomMinute} ${randomHour} * * *`;
};

export const commitScheduleConfig = {
    // Test mode: commit every 1 minutes
    development: {
        mode: "development",
        interval: "1m",
        cronExpression: "*/1 * * * *",
        description: "Commit every 1 minutes for development"
    },

    // Production mode: commit daily at 2:00 PM
    production: {
        mode: "production",
        interval: "daily",
        cronExpression: "0 14 * * *",
        description: "Commit daily at 2:00 PM"
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
