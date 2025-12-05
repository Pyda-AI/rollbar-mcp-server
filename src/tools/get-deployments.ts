import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ROLLBAR_API_BASE } from "../config.js";
import { makeRollbarRequest } from "../utils/api.js";
import { RollbarApiResponse, RollbarDeployResponse } from "../types/index.js";

export function registerGetDeploymentsTool(server: McpServer) {
  server.tool(
    "rollbar-get-deployments",
    "Get deployments data from Rollbar",
    {
      limit: z
        .number()
        .int()
        .describe("Number of Rollbar deployments to retrieve"),
      rollbar_access_token: z.string().optional(),
    },
    async (args) => {
      const { limit, rollbar_access_token } = args;

      if (!rollbar_access_token) {
        throw new Error("rollbar_access_token is required");
      }

      const deploysUrl = `${ROLLBAR_API_BASE}/deploys?limit=${limit}`;
      const deploysResponse = await makeRollbarRequest<
        RollbarApiResponse<RollbarDeployResponse>
      >(deploysUrl, "get-deployments", rollbar_access_token);

      if (deploysResponse.err !== 0) {
        const errorMessage =
          deploysResponse.message ||
          `Unknown error (code: ${deploysResponse.err})`;
        throw new Error(`Rollbar API returned error: ${errorMessage}`);
      }

      const deployments = deploysResponse.result;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(deployments),
          },
        ],
      };
    },
  );
}
