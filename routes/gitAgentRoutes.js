import express from "express";
import { gitAgent } from "../controllers/gitAgentController.js";

const router = express.Router();

router.post("/run", gitAgent);

export default router;
