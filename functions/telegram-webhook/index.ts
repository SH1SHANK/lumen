import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { webhookCallback } from "https://esm.sh/grammy@1.34.0";
import "./utils/env.ts";
import { bot } from "./bot/bot.ts";
import { authMiddleware } from "./bot/middleware.ts";
import { registerRoutes } from "./bot/router.ts";

// Register middleware
bot.use(authMiddleware);

// Register all routes
registerRoutes();

serve(async (req) => {
  const url = new URL(req.url);
  const mode =
    url.searchParams.get("mode") ?? req.headers.get("x-execution-mode");

  if (mode === "job") {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const jobName =
      url.searchParams.get("job") ?? req.headers.get("x-job-name");

    if (jobName === "reminders") {
      const { runReminders } = await import("./jobs/reminders.ts");
      await runReminders();
      return new Response("OK", { status: 200 });
    }

    if (jobName === "daily-brief") {
      const { runDailyBrief } = await import("./jobs/dailyBrief.ts");
      await runDailyBrief();
      return new Response("OK", { status: 200 });
    }

    return new Response("Unknown job", { status: 400 });
  }

  if (req.method === "GET") {
    return new Response("Lumen Bot is running", { status: 200 });
  }

  if (req.method === "POST") {
    const start = Date.now();
    try {
      // Webhook handler must return promptly (<10s)
      return await webhookCallback(bot, "std/http")(req);
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response("Error processing update", { status: 500 });
    } finally {
      const durationMs = Date.now() - start;
      console.log(`Webhook handled in ${durationMs}ms`);
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
