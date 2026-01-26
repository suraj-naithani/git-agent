import { randomUUID } from "crypto";
import { Octokit } from "@octokit/rest";
import { WebClient } from "@slack/web-api";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { chatLLM } from "../utils/model.js";

// Enhanced error logging utility
const logError = (agentName, error, context = {}) => {
    console.error(`[${agentName}] Error:`, {
        message: error.message,
        stack: error.stack,
        context,
        timestamp: new Date().toISOString()
    });
};

// Input validation utility
const validateState = (state, requiredFields = []) => {
    const missing = requiredFields.filter(field => !state[field]);
    if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
    return true;
};

// AI-powered README generation function with retry logic
const generateAIReadme = async (projectSpec, repo) => {
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`🔄 Attempting to generate README (attempt ${attempt}/${maxRetries})...`);

            const model = chatLLM();
            const parser = new StringOutputParser();

            const prompt = `You are a SENIOR TECHNICAL WRITER and SOFTWARE DOCUMENTATION EXPERT with 15+ years of experience at top tech companies. Create a PROFESSIONAL, OPTIMIZED, and ENGAGING README.md file for this project.

                            PROJECT DETAILS:
                            ${JSON.stringify(projectSpec, null, 2)}
                            
                            REPOSITORY: ${repo.name}
                            REPO URL: ${repo.html_url}
                            
                            REQUIREMENTS:
                            1. **PROFESSIONAL FORMATTING**: Use proper Markdown syntax with emojis, badges, and clear sections
                            2. **OPTIMIZED STRUCTURE**: Follow industry best practices for README organization
                            3. **ENGAGING CONTENT**: Make it attractive and informative for developers
                            4. **TECHNICAL ACCURACY**: Ensure all technical details are correct and up-to-date
                            5. **COMPLETE SECTIONS**: Include all essential README sections
                            6. **PRODUCTION READY**: Make it suitable for professional GitHub repositories
                            
                            MANDATORY SECTIONS (in this order):
                            1. **Project Title** - With badges (build status, version, etc.)
                            2. **Project Description** - Clear, concise overview
                            3. **Features** - Bullet points of key features
                            4. **Tech Stack** - Organized by frontend/backend/database/etc.
                            5. **Installation** - Setup instructions with bullet points
                            6. **Usage** - How to use the project
                            7. **API Documentation** - If it's an API project
                            8. **Testing** - How to run tests
                            9. **Deployment** - Deployment instructions
                            10. **Contributing** - Guidelines for contributors
                            
                            TECH STACK ORGANIZATION:
                            - Group technologies logically (Frontend, Backend, Database, DevOps, etc.)
                            - Use appropriate icons/emojis for each technology
                            - Include version requirements if critical
                            
                            INSTALLATION INSTRUCTIONS (CRITICAL FORMATTING):
                            - Use bullet points (-) for each step
                            - Put ALL commands in \`\`\`bash code blocks
                            - Each command should be on a separate line
                            - Make it copy-paste friendly
                            - NEVER put commands inline with text
                            - NEVER use "bash" prefix before commands
                            
                            CRITICAL WARNINGS:
                            - NEVER put installation commands inline like "bash git clone" - use proper code blocks
                            - ALWAYS put commands in separate \`\`\`bash code blocks
                            - ALWAYS use bullet points (-) for installation steps
                            
                            Return ONLY the complete README.md content in Markdown format. No explanations, no code blocks, just the raw README content.`;

            const response = await model.invoke([["human", prompt]]);
            let readmeContent = await parser.parse(response.content);

            // Clean up the response
            readmeContent = readmeContent
                .replace(/```(?:markdown|md)?\s*/gi, "")
                .replace(/```/g, "")
                .trim();

            // Validate that we got actual README content
            if (!readmeContent || readmeContent.length < 100) {
                throw new Error('Generated README content is too short');
            }

            // Check if it starts with a proper heading
            if (!readmeContent.startsWith('#')) {
                readmeContent = `# ${projectSpec.title}\n\n${readmeContent}`;
            }

            console.log(`✅ AI-generated README content (${readmeContent.length} characters)`);
            return readmeContent;

        } catch (error) {
            lastError = error;
            console.error(`❌ AI README generation attempt ${attempt} failed:`, error.message);

            if (attempt < maxRetries) {
                console.log(`🔄 Retrying in 2 seconds...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    }

    // If all retries failed, throw the last error
    console.error(`❌ All ${maxRetries} attempts to generate README failed`);
    throw new Error(`Failed to generate README after ${maxRetries} attempts: ${lastError.message}`);
};




// Domain rotation to ensure different project types
const DOMAIN_ROTATION = [
  { domain: "FinTech", examples: ["BudgetTracker", "ExpenseManager", "InvoiceGenerator", "PaymentPortal"] },
  { domain: "E-commerce", examples: ["ProductCatalog", "OrderManager", "InventoryHub", "ShopifyClone"] },
  { domain: "DevOps", examples: ["DeployPipeline", "LogAnalyzer", "ServerMonitor", "ConfigManager"] },
  { domain: "EdTech", examples: ["QuizPlatform", "CourseBuilder", "StudyTracker", "LearningHub"] },
  { domain: "Logistics", examples: ["ShipmentTracker", "RouteOptimizer", "WarehouseManager", "DeliveryApp"] },
  { domain: "HR / Recruitment", examples: ["ApplicantTracker", "OnboardingPortal", "TimeSheetManager", "TalentFinder"] },
  { domain: "LegalTech", examples: ["ContractManager", "CaseTracker", "DocumentReview", "ComplianceChecker"] },
  { domain: "Real Estate", examples: ["PropertyListing", "RentalManager", "TourScheduler", "LeaseTracker"] },
  { domain: "Marketing Automation", examples: ["EmailCampaign", "LeadScorer", "SocialScheduler", "AnalyticsDash"] },
  { domain: "Customer Support", examples: ["TicketSystem", "ChatbotBuilder", "KnowledgeBase", "FeedbackCollector"] },
  { domain: "Analytics / BI", examples: ["DataVisualizer", "ReportGenerator", "MetricsDashboard", "TrendAnalyzer"] },
  { domain: "IoT", examples: ["SensorDashboard", "DeviceManager", "DataCollector", "AutomationHub"] },
  { domain: "Gaming", examples: ["LeaderboardAPI", "PlayerStats", "GameServer", "AchievementTracker"] },
  { domain: "Social Media", examples: ["ContentScheduler", "EngagementTracker", "ProfileManager", "FeedAggregator"] },
  { domain: "Cybersecurity", examples: ["VulnerabilityScanner", "LogMonitor", "AccessControl", "ThreatDetector"] }
];

// Check if a project name is too similar to previous ones
function isSimilarProject(newTitle, previousProjects) {
  const normalize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, '');
  const newNormalized = normalize(newTitle);

  for (const prev of previousProjects) {
    // Extract just the project name (before parentheses with tech stack)
    const prevName = prev.split('(')[0].trim();
    const prevNormalized = normalize(prevName);

    // Check for exact match or very similar names
    if (prevNormalized === newNormalized) {
      return true;
    }

    // Check if one is substring of another (e.g., "HealthSync" and "HealthSyncPro")
    if (prevNormalized.includes(newNormalized) || newNormalized.includes(prevNormalized)) {
      return true;
    }
  }

  return false;
}

export const generateIdea = async (state) => {
    const MAX_RETRIES = 5;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        validateState(state, ["complexity"]);

        const model = chatLLM({
          json: true,
          temperature: 0.95, // Higher temperature for more creativity
          top_p: 0.95
        });

        const previousProjects = state.previousProjects || [];
        const previousList = previousProjects.length
          ? previousProjects.map(p => `- ${p}`).join("\n")
          : "- None";

        // Select domain based on number of previous projects (rotate through domains)
        const domainIndex = previousProjects.length % DOMAIN_ROTATION.length;
        const forcedDomain = DOMAIN_ROTATION[domainIndex];

        // Generate unique seed
        const techStack = state.techConstraints || [];
        const techStackSeed = techStack.join("-").toLowerCase();
        const randomSeed = Date.now().toString(36).slice(-6);
        const attemptSeed = attempt > 0 ? `-retry${attempt}` : '';
        const uniquenessSeed = `${techStackSeed}-${randomSeed}${attemptSeed}`;

        console.log(`🎯 Attempt ${attempt + 1}: Forcing domain "${forcedDomain.domain}" with seed ${uniquenessSeed}`);

        const prompt = `
You are a senior product architect and startup idea generator.

⚠️ CRITICAL ENFORCEMENT RULES ⚠️
1. You MUST generate a project in the "${forcedDomain.domain}" domain
2. Your project MUST be COMPLETELY DIFFERENT from ALL previous projects
3. DO NOT use these names or anything similar: ${previousProjects.map(p => p.split('(')[0].trim()).join(', ') || 'None yet'}
4. DO NOT add numeric suffixes (-1, -2, v2, pro, plus, max, new)
5. If you're on retry attempt ${attempt + 1}, be MORE creative than before

Previously generated projects (BANNED - DO NOT GENERATE ANYTHING SIMILAR):
${previousList}

🎯 MANDATORY DOMAIN: ${forcedDomain.domain}

You MUST create a project in the ${forcedDomain.domain} domain. Here are example project types (for inspiration only - create something DIFFERENT):
${forcedDomain.examples.map(ex => `- ${ex}`).join('\n')}

UNIQUENESS SEED: ${uniquenessSeed}
This is a unique identifier for THIS generation. Use it to create something truly novel.

${state.projectName ? `
SPECIFIC PROJECT REQUEST:
User wants a project involving: "${state.projectName}"
You MUST create a unique ${forcedDomain.domain} project that incorporates this concept.
` : `
CREATE A FRESH, ORIGINAL ${forcedDomain.domain} PROJECT.
Think about real problems in ${forcedDomain.domain} that need solving.
`}

Technical Constraints:
- Complexity: ${state.complexity}
- Tech Stack: ${state.techConstraints?.join(", ") || "No constraints"}
- The tech stack is just tools - the PROJECT IDEA must be unique

${state.description ? `
User Description: "${state.description}"
Interpret this in the context of ${forcedDomain.domain} domain.
` : ""}

PROJECT NAMING REQUIREMENTS:
1. Must be creative and unique
2. Must reflect the ${forcedDomain.domain} domain
3. Must NOT resemble any previous project names
4. Must be a single, clear name (no suffixes or versions)
5. Example good names: "ProcureFlow", "VendorSync", "AuditTrail", "ClaimStream"

BANNED NAME PATTERNS:
❌ HealthSync, HealthSync-1, HealthSyncPro, HealthSyncPlus
❌ TaskManager, TaskManager-2, TaskManagerPro
❌ Any name that already appears in the previous projects list

Return ONLY valid JSON:
{
  "title": "UniqueProjectName",
  "type": "Web App | CLI Tool | API | Library | Mobile App | Data Processing | Automation Script",
  "complexity": "Beginner | Intermediate | Advanced",
  "techStack": ["technology1", "technology2"],
  "features": ["feature1", "feature2", "feature3"],
  "timeline": "estimated duration",
  "description": "Brief description focusing on ${forcedDomain.domain} domain",
  "targetAudience": "Specific audience in ${forcedDomain.domain} sector"
}
`;

        const response = await model.invoke([["human", prompt]]);
        let cleaned = response.content.replace(/```json|```/g, "").trim();

        let projectSpec;
        try {
          projectSpec = JSON.parse(cleaned);

          // HARD SAFETY: remove numeric suffixes or versions
          if (projectSpec.title) {
            projectSpec.title = projectSpec.title
              .replace(/\s*-\s*\d+$/i, "")
              .replace(/\s*v\d+$/i, "")
              .replace(/\s*(pro|plus|new|max|premier|ultimate)$/i, "")
              .trim();
          }

          // VALIDATION: Check if project is too similar to previous ones
          if (isSimilarProject(projectSpec.title, previousProjects)) {
            console.log(`⚠️ Generated project "${projectSpec.title}" is too similar to previous projects. Retrying...`);
            attempt++;

            if (attempt >= MAX_RETRIES) {
              // Generate a completely random name as last resort
              const randomNames = [
                "ProcureFlow", "VendorSync", "AuditTrail", "ClaimStream",
                "FleetCommand", "CargoHub", "RouteWise", "DispatchPro",
                "TalentBridge", "OnboardFlow", "TimeKeeper", "ShiftMaster",
                "DealFlow", "LeaseWise", "PropertyVault", "TenantHub"
              ];
              const randomIndex = Math.floor(Math.random() * randomNames.length);
              projectSpec.title = `${randomNames[randomIndex]}${Date.now().toString(36).slice(-4)}`;
              console.log(`🎲 Using fallback name: ${projectSpec.title}`);
            } else {
              // Wait a bit before retry to get different timestamp
              await new Promise(resolve => setTimeout(resolve, 100));
              continue;
            }
          }

          cleaned = JSON.stringify(projectSpec, null, 2);

          console.log(`✅ Generated unique project: ${projectSpec.title} in ${forcedDomain.domain} domain`);

        } catch (err) {
          console.error("❌ JSON Parse Error:", response.content);
          throw new Error("Invalid JSON response from model");
        }

        return {
          ...state,
          projectSpec: cleaned,
          previousProjects: [...previousProjects, projectSpec.title]
        };

      } catch (error) {
        console.error(`❌ generateIdea error on attempt ${attempt + 1}:`, error);
        attempt++;

        if (attempt >= MAX_RETRIES) {
          // Fallback with truly unique name
          const fallbackName = `SystemTool${Date.now().toString(36)}`;
          return {
            ...state,
            projectSpec: JSON.stringify({
              title: fallbackName,
              type: "Web App",
              complexity: state.complexity,
              techStack: state.techConstraints || ["Node.js"],
              features: ["Core feature", "Secondary feature"],
              timeline: "2 weeks",
              description: "Fallback unique project due to generation error",
              targetAudience: "Developers"
            })
          };
        }
      }
    }
  };
  

export const planProject = async (state) => {
    try {
        // Validate input state
        validateState(state, ['projectSpec']);

        const model = chatLLM({ json: true });

        // Parse and validate project specification
        let projectSpec;
        try {
            projectSpec = JSON.parse(state.projectSpec);
        } catch (parseError) {
            logError('planProject', parseError, { projectSpec: state.projectSpec });
            throw new Error('Invalid projectSpec JSON');
        }

        // Enhanced planning prompt with better task breakdown
        const prompt = `You are an expert project planner and software architect. Create a detailed implementation plan for the following project:
                        Project: ${JSON.stringify(projectSpec, null, 2)}

                        Requirements:
                        - Break down the project into logical, implementable tasks
                        - Each task should be atomic and commit-worthy
                        - Consider dependencies between tasks
                        - Provide realistic timeline estimates
                        - Include file paths that make sense for the project structure
                        - Ensure tasks align with the project's complexity level

                        Return ONLY valid JSON in this exact format:
                        {
                          "tasks": [
                            {
                              "title": "Task Name",
                              "description": "Detailed task description",
                              "filePath": "path/to/file",
                              "estimatedTime": "time estimate",
                              "priority": "high|medium|low"
                            }
                          ],
                                                  "timeline": "Estimated timeline",
                          "dependencies": ["dependency1", "dependency2"],
                          "milestones": ["milestone1", "milestone2"],
                          "riskFactors": ["risk1", "risk2"]}`;

        const response = await model.invoke([["human", prompt]]);
        const cleaned = response.content.replace(/```json|```/g, "").trim();

        // Validate JSON response
        try {
            const plan = JSON.parse(cleaned);
            if (!plan.tasks || !Array.isArray(plan.tasks)) {
                throw new Error('Invalid plan structure: missing tasks array');
            }
        } catch (parseError) {
            logError('planProject', parseError, { response: response.content });
            throw new Error('Invalid JSON response from model');
        }

        return { ...state, plan: cleaned };
    } catch (error) {
        logError('planProject', error, { state });

        // Fallback response - maintains exact same output format
        return {
            ...state,
            plan: JSON.stringify({
                tasks: [],
                timeline: "1 week",
                dependencies: [],
                milestones: [],
                riskFactors: []
            })
        };
    }
};

export const manageRepository = async (state) => {
    try {
        // Validate input state
        validateState(state, ['projectSpec']);

        // Determine GitHub token for this run (supports per-state token)
        const effectiveToken = state.githubToken || process.env.GITHUB_TOKEN;

        // Check for GitHub token
        if (!effectiveToken) {
            logError('manageRepository', new Error('GITHUB_TOKEN not found'), { state });
            return {
                ...state,
                repo: { name: "mock-repo", url: "http://mock-repo.com" }
            };
        }

        const github = new Octokit({ auth: effectiveToken });

        // Parse and validate project specification
        let projectSpec;
        try {
            projectSpec = JSON.parse(state.projectSpec);
        } catch (parseError) {
            logError('manageRepository', parseError, { projectSpec: state.projectSpec });
            return { ...state, repo: { name: "mock-repo", url: "http://mock-repo.com" } };
        }

        // Enhanced repository name generation - use project title directly (already unique from controller)
        const repoName = projectSpec.title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
            .replace(/\s+/g, '-') // Replace spaces with hyphens
            .replace(/-+/g, '-') // Replace multiple hyphens with single
            .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
            .substring(0, 100); // GitHub repo name limit

        // Enhanced repository description
        let repoDescription = `A ${projectSpec.complexity?.toLowerCase() || 'intermediate'} ${projectSpec.type?.toLowerCase() || 'software'} project: ${projectSpec.title}.`;

        if (projectSpec.description) {
            repoDescription += ` ${projectSpec.description}`;
        }

        if (projectSpec.techStack && projectSpec.techStack.length > 0) {
            repoDescription += ` Built with ${projectSpec.techStack.join(', ')}.`;
        }

        // Truncate description if too long
        if (repoDescription.length > 350) {
            repoDescription = repoDescription.substring(0, 347) + '...';
        }

        // Get authenticated user's username
        const { data: user } = await github.users.getAuthenticated();
        const owner = user.login;

        // Try to create repository with simple name, append number if it exists
        let repo;
        let finalRepoName = repoName;
        let attempt = 0;
        const maxAttempts = 10;
        
        while (attempt < maxAttempts) {
            try {
                // Check if repository already exists
                try {
                    await github.repos.get({ owner, repo: finalRepoName });
                    // Repository exists, try with number suffix
                    attempt++;
                    finalRepoName = `${repoName}-${attempt}`;
                    console.log(`⚠️ Repository "${repoName}" exists, trying "${finalRepoName}"...`);
                    continue;
                } catch (checkError) {
                    if (checkError.status === 404) {
                        // Repository doesn't exist, we can create it
                        break;
                    } else {
                        throw checkError;
                    }
                }
            } catch (checkError) {
                // If check fails for other reason, try creating anyway
                break;
            }
        }

        // Create the repository
        try {
            repo = (await github.repos.createForAuthenticatedUser({
                name: finalRepoName,
                description: repoDescription,
                private: false,
                auto_init: false, // Don't auto-initialize to avoid conflicts
                gitignore_template: 'Node' // Add appropriate .gitignore
            })).data;
            console.log(`✅ Created new repository: ${finalRepoName}`);
        } catch (error) {
            // If repository creation fails, throw error
            logError('manageRepository', error, { repoName: finalRepoName, state });
            throw error;
        }

        // Generate README content using AI for better quality
        const readmeContent = await generateAIReadme(projectSpec, repo);

        // Update or create README
        let readmeSha;
        try {
            const { data } = await github.rest.repos.getContent({
                owner,
                repo: repoName,
                path: "README.md"
            });
            readmeSha = data.sha;
        } catch (err) {
            if (err.status !== 404) throw err;
        }

        await github.rest.repos.createOrUpdateFileContents({
            owner,
            repo: finalRepoName,
            path: "README.md",
            message: readmeSha ? "Update README with project details" : "Initial commit: Add comprehensive README",
            content: Buffer.from(readmeContent).toString("base64"),
            branch: "main",
            sha: readmeSha
        });

        return { ...state, repo: { name: repo.name, url: repo.html_url } };
    } catch (error) {
        logError('manageRepository', error, { state });
        return {
            ...state,
            repo: { name: "mock-repo", url: "http://mock-repo.com" }
        };
    }
};









