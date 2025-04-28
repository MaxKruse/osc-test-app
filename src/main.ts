import equal from "fast-deep-equal";
import { OscClient } from "./osc/OscClient.js";
import { getAuthProvider } from "./twitch/TwitchAuth.js";
import { getApiClient } from "./twitch/TwitchApi.js";
import {
  RewardMapEntry,
  TwitchEventSubListener,
} from "./twitch/TwitchEventSub.js";
import { getUserIdByUsername } from "./twitch/UserLookup.js";
import { ConfigManager } from "./config/ConfigManager.js";
import { discoverAvatarParameters, FlatEntry } from "./osc/OscQuery.js";
import { getChannelPointRewards } from "./twitch/ChannelRewards.js";
import { writeFileSync } from "fs";

// Main async function to run the example
async function main() {
  let configManager: ConfigManager;
  let authProvider: any;
  let apiClient: any;
  let oscClient: OscClient | null = null;
  let twitchChannelId: string | null = null;
  let eventSubListener: TwitchEventSubListener | null = null;
  let params: FlatEntry[] = [];
  let currentConfig: any;

  try {
    // Instantiate ConfigManager and get configs
    configManager = new ConfigManager();
    currentConfig = configManager.getFullConfig();

    // Listen for config updates
    configManager.on("config_updated", handleConfigUpdate);

    // Initial setup
    await initializeServices(currentConfig);

    console.log("Twitch EventSub listener started. Waiting for events...");
  } catch (error) {
    console.error("Error in main:", error);
  }

  async function initializeServices(config: any) {
    // Clean up existing services if any
    if (eventSubListener) {
      try {
        await eventSubListener.stop();
      } catch (e) {
        console.error("Error stopping previous TwitchEventSubListener:", e);
      }
      eventSubListener = null;
    }
    if (oscClient) {
      try {
        oscClient.disconnect();
      } catch (e) {
        console.error("Error disconnecting previous OscClient:", e);
      }
      oscClient = null;
    }

    // Twitch config
    const twitchConfig = config.twitch;
    const oscConfig = config.osc;

    // Auth provider
    authProvider = await getAuthProvider(
      twitchConfig.clientId,
      twitchConfig.clientSecret,
      twitchConfig.tokenFilePath
    );

    // API client
    apiClient = getApiClient(authProvider);

    // OSC client
    oscClient = new OscClient(oscConfig.serverAddress, oscConfig.serverPort);

    // Get Twitch channel ID
    twitchChannelId = (await getUserIdByUsername(
      apiClient,
      twitchConfig.channelName
    ))!;

    // Discover OSC params
    params = await discoverAvatarParameters();
    console.log(`Found ${params.length} avatar params`);

    // Initialize Twitch EventSub listener
    eventSubListener = new TwitchEventSubListener(
      apiClient,
      oscClient,
      twitchChannelId
    );

    // Start listening for events
    await eventSubListener.start();

    // Initial reward mapping after eventSubListener is ready
    await updateRewardMapping(params, config);

    // Listen for avatar changes and update reward mapping dynamically
    oscClient.onAvatarChange(async (newParams: FlatEntry[]) => {
      console.log("Avatar change detected, updating reward mapping...");
      await updateRewardMapping(newParams, config);
    });
  }

  // Function to update reward mapping dynamically
  async function updateRewardMapping(params: FlatEntry[], config: any) {
    if (!apiClient || !twitchChannelId || !configManager || !eventSubListener) {
      console.error(
        "Cannot update reward mapping: dependencies not initialized"
      );
      return;
    }
    console.log("Getting channel rewards");
    const rewards = await getChannelPointRewards(apiClient, twitchChannelId);

    const newRewardMap: RewardMapEntry[] = configManager.getRewardMappingConfig(
      params,
      rewards
    );

    eventSubListener.updateMapping(newRewardMap);

    newRewardMap.forEach((p) => {
      console.log(
        `Reward ${p.reward.title} will set ${p.osc.address} as ${
          p.osc.type == "set" ? "set parameter to" + p.osc.value : "toggle"
        }`
      );
    });
  }

  // Handle config updates
  async function handleConfigUpdate(newConfig: any) {
    try {
      console.log("Config updated, checking for changes...");
      // Compare sections
      const twitchChanged = !equal(newConfig.twitch, currentConfig.twitch);
      const oscChanged = !equal(newConfig.osc, currentConfig.osc);
      const rewardMappingChanged = !equal(
        newConfig.rewardMapping,
        currentConfig.rewardMapping
      );

      if (twitchChanged) {
        console.log(
          "Twitch config changed. Restarting Twitch-related services..."
        );
        await initializeServices(newConfig);
      } else if (oscChanged) {
        console.log("OSC config changed. Restarting OSC client...");
        if (oscClient) {
          try {
            oscClient.disconnect();
          } catch (e) {
            console.error("Error disconnecting OscClient:", e);
          }
        }
        const oscConfig = newConfig.osc;
        oscClient = new OscClient(
          oscConfig.serverAddress,
          oscConfig.serverPort
        );
        // Reconnect avatar change event
        oscClient.onAvatarChange(async (newParams: FlatEntry[]) => {
          console.log("Avatar change detected, updating reward mapping...");
          await updateRewardMapping(newParams, newConfig);
        });
        // Update reward mapping
        await updateRewardMapping(params, newConfig);
      } else if (rewardMappingChanged) {
        console.log("Reward mapping changed. Updating mapping...");
        await updateRewardMapping(params, newConfig);
      } else {
        console.log("No relevant config changes detected.");
      }

      // Update stored config
      currentConfig = newConfig;
    } catch (err) {
      console.error("Error handling config update:", err);
    }
  }
}

// Run the main function
main();
