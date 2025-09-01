import express from "express";
import { gitAgent } from "../controllers/gitAgentController.js";
import { orchestrator, cronScheduler } from "../services/serviceManager.js";
import memoryService from "../services/memoryService.js";

const router = express.Router();

// Main workflow endpoint
router.post("/run", gitAgent);

// Cron scheduler management endpoints
router.get("/cron/status", (req, res) => {
    try {
        const status = cronScheduler.getStatus();
        res.json({ success: true, data: status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post("/cron/start", async (req, res) => {
    try {
        await cronScheduler.start();
        res.json({ success: true, message: "Cron scheduler started" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post("/cron/stop", (req, res) => {
    try {
        cronScheduler.stop();
        res.json({ success: true, message: "Cron scheduler stopped" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

router.post("/cron/restart", async (req, res) => {
    try {
        await cronScheduler.restart();
        res.json({ success: true, message: "Cron scheduler restarted" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Manual trigger endpoint
router.post("/cron/trigger", async (req, res) => {
    try {
        const result = await cronScheduler.triggerManualCycle();
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Project status endpoint
router.get("/status", async (req, res) => {
    try {
        const isInitialized = await memoryService.isProjectInitialized();
        const isCompleted = await memoryService.isProjectCompleted();

        res.json({
            success: true,
            data: {
                isInitialized,
                isCompleted,
                status: isCompleted ? "completed" : isInitialized ? "in_progress" : "not_started"
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Debug endpoint to check memory state
router.get("/debug", async (req, res) => {
    try {
        const projectState = memoryService.getProjectState();
        const remainingTasks = await memoryService.getRemainingTasks();
        const projectSpec = await memoryService.getProjectSpec();

        res.json({
            success: true,
            data: {
                projectState,
                remainingTasksCount: remainingTasks.length,
                projectSpecAvailable: !!projectSpec,
                firstTask: remainingTasks[0] || null
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reset project completion status (for testing)
router.post("/reset", async (req, res) => {
    try {
        await memoryService.resetProjectCompletion();
        res.json({ success: true, message: "Project completion status reset" });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Debug current state
router.post("/debug-state", async (req, res) => {
    try {
        const state = await memoryService.debugState();
        res.json({ success: true, data: state });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Force reset project state (for testing)
router.post("/force-reset", async (req, res) => {
    try {
        const success = await memoryService.forceResetProject();
        if (success) {
            res.json({ success: true, message: "Project state force reset successfully" });
        } else {
            res.status(400).json({ success: false, message: "Could not reset project state" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Continue development with remaining tasks
router.post("/continue", async (req, res) => {
    try {
        const success = await memoryService.continueDevelopment();
        if (success) {
            res.json({ success: true, message: "Development continued successfully" });
        } else {
            res.status(400).json({ success: false, message: "Could not continue development" });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
