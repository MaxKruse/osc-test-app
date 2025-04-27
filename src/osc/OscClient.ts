import { Client, ClientSendArgs } from "node-osc";

export class OscClient {
  private host: string;
  private port: number;

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  public async send(address: string, ...args: ClientSendArgs) {
    const client = new Client(this.host, this.port);
    client.send(address, ...args);
  }
}
