import { readFileSync } from "fs";

export interface ITwitchConfig {
  clientId: string;
  clientSecret: string;
  tokenFilePath: string;
  channelName: string;
}

export interface IOscConfig {
  serverAddress: string;
  serverPort: number;
}

export interface IRewardMappingConfig {
  oscParameterFilter: {
    property: string;
    value: string;
  };
  rewardFilter: {
    titleIncludes: string;
  };
  mappingTemplate: {
    oscType: string;
    oscValue: any;
    timeoutMs: number;
    timeoutOscValue: any;
  };
}

export interface IAppConfig {
  twitch: ITwitchConfig;
  osc: IOscConfig;
  rewardMapping: IRewardMappingConfig;
}

export class ConfigManager {
  private config: IAppConfig;

  constructor() {
    try {
      const rawData = readFileSync("./config/config.json", "utf-8");
      const parsedConfig = JSON.parse(rawData);
      this.config = parsedConfig as IAppConfig;
    } catch (error) {
      console.error(
        "Failed to read or parse config file at ./config/config.json:",
        error
      );
      process.exit(1);
    }
  }

  public getTwitchConfig(): ITwitchConfig {
    return this.config.twitch;
  }

  public getOscConfig(): IOscConfig {
    return this.config.osc;
  }

  public getRewardMappingConfig(): IRewardMappingConfig {
    return this.config.rewardMapping;
  }

  public getFullConfig(): IAppConfig {
    return this.config;
  }
}
