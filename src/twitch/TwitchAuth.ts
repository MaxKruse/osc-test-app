import {
  RefreshingAuthProvider,
  AccessToken,
  StaticAuthProvider,
} from "@twurple/auth";
import { loadTokens, saveTokens } from "./TokenStorage.js";

import express from "express";
import http from "http";
import open from "open"; // Note: Ensure 'express', 'open', and their types '@types/express', '@types/open' are installed
export async function getAuthProvider(
  clientId: string,
  clientSecret: string,
  tokenPath: string
): Promise<RefreshingAuthProvider> {
  const authProvider = new RefreshingAuthProvider({
    clientId,
    clientSecret,
    redirectUri: "http://localhost:3000",
    appImpliedScopes: ["channel:read:redemptions"],
  });

  authProvider.onRefresh(async (userId, token) => {
    await saveTokens(tokenPath, token);
  });

  const initialToken = await loadTokens(tokenPath);
  if (initialToken) {
    await authProvider.addUserForToken(initialToken);
  } else {
    await new Promise<void>(async (resolve, reject) => {
      const app = express();
      const port = 3000; // As per plan, ensure redirectUri in authProvider matches if necessary
      let server: http.Server | null = null;

      // Function to gracefully shut down the server
      const shutdownServer = () => {
        server?.close(() => {
          console.log("Temporary auth server closed.");
        });
      };

      // Redirect handler - This is where Twitch sends the user back after authorization
      app.get("/", async (req, res) => {
        const code = req.query.code as string | undefined;

        if (!code) {
          console.error("Authentication failed: No code received from Twitch.");
          try {
            res.status(400).send("Authentication failed: No code received.");
          } catch (e) {
            /* ignore */
          } // Ignore error if response already sent/closed
          shutdownServer();
          reject(
            new Error("Authentication failed: No code received from Twitch.")
          );
          return;
        }

        console.log(
          "Received authorization code from Twitch. Exchanging for token..."
        );

        try {
          // Exchange the authorization code for an access token
          // Note: RefreshingAuthProvider needs the *initial* token via exchangeCodeForAccessToken
          // It doesn't have a direct exchangeCode method like StaticAuthProvider might.
          // Exchange the authorization code for an access token via Twitch API
          const params = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            grant_type: "authorization_code",
            redirect_uri: "http://localhost:3000",
            scope: "channel:read:redemptions",
          });

          const response = await fetch(
            `https://id.twitch.tv/oauth2/token?${params.toString()}`,
            {
              method: "POST",
            }
          );

          if (!response.ok) {
            throw new Error(`Token exchange failed: ${response.statusText}`);
          }

          const tokenData = await response.json();

          // Construct AccessToken object
          const initialToken: AccessToken = {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresIn: tokenData.expires_in,
            obtainmentTimestamp: Date.now(),
            scope: tokenData.scope,
          };

          console.log("Access token obtained successfully.");

          // Save the obtained token
          await saveTokens(tokenPath, initialToken);
          console.log("Token saved.");

          // Add the user/token to the authProvider instance
          // Important: Use the *same* token object returned by exchangeCodeForAccessToken
          await authProvider.addUserForToken(initialToken);
          console.log("User added to AuthProvider.");

          // Send a success response to the browser
          res
            .status(200)
            .send("Authentication successful! You can close this window.");

          // Shutdown the temporary server
          shutdownServer();

          // Resolve the main promise to signal completion
          resolve();
        } catch (error) {
          console.error("Error exchanging code or processing token:", error);
          try {
            res
              .status(500)
              .send("Authentication failed: Error processing token.");
          } catch (e) {
            /* ignore */
          }
          shutdownServer();
          reject(error); // Reject the main promise on error
        }
      });

      try {
        server = app.listen(port, async () => {
          try {
            // Define required scopes. Adjust if specific scopes are needed.
            const scopes: string[] = ["channel:read:redemptions"]; // Example: ['chat:read', 'channel:read:redemptions'] - Adjust as needed!
            const redirectUri = `http://localhost:${port}`;
            const authUrlParams = new URLSearchParams({
              client_id: clientId, // clientId is available from the outer function scope
              redirect_uri: redirectUri,
              response_type: "code",
              scope: scopes.join(" "),
            });
            const authorizationUrl = `https://id.twitch.tv/oauth2/authorize?${authUrlParams.toString()}`;

            console.log(
              `\n!!! ACTION REQUIRED !!!\nPlease open the following URL in your browser to authenticate:\n${authorizationUrl}\n`
            );

            // Attempt to open the URL automatically
            await open(authorizationUrl);

            console.log("Waiting for authentication callback...");
          } catch (error) {
            console.error(
              "Error generating auth URL or opening browser:",
              error
            );
            shutdownServer();
            reject(error); // Reject the main promise on error
          }
        });

        server.on("error", (error) => {
          console.error("Server startup error:", error);
          reject(error); // Reject the main promise on server error
        });
      } catch (error) {
        console.error("Error setting up server listener:", error);
        reject(error); // Reject the main promise
      }
    });
  }

  return authProvider;
}
