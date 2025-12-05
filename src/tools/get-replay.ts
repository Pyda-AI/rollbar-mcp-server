import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ROLLBAR_API_BASE } from "../config.js";
import { makeRollbarRequest } from "../utils/api.js";
import { RollbarApiResponse } from "../types/index.js";

const REPLAY_FILE_DIRECTORY = path.join(tmpdir(), "rollbar-mcp-replays");

function sanitizeForFilename(value: string) {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-");
}

function buildReplayApiUrl(
  environment: string,
  sessionId: string,
  replayId: string,
): string {
  return `${ROLLBAR_API_BASE}/environment/${encodeURIComponent(
    environment,
  )}/session/${encodeURIComponent(sessionId)}/replay/${encodeURIComponent(
    replayId,
  )}`;
}

async function writeReplayToFile(
  replayData: unknown,
  environment: string,
  sessionId: string,
  replayId: string,
) {
  await mkdir(REPLAY_FILE_DIRECTORY, { recursive: true });
  const uniqueSuffix = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const fileName = [
    "replay",
    sanitizeForFilename(environment),
    sanitizeForFilename(sessionId),
    sanitizeForFilename(replayId),
    uniqueSuffix,
  ]
    .filter(Boolean)
    .join("_")
    .replace(/_+/g, "_")
    .concat(".json");

  const filePath = path.join(REPLAY_FILE_DIRECTORY, fileName);
  await writeFile(filePath, JSON.stringify(replayData, null, 2), "utf8");
  return filePath;
}

export function registerGetReplayTool(server: McpServer) {
  server.tool(
    "get-replay",
    "Get replay data for a specific session replay in Rollbar",
    {
      environment: z
        .string()
        .min(1)
        .describe("Environment name (e.g., production)"),
      sessionId: z
        .string()
        .min(1)
        .describe("Session identifier that owns the replay"),
      replayId: z.string().min(1).describe("Replay identifier to retrieve"),
      rollbar_access_token: z.string().optional(),
    },
    async (args) => {
      const { environment, sessionId, replayId, rollbar_access_token } = args;

      if (!rollbar_access_token) {
        throw new Error("rollbar_access_token is required");
      }

      const replayUrl = buildReplayApiUrl(environment, sessionId, replayId);

      const replayResponse = await makeRollbarRequest<
        RollbarApiResponse<unknown>
      >(replayUrl, "get-replay", rollbar_access_token);

      if (replayResponse.err !== 0) {
        const errorMessage =
          replayResponse.message ||
          `Unknown error (code: ${replayResponse.err})`;
        throw new Error(`Rollbar API returned error: ${errorMessage}`);
      }

      const replayData = replayResponse.result;

      const filePath = await writeReplayToFile(
        replayData,
        environment,
        sessionId,
        replayId,
      );

      return {
        content: [
          {
            type: "text",
            text: `Replay ${replayId} for session ${sessionId} in ${environment} saved to ${filePath}. This file is not automatically deleted—remove it when finished.`,
          },
        ],
      };
    },
  );
}
