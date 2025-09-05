import dotenv from "dotenv";
dotenv.config();
import express from "express";
import { cronScheduler } from "./services/serviceManager.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Import routes after setting up express
import gitAgentRoutes from "./routes/gitAgentRoutes.js";
import codeUpdateRoutes from "./routes/codeUpdateRoutes.js";

app.use("/api/git-agent", gitAgentRoutes);
app.use("/api/code-update", codeUpdateRoutes);

// Start server without cron scheduler (will be started manually after first API call)
app.listen(PORT, async () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log("⏰ Cron scheduler will start after first project initialization");

    // Start keep-alive after server starts
    setInterval(() => {
        console.log("🟢 Server is live");
    }, 10 * 60 * 1000);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    cronScheduler.stop();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    cronScheduler.stop();
    process.exit(0);
});
