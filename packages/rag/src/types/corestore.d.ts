// Minimal ambient surface for `corestore` and the hypercore it hands out.
// The package ships no types; only the members this adapter touches are declared.
declare module 'corestore' {
  // A duplex replication stream connecting two hypercores.
  export interface ReplicationStream {
    pipe(destination: ReplicationStream): ReplicationStream
    destroy(): void
  }

  // A single append-only hypercore log.
  export interface Hypercore {
    replicate(isInitiator: boolean): ReplicationStream
  }

  // A store of named hypercores.
  export class Corestore {
    constructor(storage: string, options?: Record<string, unknown>)
    ready(): Promise<void>
    get(options: { name: string }): Hypercore
    close(): Promise<void>
  }

  export default Corestore
}
