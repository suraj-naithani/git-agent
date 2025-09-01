import AgentOrchestrator from "../agent/workflow.js";
import CronScheduler from "./cronScheduler.js";

// Initialize services
const orchestrator = new AgentOrchestrator();
const cronScheduler = new CronScheduler(orchestrator);

// Export services for use across the application
export { orchestrator, cronScheduler };
