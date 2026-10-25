// Isolated browser-test utility; never mounted by the application.
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { registerOnsPilot } from "../src/ons/http.server.ts";
const app = new Hono();
registerOnsPilot(app, process.env.WG_RESOURCE_ROOT!);
app.get("/4/1/", c => c.html("<!doctype html><title>WG isolated storage test</title>"));
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 18491 });
