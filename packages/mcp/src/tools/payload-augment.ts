import { weiToToken, exchangeRate } from './heartbeat.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asWeiString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function feePercent(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${(value / 100).toFixed(2)}%`
    : undefined;
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function augmentEpochStatus<T>(data: T): T {
  try {
    if (!isRecord(data) || !isRecord(data.epochStatusTable) || !Array.isArray(data.epochStatusTable.epochs)) {
      return data;
    }

    const epochs = data.epochStatusTable.epochs.map((row) => {
      if (!isRecord(row)) return row;
      return {
        ...row,
        ...(!hasOwn(row, 'epochRewardsHuman') ? { epochRewardsHuman: weiToToken(asWeiString(row.epochRewards)) } : {}),
      };
    });

    return {
      ...data,
      epochStatusTable: {
        ...data.epochStatusTable,
        epochs,
        ...(!hasOwn(data.epochStatusTable, 'humanNote') ? { humanNote: 'human values assume 18 decimals' } : {}),
      },
    } as T;
  } catch {
    return data;
  }
}

export function augmentFeesConfig<T>(data: T): T {
  try {
    if (!isRecord(data) || !isRecord(data.feesConfig)) {
      return data;
    }

    const feesConfig = { ...data.feesConfig };
    const protocolFeePercent = feePercent(feesConfig.protocolFee);
    const operatorFeePercent = feePercent(feesConfig.operatorFee);
    const curatorFeePercent = feePercent(feesConfig.curatorFee);

    if (protocolFeePercent !== undefined && !hasOwn(feesConfig, 'protocolFeePercent')) feesConfig.protocolFeePercent = protocolFeePercent;
    if (operatorFeePercent !== undefined && !hasOwn(feesConfig, 'operatorFeePercent')) feesConfig.operatorFeePercent = operatorFeePercent;
    if (curatorFeePercent !== undefined && !hasOwn(feesConfig, 'curatorFeePercent')) feesConfig.curatorFeePercent = curatorFeePercent;

    if (!hasOwn(feesConfig, 'feeUnit')) feesConfig.feeUnit = 'bps';
    if (!hasOwn(feesConfig, 'feeUnitNote')) feesConfig.feeUnitNote = '10000 bps = 100%';

    return {
      ...data,
      feesConfig,
    } as T;
  } catch {
    return data;
  }
}

export function augmentLastClaimed<T>(data: T): T {
  try {
    if (!isRecord(data)) return data;

    const { lastClaimedEpoch } = data;
    if (lastClaimedEpoch !== 0 && lastClaimedEpoch !== '0') {
      return data;
    }

    return {
      ...data,
      ...(!hasOwn(data, 'neverClaimed') ? { neverClaimed: true } : {}),
      ...(!hasOwn(data, 'lastClaimedNote') ? { lastClaimedNote: '0 means no claim recorded' } : {}),
    } as T;
  } catch {
    return data;
  }
}

export function augmentLstInfo<T>(data: T): T {
  try {
    if (!isRecord(data) || !isRecord(data.lstWrapperInfo)) {
      return data;
    }

    const totalAssets = asWeiString(data.lstWrapperInfo.totalAssets);
    const totalSupply = asWeiString(data.lstWrapperInfo.totalSupply);

    return {
      ...data,
      lstWrapperInfo: {
        ...data.lstWrapperInfo,
        ...(!hasOwn(data.lstWrapperInfo, 'totalAssetsHuman') ? { totalAssetsHuman: weiToToken(totalAssets) } : {}),
        ...(!hasOwn(data.lstWrapperInfo, 'totalSupplyHuman') ? { totalSupplyHuman: weiToToken(totalSupply) } : {}),
        ...(!hasOwn(data.lstWrapperInfo, 'rate') ? { rate: exchangeRate(totalAssets, totalSupply) } : {}),
        ...(!hasOwn(data.lstWrapperInfo, 'rateNote') ? { rateNote: 'assets per share, 4dp' } : {}),
      },
    } as T;
  } catch {
    return data;
  }
}
