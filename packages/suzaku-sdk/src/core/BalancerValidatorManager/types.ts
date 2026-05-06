
export interface Validator {
  status: number;
  nodeID: `0x${string}`;
  startingWeight: bigint;
  sentNonce: bigint;
  receivedNonce: bigint;
  weight: bigint;
  startTime: bigint;
  endTime: bigint;
}

export enum ValidatorStatus {
  Unknown,
  PendingAdded,
  Active,
  PendingRemoved,
  Completed,
  Invalidated,
  PendingStakeUpdated
}
