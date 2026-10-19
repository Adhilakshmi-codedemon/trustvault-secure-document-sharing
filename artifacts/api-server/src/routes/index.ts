import { Router, type IRouter } from "express";
import healthRouter from "./health";
import trustVaultAccountRouter from "./trustvault-account";
import trustVaultAdminRouter from "./trustvault-admin";
import trustVaultDocumentsRouter from "./trustvault-documents";

const router: IRouter = Router();

router.use(healthRouter);
router.use(trustVaultAccountRouter);
router.use(trustVaultDocumentsRouter);
router.use(trustVaultAdminRouter);

export default router;
