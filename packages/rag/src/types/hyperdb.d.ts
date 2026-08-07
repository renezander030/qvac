// Minimal ambient surface for `hyperdb`. The package ships no types; only the
// members this adapter touches are declared. Raw records read back from the
// store are opaque, so read methods are generic with an `unknown` default and
// callers supply the concrete record shape.
declare module 'hyperdb' {
  import type { Hypercore } from 'corestore'

  // Read view shared by snapshots and transactions.
  export interface HyperDBReader {
    get<T = unknown>(collection: string, query: object): Promise<T | null>
    find<T = unknown>(collection: string, query?: object): { toArray(): Promise<T[]> }
    findOne<T = unknown>(index: string, query: object): Promise<T | null>
  }

  // Read/write transaction obtained via `exclusiveTransaction()`.
  export interface HyperDBTransaction extends HyperDBReader {
    insert(collection: string, record: object): Promise<void>
    delete(collection: string, query: object): Promise<void>
    flush(): Promise<void>
    close(): Promise<void>
  }

  export interface HyperDBInstance {
    readonly core: Hypercore
    ready(): Promise<void>
    close(): Promise<void>
    snapshot(): HyperDBReader
    exclusiveTransaction(): Promise<HyperDBTransaction>
  }

  interface HyperDBStatic {
    bee(core: Hypercore, spec: unknown, opts?: { autoUpdate?: boolean }): HyperDBInstance
  }

  const HyperDB: HyperDBStatic
  export default HyperDB
}
