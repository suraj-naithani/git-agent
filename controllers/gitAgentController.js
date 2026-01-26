import { z } from "zod";
import AgentOrchestrator from "../agent/workflow.js";
import memoryService from "../services/memoryService.js";
import { cronScheduler } from "../services/serviceManager.js";
import { getGitHubTokens } from "../utils/githubTokens.js";
import notificationService from "../services/notificationService.js";
import { Octokit } from "@octokit/rest";

const inputSchema = z.object({
  projectName: z.string().nullable().optional(),
  description: z.string().optional(),
  complexity: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
  techConstraints: z.array(z.string()).default(["Node.js", "MongoDB"])
});

const gitAgent = async (req, res) => {
  try {
    const input = inputSchema.parse(req.body);

    const tokens = getGitHubTokens();
    if (!tokens || tokens.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No GitHub tokens configured"
      });
    }

    console.log("🛑 Stopping cron...");
    try { cronScheduler.stop(); } catch {}

    // Load previous project names BEFORE clearing memory (they're stored persistently in a file)
    const previousProjects = await memoryService.getAllProjectNames?.() || [];
    console.log(`📋 Loaded ${previousProjects.length} previous projects for uniqueness checking`);

    console.log("🧹 Clearing ALL memory...");
    await memoryService.clearMemory(false);
    await memoryService.clearRepositoryInfo();
    await memoryService.clearInitialProjectParams();

    const modifiedInput = {
      ...input,
      previousProjects
    };

    const config = {
      complexityDistribution: ["beginner", "intermediate", "advanced"],
      techStacks: input.techConstraints
    };

    const perAccountResults = [];
    const initializationResults = [];
    let canonicalResult = null;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const orchestrator = new AgentOrchestrator(config);

      let accountName = `Account ${i + 1}`;
      try {
        const github = new Octokit({ auth: token });
        const { data: user } = await github.users.getAuthenticated();
        accountName = user.login;
      } catch {}

      console.log(`🚀 [${accountName}] Initializing NEW unique project...`);

      try {
        await notificationService.sendInitializationStartNotification({
          accountName,
          projectName: modifiedInput.projectName || "AI Generated Project",
          complexity: modifiedInput.complexity,
          techStack: modifiedInput.techConstraints
        });
      } catch {}

      if (i === 0) {
        await memoryService.saveInitialProjectParams(modifiedInput);
      }

      let result;
      try {
        result = await orchestrator.runInitialCycle({
          projectName: modifiedInput.projectName,
          description: modifiedInput.description,
          complexity: modifiedInput.complexity,
          techConstraints: modifiedInput.techConstraints,
          previousProjects: modifiedInput.previousProjects,
          githubToken: token
        });

        if (result?.projectSpec?.title) {
          // Save project name with tech stack for better uniqueness tracking
          const techStack = result.projectSpec?.techStack || modifiedInput.techConstraints;
          await memoryService.saveProjectName?.(result.projectSpec.title, techStack);
        }

        initializationResults.push({
          accountName,
          success: true,
          status: "Initialized",
          repo: result.repo,
          projectName: result.projectSpec?.title || "AI Generated Project"
        });
      } catch (error) {
        console.error(`❌ [${accountName}] Init error:`, error);
        initializationResults.push({
          accountName,
          success: false,
          status: "Error",
          message: error.message
        });
      }

      if (i === 0 && result?.projectSpec && result?.plan && result?.repo) {
        await new Promise(r => setTimeout(r, 500));
        await cronScheduler.start();
        console.log("✅ Cron started with NEW project data");
      }

      if (!canonicalResult) canonicalResult = result;

      perAccountResults.push({
        tokenIndex: i + 1,
        accountName,
        status: result?.status,
        repo: result?.repo,
        currentTask: result?.currentTask,
        remainingTasks: result?.remainingTasks
      });
    }

    try {
      await notificationService.sendInitializationSummary(initializationResults);
    } catch {}

    res.status(200).json({
      success: true,
      data: {
        projectSpec: canonicalResult?.projectSpec,
        plan: canonicalResult?.plan,
        repo: canonicalResult?.repo,
        commits: canonicalResult?.commits,
        documentation: canonicalResult?.documentation,
        learningMetrics: canonicalResult?.learningMetrics,
        currentTask: canonicalResult?.currentTask,
        remainingTasks: canonicalResult?.remainingTasks,
        status: canonicalResult?.status,
        accounts: perAccountResults
      },
      message: "Unique project initialized successfully"
    });

  } catch (error) {
    console.error("❌ gitAgent error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to execute git agent workflow",
      error: error.message
    });
  }
};

export { gitAgent };
