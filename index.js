import dotenv from "dotenv";
dotenv.config();
import express from "express";
import gitAgentRoutes from "./routes/gitAgentRoutes.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use("/api/git-agent", gitAgentRoutes);

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
