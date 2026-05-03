export interface StoragePort {
  save(slotId: number, data: string): Promise<void>;
  load(slotId: number): Promise<string>;
}
