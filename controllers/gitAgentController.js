import { z } from "zod";
import AgentOrchestrator from "../agent/workflow.js";

const inputSchema = z.object({
    complexity: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
    techConstraints: z.array(z.string()).default(['Node.js', 'MongoDB'])
});

const gitAgent = async (req, res) => {
    try {
        const input = inputSchema.parse(req.body);

        const config = {
            complexityDistribution: ['beginner', 'intermediate', 'advanced'],
            techStacks: input.techConstraints
        };

        const orchestrator = new AgentOrchestrator(config);

        const result = await orchestrator.runCycle({
            complexity: input.complexity,
            techConstraints: input.techConstraints
        });

        res.status(200).json({
            success: true,
            data: {
                projectSpec: result.projectSpec,
                plan: result.plan,
                repo: result.repo,
                commits: result.commits,
                qualityReport: result.qualityReport,
                documentation: result.documentation,
                learningMetrics: result.learningMetrics
            },
            message: 'Git agent workflow executed successfully'
        });
    } catch (error) {
        console.error('Error in gitAgent controller:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to execute git agent workflow',
            error: error.message
        });
    }
};

export { gitAgent };