import type { Hono } from "hono";

/** A feature's plain Hono routes (binary upload, SNS), mounted by main.api.ts. */
export type HttpRoutes = (app: Hono) => void;
