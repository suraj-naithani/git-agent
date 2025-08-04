import { StateGraph, START, END } from "@langchain/langgraph";
import { z } from "zod";
import { developCode, generateIdea, manageRepository, planProject } from "./agents.js";

// Define the state schema for the graph
const stateSchema = z.object({
    complexity: z.string().describe("Complexity level of the project (e.g., beginner, intermediate, advanced)"),
    techConstraints: z.array(z.string()).describe("Technological constraints or preferences for the project"),
    projectSpec: z.string().nullable().describe("Generated project specification in JSON format"),
    plan: z.string().nullable().describe("Detailed implementation plan in JSON format"),
    repo: z.object({ name: z.string(), url: z.string() }).nullable().describe("Repository details"),
    commits: z.array(z.any()).nullable().describe("List of commit details"),
    qualityReport: z.string().nullable().describe("Code quality report in JSON format"),
    documentation: z.string().nullable().describe("Project documentation including README"),
    learningMetrics: z.any().nullable().describe("Learning and optimization metrics")
});

// Create and configure the graph
const graph = new StateGraph(stateSchema)
    .addNode("generateIdea", generateIdea)
    .addNode("planProject", planProject)
    .addNode("manageRepository", manageRepository)
    .addNode("developCode", developCode)
    .addEdge(START, "generateIdea")
    .addEdge("generateIdea", "planProject")
    .addEdge("planProject", "manageRepository")
    .addEdge("manageRepository", "developCode")
    .addEdge("developCode", END);

// Compile the graph
const compiledGraph = graph.compile();

// Orchestrator class for running the workflow
class AgentOrchestrator {
    constructor (config) {
        this.config = config;
        this.compiledGraph = compiledGraph;
    }

    async runCycle(input) {
        try {
            const initialState = {
                complexity: input.complexity || "beginner",
                techConstraints: input.techConstraints || ["Node.js"],
                projectSpec: null,
                plan: null,
                repo: null,
                commits: null,
                qualityReport: null,
                documentation: null,
                learningMetrics: null
            };
            return await this.compiledGraph.invoke(initialState);
        } catch (error) {
            console.error('Orchestrator error:', error);
            return {
                projectSpec: JSON.stringify({
                    title: "Fallback Project",
                    type: "Web App",
                    complexity: input.complexity || "beginner",
                    techStack: input.techConstraints || ["Node.js"],
                    features: ["Basic Feature"],
                    timeline: "1 week"
                }),
                plan: JSON.stringify({
                    tasks: [],
                    timeline: "1 week",
                    dependencies: []
                }),
                repo: null,
                commits: null,
                qualityReport: null,
                documentation: null,
                learningMetrics: null
            };
        }
    }
}

export default AgentOrchestrator;