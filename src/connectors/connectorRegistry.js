export class ConnectorRegistry {
  constructor() {
    this.connectors = new Map();
  }

  register(connector) {
    if (!connector?.name) throw new Error("Connector must include name.");
    this.connectors.set(connector.name, connector);
  }

  list() {
    return [...this.connectors.values()];
  }

  get(name) {
    const connector = this.connectors.get(name);
    if (!connector) throw new Error(`Connector not found: ${name}`);
    return connector;
  }
}
