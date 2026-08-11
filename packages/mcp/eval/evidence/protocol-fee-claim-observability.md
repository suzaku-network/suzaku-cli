# Protocol fee claim observability

## claimProtocolFee-no-event

Source pin: `suzaku-network/suzaku-core` commit
`260de6b00bd873df4778f4dca0a8cd1885499e0d`,
`src/contracts/rewards/RewardsNativeToken.sol`, lines 457–465.

At that pin, `claimProtocolFee(address)` reads the complete `protocolRewards`
balance, reverts when it is zero, sets the stored balance to zero, and transfers
the token balance to the recipient. The function does not emit
`ProtocolFeeClaimed`. Therefore an empty `ProtocolFeeClaimed` log scan cannot
establish that no protocol-fee claim occurred, and historical claimed totals
need a separate transaction/transfer correlation implementation.

The live `protocolRewards()` getter remains authoritative for the exact current
unclaimed balance.
