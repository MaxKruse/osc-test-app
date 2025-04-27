import { Client, ClientSendArgs, Server } from "node-osc";
import { discoverAvatarParameters } from "./OscQuery.js";
import EventEmitter from "events";

export class OscClient {
  private host: string;
  private port: number;
  private server: Server;

  private avatarParams: Map<string, any>;

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;

    this.avatarParams = new Map<string, any>();

    // when the server receives a message with /avatar/parameters/ we capture the value
    this.server = new Server(this.port + 1, "0.0.0.0");

    this.server.on("message", async (msg) => {
      const [address, ...values] = msg;

      if (
        address.startsWith("/avatar/parameters/") &&
        !address.startsWith("/avatar/parameters/VF")
      ) {
        this.avatarParams.set(address, values[0]);
      }

      if (address === "/avatar/change") {
        const newParams = await discoverAvatarParameters();

        // todo: somehow update the currently running TwitchEventSubListener to use these new Params instead. e.g. remap everything
      }
    });
  }

  onAvatarChange(listener: (...args: any[]) => void) {
    this.server.on("message", async (msg) => {
      const [address, ...values] = msg;

      if (address === "/avatar/change") {
        const newParams = await discoverAvatarParameters();
        listener(newParams);
      }
    });
  }

  public async sendToggle(address: string, timer?: number) {
    const before = await this.get(address);

    this.send(address, !before);

    if (timer == undefined) return;

    setTimeout(() => {
      this.send(address, before);
    }, timer);
  }

  public async send(address: string, ...args: ClientSendArgs) {
    const client = new Client(this.host, this.port);
    client.send(address, ...args);
  }

  public async get(addr: string) {
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 100);
    });

    return this.avatarParams.get(addr);
  }
}
