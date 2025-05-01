export type {
  IAppConfig,
  ITwitchConfig,
  IOscConfig,
  IRewardMappingConfigEntry,
} from "./config/ConfigManager.js";
export { OscClient } from "./osc/OscClient.js";
export type { FlatEntry } from "./osc/OscQuery.js";
export { discoverAvatarParameters } from "./osc/OscQuery.js";
export { getChannelPointRewards } from "./twitch/ChannelRewards.js";
export { getAuthProvider } from "./twitch/TwitchAuth.js";
export type { RewardMapEntry } from "./twitch/TwitchEventSub.js";
export { TwitchEventSubListener } from "./twitch/TwitchEventSub.js";
export { getUserIdByUsername } from "./twitch/UserLookup.js";
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
import { EventEmitter } from "events";

class TwitchOscIntegrationService extends EventEmitter {
  private configManager!: ConfigManager;
  private authProvider: any;
  private apiClient: any;
  private oscClient: OscClient | null = null;
  private twitchChannelId: string | null = null;
  private eventSubListener: TwitchEventSubListener | null = null;
  private params: FlatEntry[] = [];
  private currentConfig: any;

  public async start() {
    try {
      this.emit("status_update", {
        status: "starting",
        message: "Starting Twitch OSC Integration Service...",
      });

      // Instantiate ConfigManager and get configs
      this.configManager = new ConfigManager();
      this.currentConfig = this.configManager.getFullConfig();

      // Listen for config updates
      this.configManager.on(
        "config_updated",
        this.handleConfigUpdate.bind(this)
      );

      // Initial setup
      await this.initializeServices(this.currentConfig);

      this.emit("status_update", {
        status: "running",
        message: "Twitch EventSub listener started. Waiting for events...",
      });
    } catch (error) {
      this.emit("status_update", {
        status: "error",
        message: "Error occurred during start.",
      });
      this.emit("error_report", error);
      console.error("Error in start:", error);
    }
  }

  public async stop() {
    try {
      // Remove config update listener
      if (this.configManager) {
        this.configManager.off(
          "config_updated",
          this.handleConfigUpdate.bind(this)
        );
      }

      // Clean up Twitch EventSub listener
      if (this.eventSubListener) {
        try {
          await this.eventSubListener.stop();
        } catch (e) {
          this.emit("error_report", e);
          console.error(
            "Error stopping TwitchEventSubListener during stop():",
            e
          );
        }
        this.eventSubListener = null;
      }

      // Clean up OSC client
      if (this.oscClient) {
        try {
          this.oscClient.disconnect();
        } catch (e) {
          this.emit("error_report", e);
          console.error("Error disconnecting OscClient during stop():", e);
        }
        this.oscClient = null;
      }

      this.emit("status_update", {
        status: "stopped",
        message: "Twitch OSC Integration Service stopped.",
      });
    } catch (error) {
      this.emit("status_update", {
        status: "error",
        message: "Error occurred during stop.",
      });
      this.emit("error_report", error);
      console.error("Error in stop:", error);
    }
  }
  /**
   * Explicitly refreshes the configuration by reloading it from the ConfigManager.
   * Emits an error_report event if ConfigManager is not initialized.
   */
  public async refreshConfig() {
    if (!this.configManager) {
      this.emit(
        "error_report",
        new Error("ConfigManager not initialized, cannot refresh config.")
      );
      return;
    }
    await this.configManager.reloadConfig();
  }

  private async initializeServices(config: any) {
    // Clean up existing services if any
    if (this.eventSubListener) {
      try {
        await this.eventSubListener.stop();
      } catch (e) {
        this.emit("error_report", e);
        console.error("Error stopping previous TwitchEventSubListener:", e);
      }
      this.eventSubListener = null;
    }
    if (this.oscClient) {
      try {
        this.oscClient.disconnect();
      } catch (e) {
        this.emit("error_report", e);
        console.error("Error disconnecting previous OscClient:", e);
      }
      this.oscClient = null;
    }

    // Twitch config
    const twitchConfig = config.twitch;
    const oscConfig = config.osc;

    // Auth provider
    this.authProvider = await getAuthProvider(
      twitchConfig.clientId,
      twitchConfig.clientSecret,
      twitchConfig.tokenFilePath
    );

    // API client
    this.apiClient = getApiClient(this.authProvider);

    // OSC client
    this.oscClient = new OscClient(
      oscConfig.serverAddress,
      oscConfig.serverPort
    );

    // Get Twitch channel ID
    this.twitchChannelId = (await getUserIdByUsername(
      this.apiClient,
      twitchConfig.channelName
    ))!;

    // Discover OSC params
    this.params = await discoverAvatarParameters();
    console.log(`Found ${this.params.length} avatar params`);

    // Initialize Twitch EventSub listener
    this.eventSubListener = new TwitchEventSubListener(
      this.apiClient,
      this.oscClient,
      this.twitchChannelId
    );

    // Start listening for events
    await this.eventSubListener.start();

    // Initial reward mapping after eventSubListener is ready
    await this.updateRewardMapping(this.params, config);

    // Listen for avatar changes and update reward mapping dynamically
    this.oscClient.onAvatarChange(async (newParams: FlatEntry[]) => {
      console.log("Avatar change detected, updating reward mapping...");
      await this.updateRewardMapping(newParams, config);
    });
  }

  private async updateRewardMapping(params: FlatEntry[], config: any) {
    if (
      !this.apiClient ||
      !this.twitchChannelId ||
      !this.configManager ||
      !this.eventSubListener
    ) {
      this.emit(
        "error_report",
        new Error("Cannot update reward mapping: dependencies not initialized")
      );
      console.error(
        "Cannot update reward mapping: dependencies not initialized"
      );
      return;
    }
    console.log("Getting channel rewards");
    const rewards = await getChannelPointRewards(
      this.apiClient,
      this.twitchChannelId
    );

    const newRewardMap: RewardMapEntry[] =
      this.configManager.getRewardMappingConfig(params, rewards);

    this.eventSubListener.updateMapping(newRewardMap);

    newRewardMap.forEach((p) => {
      console.log(
        `Reward ${p.reward.title} will set ${p.osc.address} as ${
          p.osc.type == "set" ? "set parameter to" + p.osc.value : "toggle"
        }`
      );
    });
  }

  private async handleConfigUpdate(newConfig: any) {
    try {
      this.emit("status_update", {
        status: "config_updating",
        message: "Config updated, checking for changes...",
      });
      console.log("Config updated, checking for changes...");
      // Compare sections
      const twitchChanged = !equal(newConfig.twitch, this.currentConfig.twitch);
      const oscChanged = !equal(newConfig.osc, this.currentConfig.osc);
      const rewardMappingChanged = !equal(
        newConfig.rewardMapping,
        this.currentConfig.rewardMapping
      );

      if (twitchChanged) {
        this.emit("status_update", {
          status: "restarting",
          message:
            "Twitch config changed. Restarting Twitch-related services...",
        });
        console.log(
          "Twitch config changed. Restarting Twitch-related services..."
        );
        await this.initializeServices(newConfig);
        this.emit("status_update", {
          status: "running",
          message: "Twitch-related services restarted.",
        });
      } else if (oscChanged) {
        this.emit("status_update", {
          status: "restarting",
          message: "OSC config changed. Restarting OSC client...",
        });
        console.log("OSC config changed. Restarting OSC client...");
        if (this.oscClient) {
          try {
            this.oscClient.disconnect();
          } catch (e) {
            this.emit("error_report", e);
            console.error("Error disconnecting OscClient:", e);
          }
        }
        const oscConfig = newConfig.osc;
        this.oscClient = new OscClient(
          oscConfig.serverAddress,
          oscConfig.serverPort
        );
        // Reconnect avatar change event
        this.oscClient.onAvatarChange(async (newParams: FlatEntry[]) => {
          console.log("Avatar change detected, updating reward mapping...");
          await this.updateRewardMapping(newParams, newConfig);
        });
        // Update reward mapping
        await this.updateRewardMapping(this.params, newConfig);
        this.emit("status_update", {
          status: "running",
          message: "OSC client restarted.",
        });
      } else if (rewardMappingChanged) {
        this.emit("status_update", {
          status: "updating",
          message: "Reward mapping changed. Updating mapping...",
        });
        console.log("Reward mapping changed. Updating mapping...");
        await this.updateRewardMapping(this.params, newConfig);
        this.emit("status_update", {
          status: "running",
          message: "Reward mapping updated.",
        });
      } else {
        this.emit("status_update", {
          status: "no_change",
          message: "No relevant config changes detected.",
        });
        console.log("No relevant config changes detected.");
      }

      // Update stored config
      this.currentConfig = newConfig;
    } catch (err) {
      this.emit("status_update", {
        status: "error",
        message: "Error handling config update.",
      });
      this.emit("error_report", err);
      console.error("Error handling config update:", err);
    }
  }
}

export { TwitchOscIntegrationService };

/**
 * ============================
 * IPC Interface Definition
 * ============================
 *
 * Main Process Channels (handled by Electron main process):
 *
 *  - 'twitch-osc:start'
 *      Payload: none or config override
 *      Action: Start the Twitch OSC Integration Service.
 *
 *  - 'twitch-osc:stop'
 *      Payload: none
 *      Action: Stop the Twitch OSC Integration Service.
 *
 *  - 'twitch-osc:get-config'
 *      Payload: none
 *      Action: Request the current configuration.
 *
 *  - 'twitch-osc:set-config'
 *      Payload: { config: object }
 *      Action: Set and persist a new configuration.
 *
 * Renderer Process Channels (events emitted from main to renderer):
 *
 *  - 'twitch-osc:status-update'
 *      Payload: { status: 'starting' | 'running' | 'stopped' | 'error' | 'restarting' | 'updating' | 'no_change' | 'config_updating', message: string }
 *      Description: Service status and human-readable message.
 *
 *  - 'twitch-osc:error-report'
 *      Payload: Error object or { message: string, ... }
 *      Description: Detailed error information.
 *
 *  - 'twitch-osc:config-response'
 *      Payload: { config: object }
 *      Description: Current configuration data.
 *
 * Note: The actual IPC handler implementation is not included here.
 */
