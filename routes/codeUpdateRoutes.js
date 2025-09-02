import express from "express";
import { updateCode, deleteFileOrFolder } from "../controllers/codeUpdateController.js";

const router = express.Router();

// Code update endpoint
router.post("/update", updateCode);

// Delete file or folder endpoint
router.delete("/delete", deleteFileOrFolder);

export default router;
