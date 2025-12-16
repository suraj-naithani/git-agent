import { BufferMemory } from "langchain/memory";
import { ConversationChain } from "langchain/chains";

class MemoryService {
    constructor () {
        // Use a more persistent memory approach
        this.memory = new BufferMemory({
            memoryKey: "past_steps",
            returnMessages: true,
        });

        this.conversationChain = new ConversationChain({
            memory: this.memory,
        });

        // Initialize with empty state
        this.projectState = {
            isInitialized: false,
            isCompleted: false,
            remainingTasks: [],
            projectSpec: null,
            lastUpdated: null,
            initialProjectParams: null // Store original project parameters for auto-restart
        };
    }

    // Save context about current project state
    async saveContext(input, output) {
        try {
            // BufferMemory expects input/output to be strings or have specific keys
            const formattedInput = typeof input === 'string' ? input : JSON.stringify(input);
            const formattedOutput = typeof output === 'string' ? output : JSON.stringify(output);

            await this.memory.saveContext(
                { input: formattedInput },
                { output: formattedOutput }
            );
            console.log("✅ Memory context saved:", { input: formattedInput, output: formattedOutput });
        } catch (error) {
            console.error("❌ Error saving memory context:", error);
        }
    }

    // Load memory variables to recall past actions
    async loadMemoryVariables(inputVariables = {}) {
        try {
            const memoryVariables = await this.memory.loadMemoryVariables(inputVariables);
            console.log("📚 Memory loaded:", memoryVariables);
            return memoryVariables;
        } catch (error) {
            console.error("❌ Error loading memory:", error);
            return {};
        }
    }

    // Save project initialization status
    async saveInitializationStatus(status) {
        // Update local state
        this.projectState.isInitialized = (status === "done");
        this.projectState.lastUpdated = new Date().toISOString();

        // Also save to LangChain memory for compatibility
        await this.saveContext(
            { step: "initialization" },
            { status, timestamp: new Date().toISOString() }
        );

        console.log("✅ Project initialization status saved:", status);
    }

    // Save project completion status
    async saveProjectCompletion() {
        // Update local state
        this.projectState.isCompleted = true;
        this.projectState.lastUpdated = new Date().toISOString();

        // Also save to LangChain memory for compatibility
        await this.saveContext(
            { project: "status" },
            { status: "complete", completedAt: new Date().toISOString() }
        );

        console.log("✅ Project completion status saved");
    }

    // Mark project as truly completed (after checking original plan)
    async markProjectCompleted() {
        this.projectState.isCompleted = true;
        this.projectState.lastUpdated = new Date().toISOString();
        console.log("🎉 Project marked as truly completed - all tasks verified complete");
    }

    // Save current task progress
    async saveTaskProgress(taskTitle, status, details = {}) {
        // Also save to LangChain memory for compatibility
        await this.saveContext(
            { task: taskTitle },
            {
                status,
                details,
                timestamp: new Date().toISOString()
            }
        );

        console.log("✅ Task progress saved:", taskTitle, status);
    }

    // Save project plan and tasks
    async saveProjectPlan(plan, projectSpec) {
        // Update local state
        this.projectState.remainingTasks = plan.tasks || [];
        this.projectState.projectSpec = projectSpec;
        this.projectState.lastUpdated = new Date().toISOString();

        // Also save to LangChain memory for compatibility
        await this.saveContext(
            { projectPlan: "save" },
            {
                remainingTasks: plan.tasks || [],
                totalTasks: plan.tasks?.length || 0,
                projectSpec: projectSpec
            }
        );

        console.log("✅ Project plan saved with", this.projectState.remainingTasks.length, "tasks");
    }

    // Save repository information
    async saveRepositoryInfo(repo) {
        try {
            await this.saveContext(
                { action: "save_repository" },
                { repo: repo, timestamp: new Date().toISOString() }
            );
            console.log("✅ Repository information saved:", repo.name);
        } catch (error) {
            console.error("❌ Error saving repository info:", error);
        }
    }

    // Get repository information from memory
    async getRepositoryInfo() {
        try {
            const memory = await this.loadMemoryVariables();
            for (const step of memory.past_steps || []) {
                const stepContent = step.content || '';
                if (stepContent.includes("repo") && stepContent.includes("name")) {
                    try {
                        const parsed = JSON.parse(stepContent);
                        if (parsed.repo && parsed.repo.name && parsed.repo.url) {
                            return parsed.repo;
                        }
                    } catch (parseError) {
                        // Continue to next step
                    }
                }
            }
        } catch (error) {
            console.error("Error parsing repository from memory:", error);
        }
        return null;
    }

    // Update remaining tasks (remove completed task)
    async updateRemainingTasks(updatedTasks) {
        // Update local state
        this.projectState.remainingTasks = updatedTasks;
        this.projectState.lastUpdated = new Date().toISOString();

        // Also save to LangChain memory for compatibility
        await this.saveContext(
            { remainingTasks: "update" },
            { remainingTasks: updatedTasks }
        );

        console.log("✅ Remaining tasks updated:", updatedTasks.length, "tasks left");

        // Only mark project as completed if there are no more tasks AND we've checked the original plan
        if (updatedTasks.length === 0) {
            console.log("🔄 No remaining tasks - marking project as completed...");
            await this.markProjectCompleted();
            console.log("✅ Project automatically marked as completed - cron will stop");
        }
    }

    // Check if project is initialized
    async isProjectInitialized() {
        // Use local state for immediate response
        if (this.projectState.isInitialized) {
            return true;
        }

        // Fallback to memory parsing if local state is not set
        const memory = await this.loadMemoryVariables();
        return memory.past_steps?.some(step => {
            try {
                const stepContent = step.content || '';
                return stepContent.includes("initialization") && stepContent.includes("done");
            } catch (error) {
                return false;
            }
        }) || false;
    }

    // Check if project is completed
    async isProjectCompleted() {
        // Use local state for immediate response
        if (this.projectState.isCompleted) {
            console.log("🔍 Project completion check: Local state shows completed");
            return true;
        }

        // Fallback to memory parsing if local state is not set
        const memory = await this.loadMemoryVariables();
        const hasCompletion = memory.past_steps?.some(step => {
            try {
                const stepContent = step.content || '';
                // Only check for project-level completion, not task completion
                return stepContent.includes('"status":"complete"') ||
                    stepContent.includes('"project":"status"');
            } catch (error) {
                return false;
            }
        }) || false;

        console.log(`🔍 Project completion check: Memory shows ${hasCompletion ? 'completed' : 'not completed'}`);
        return hasCompletion;
    }

    // Get remaining tasks from memory
    async getRemainingTasks() {
        // Use local state for immediate response
        if (this.projectState.remainingTasks && this.projectState.remainingTasks.length >= 0) {
            console.log(`📋 Returning ${this.projectState.remainingTasks.length} tasks from local state`);
            return this.projectState.remainingTasks;
        }

        // Fallback to memory parsing if local state is not set
        const memory = await this.loadMemoryVariables();
        try {
            for (const step of memory.past_steps || []) {
                const stepContent = step.content || '';
                if (stepContent.includes("remainingTasks")) {
                    try {
                        const parsed = JSON.parse(stepContent);
                        if (parsed.remainingTasks && Array.isArray(parsed.remainingTasks)) {
                            console.log(`📋 Returning ${parsed.remainingTasks.length} tasks from memory`);
                            return parsed.remainingTasks;
                        }
                    } catch (parseError) {
                        const match = stepContent.match(/remainingTasks.*?\[(.*?)\]/);
                        if (match) {
                            return JSON.parse(`[${match[1]}]`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error parsing remaining tasks from memory:", error);
        }
        console.log("📋 No tasks found, returning empty array");
        return [];
    }

    // Get project spec from memory
    async getProjectSpec() {
        // Use local state for immediate response
        if (this.projectState.projectSpec) {
            return this.projectState.projectSpec;
        }

        // Fallback to memory parsing if local state is not set
        const memory = await this.loadMemoryVariables();
        try {
            for (const step of memory.past_steps || []) {
                const stepContent = step.content || '';
                if (stepContent.includes("projectSpec")) {
                    try {
                        const parsed = JSON.parse(stepContent);
                        if (parsed.projectSpec) {
                            return parsed.projectSpec;
                        }
                    } catch (parseError) {
                        const match = stepContent.match(/projectSpec":"(.*?)"/);
                        if (match) {
                            return match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
                        }
                    }
                }
            }
        } catch (error) {
            console.error("Error parsing project spec from memory:", error);
        }
        return null;
    }

    // Get current project state for debugging
    getProjectState() {
        return {
            ...this.projectState,
            memorySteps: this.memory.chatHistory?.length || 0
        };
    }

    // Clear memory (useful for testing or resetting)
    // preserveInitialParams: if true, keeps initialProjectParams for auto-restart
    async clearMemory(preserveInitialParams = false) {
        try {
            // Preserve initial params if requested (for auto-restart)
            const preservedParams = preserveInitialParams ? this.projectState.initialProjectParams : null;

            // Create completely new memory instance
            this.memory = new BufferMemory({
                memoryKey: "past_steps",
                returnMessages: true,
            });

            // Reset conversation chain
            this.conversationChain = new ConversationChain({
                memory: this.memory,
            });

            // Reset local state completely
            this.projectState = {
                isInitialized: false,
                isCompleted: false,
                remainingTasks: [],
                projectSpec: null,
                lastUpdated: null,
                initialProjectParams: preservedParams // Preserve if requested
            };

            // Clear any stored repository information
            await this.clearRepositoryInfo();

            if (preserveInitialParams && preservedParams) {
                console.log("🧹 Memory and local state cleared (initial params preserved for auto-restart)");
            } else {
                console.log("🧹 Memory and local state completely cleared");
            }
            console.log("🧹 New project can now be started with fresh repository");
        } catch (error) {
            console.error("❌ Error clearing memory:", error);
        }
    }

    // Clear repository information specifically
    async clearRepositoryInfo() {
        try {
            // Clear any stored repository information from memory
            await this.saveContext(
                { action: "clear_repository" },
                { repository: null, timestamp: new Date().toISOString() }
            );
            console.log("🧹 Repository information cleared from memory");
        } catch (error) {
            console.error("❌ Error clearing repository info:", error);
        }
    }

    // Reset project completion status (useful for testing)
    async resetProjectCompletion() {
        this.projectState.isCompleted = false;
        this.projectState.lastUpdated = new Date().toISOString();
        console.log("🔄 Project completion status reset");
    }

    // Force reset project state for testing
    async forceResetProject() {
        console.log("🔄 Force resetting project state...");

        // Load original plan from memory
        const memory = await this.loadMemoryVariables();
        for (const step of memory.past_steps || []) {
            const stepContent = step.content || '';
            if (stepContent.includes("remainingTasks")) {
                try {
                    const parsed = JSON.parse(stepContent);
                    if (parsed.remainingTasks && Array.isArray(parsed.remainingTasks) && parsed.remainingTasks.length > 0) {
                        console.log(`📋 Found original plan with ${parsed.remainingTasks.length} tasks`);
                        this.projectState.remainingTasks = parsed.remainingTasks;
                        this.projectState.isCompleted = false;
                        this.projectState.lastUpdated = new Date().toISOString();
                        console.log("✅ Project state reset with original tasks");
                        return true;
                    }
                } catch (parseError) {
                    console.log("Could not parse original plan from memory");
                }
            }
        }

        console.log("⚠️ No original plan found in memory");
        return false;
    }

    // Continue development with remaining tasks
    async continueDevelopment() {
        console.log("🔄 Continuing development with remaining tasks...");

        // Check if we have remaining tasks
        if (this.projectState.remainingTasks && this.projectState.remainingTasks.length > 0) {
            console.log(`📋 Found ${this.projectState.remainingTasks.length} remaining tasks`);
            this.projectState.isCompleted = false;
            this.projectState.lastUpdated = new Date().toISOString();
            return true;
        }

        // Try to load from memory
        const memory = await this.loadMemoryVariables();
        for (const step of memory.past_steps || []) {
            const stepContent = step.content || '';
            if (stepContent.includes("remainingTasks")) {
                try {
                    const parsed = JSON.parse(stepContent);
                    if (parsed.remainingTasks && Array.isArray(parsed.remainingTasks) && parsed.remainingTasks.length > 0) {
                        console.log(`📋 Found ${parsed.remainingTasks.length} tasks in memory, continuing development`);
                        this.projectState.remainingTasks = parsed.remainingTasks;
                        this.projectState.isCompleted = false;
                        this.projectState.lastUpdated = new Date().toISOString();
                        return true;
                    }
                } catch (parseError) {
                    console.log("Could not parse remaining tasks from memory");
                }
            }
        }

        console.log("⚠️ No tasks found to continue development");
        return false;
    }

    // Save initial project parameters for auto-restart
    async saveInitialProjectParams(params) {
        // Store in local state
        this.projectState.initialProjectParams = {
            projectName: params.projectName ?? null,
            description: params.description || null,
            complexity: params.complexity || 'beginner',
            techConstraints: params.techConstraints || ['Node.js', 'MongoDB']
        };
        this.projectState.lastUpdated = new Date().toISOString();

        // Also save to LangChain memory for persistence
        await this.saveContext(
            { action: "save_initial_project_params" },
            { initialProjectParams: this.projectState.initialProjectParams, timestamp: new Date().toISOString() }
        );

        console.log("✅ Initial project parameters saved for auto-restart");
    }

    // Get initial project parameters
    async getInitialProjectParams() {
        // Use local state for immediate response
        if (this.projectState.initialProjectParams) {
            console.log("📋 Returning initial project params from local state");
            return this.projectState.initialProjectParams;
        }

        // Fallback to memory parsing if local state is not set
        const memory = await this.loadMemoryVariables();
        try {
            for (const step of memory.past_steps || []) {
                const stepContent = step.content || '';
                if (stepContent.includes("initialProjectParams") || stepContent.includes("save_initial_project_params")) {
                    try {
                        const parsed = JSON.parse(stepContent);
                        if (parsed.initialProjectParams) {
                            console.log("📋 Returning initial project params from memory");
                            // Update local state for future use
                            this.projectState.initialProjectParams = parsed.initialProjectParams;
                            return parsed.initialProjectParams;
                        }
                    } catch (parseError) {
                        // Continue to next step
                    }
                }
            }
        } catch (error) {
            console.error("Error parsing initial project params from memory:", error);
        }

        console.log("📋 No initial project params found");
        return null;
    }

    // Clear initial project parameters
    async clearInitialProjectParams() {
        this.projectState.initialProjectParams = null;
        this.projectState.lastUpdated = new Date().toISOString();
        console.log("🧹 Initial project parameters cleared");
    }

    // Debug method to show current state
    async debugState() {
        console.log("🔍 Current Memory State:");
        console.log("  - isInitialized:", this.projectState.isInitialized);
        console.log("  - isCompleted:", this.projectState.isCompleted);
        console.log("  - remainingTasks count:", this.projectState.remainingTasks?.length || 0);
        console.log("  - projectSpec available:", !!this.projectState.projectSpec);
        console.log("  - lastUpdated:", this.projectState.lastUpdated);
        console.log("  - initialProjectParams available:", !!this.projectState.initialProjectParams);

        if (this.projectState.remainingTasks && this.projectState.remainingTasks.length > 0) {
            console.log("  - Next task:", this.projectState.remainingTasks[0].title);
        }

        return this.projectState;
    }
}

export default new MemoryService();
