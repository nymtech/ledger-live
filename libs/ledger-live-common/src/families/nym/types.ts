import type { BigNumber } from "bignumber.js"
import {
  Account,
  AccountRaw,
  Operation,
  OperationRaw,
  TransactionCommon,
  TransactionCommonRaw,
  TransactionStatusCommon,
  TransactionStatusCommonRaw,
} from "@ledgerhq/types-live"

export type NymDelegationStatus =
  | "bonded" //  in the active set that generates rewards
  | "unbonding" // doesn't generate rewards. means the validator has been removed from the active set, but has its voting power "frozen" in case they misbehaved (just like a delegator undelegating). This last 21 days
  | "unbonded"
// doesn't generate rewards. means the validator has been removed from the active set for more than 21 days basically
export type NymDelegation = {
  validatorAddress: string
  amount: BigNumber
  pendingRewards: BigNumber
  status: NymDelegationStatus
}
export type NymRedelegation = {
  validatorSrcAddress: string
  validatorDstAddress: string
  amount: BigNumber
  completionDate: Date
}
export type NymUnbonding = {
  validatorAddress: string
  amount: BigNumber
  completionDate: Date
}
export type NymResources = {
  delegations: NymDelegation[]
  redelegations: NymRedelegation[]
  unbondings: NymUnbonding[]
  delegatedBalance: BigNumber
  pendingRewardsBalance: BigNumber
  unbondingBalance: BigNumber
  withdrawAddress: string
}
export type NymDelegationRaw = {
  validatorAddress: string
  amount: string
  pendingRewards: string
  status: NymDelegationStatus
}
export type NymUnbondingRaw = {
  validatorAddress: string
  amount: string
  completionDate: string
}
export type NymRedelegationRaw = {
  validatorSrcAddress: string
  validatorDstAddress: string
  amount: string
  completionDate: string
}
export type NymResourcesRaw = {
  delegations: NymDelegationRaw[]
  redelegations: NymRedelegationRaw[]
  unbondings: NymUnbondingRaw[]
  delegatedBalance: string
  pendingRewardsBalance: string
  unbondingBalance: string
  withdrawAddress: string
}
// NB this must be serializable (no Date, no BigNumber)
export type NymValidatorItem = {
  validatorAddress: string
  name: string
  votingPower: number
  // value from 0.0 to 1.0 (normalized percentage)
  commission: number
  // value from 0.0 to 1.0 (normalized percentage)
  estimatedYearlyRewardsRate: number // value from 0.0 to 1.0 (normalized percentage)
  tokens: number
}
export type NymRewardsState = {
  targetBondedRatio: number
  communityPoolCommission: number
  assumedTimePerBlock: number
  inflationRateChange: number
  inflationMaxRate: number
  inflationMinRate: number
  actualBondedRatio: number
  averageTimePerBlock: number
  totalSupply: number
  averageDailyFees: number
  currentValueInflation: number
}
// by convention preload would return a Promise of NymPreloadData
export type NymPreloadData = {
  validators: NymValidatorItem[]
}
export type NymOperationMode =
  | "send"
  | "delegate"
  | "undelegate"
  | "redelegate"
  | "claimReward"
  | "claimRewardCompound"

export type NymLikeNetworkInfo = {
  family: string
  fees: BigNumber
}

export type NymLikeNetworkInfoRaw = {
  family: string
  fees: string
}

export type NetworkInfo = NymLikeNetworkInfo & {
  family: "nym"
}

export type NetworkInfoRaw = NymLikeNetworkInfoRaw & {
  family: "nym"
}

export type NymOperation = Operation & {
  extra: NymExtraTxInfo
}
export type NymOperationRaw = OperationRaw & {
  extra: NymExtraTxInfo
}
export type NymExtraTxInfo = {
  validators?: NymDelegationInfo[]
  sourceValidator?: string | null | undefined
  validator?: NymDelegationInfo
  autoClaimedRewards?: string | null | undefined // this is experimental to better represent auto claimed rewards
}

export type NymDelegationInfo = {
  address: string
  amount: BigNumber
}

export type NymDelegationInfoRaw = {
  address: string
  amount: string
}

export type NymClaimedRewardInfo = {
  amount: BigNumber
}

export type NymLikeTransaction = TransactionCommon & {
  family: string
  mode: NymOperationMode
  networkInfo: NymLikeNetworkInfo | null | undefined
  fees: BigNumber | null | undefined
  gas: BigNumber | null | undefined
  memo: string | null | undefined
  validators: NymDelegationInfo[]
  sourceValidator: string | null | undefined
}

export type Transaction = NymLikeTransaction & {
  family: "nym" | "osmosis"
  networkInfo: NetworkInfo | null | undefined
}

export type NymLikeTransactionRaw = TransactionCommonRaw & {
  family: string
  mode: NymOperationMode
  networkInfo: NymLikeNetworkInfoRaw | null | undefined
  fees: string | null | undefined
  gas: string | null | undefined
  memo: string | null | undefined
  validators: NymDelegationInfoRaw[]
  sourceValidator: string | null | undefined
}

export type TransactionRaw = NymLikeTransactionRaw & {
  family: "nym" | "osmosis"
  networkInfo: NetworkInfoRaw | null | undefined
}

export type StatusErrorMap = {
  recipient?: Error
  amount?: Error
  fees?: Error
  validators?: Error
  delegate?: Error
  redelegation?: Error
  unbonding?: Error
  claimReward?: Error
  feeTooHigh?: Error
}

export type NymMappedDelegation = NymDelegation & {
  formattedAmount: string
  formattedPendingRewards: string
  rank: number
  validator: NymValidatorItem | null | undefined
}
export type NymMappedUnbonding = NymUnbonding & {
  formattedAmount: string
  validator: NymValidatorItem | null | undefined
}
export type NymMappedRedelegation = NymRedelegation & {
  formattedAmount: string
  validatorSrc: NymValidatorItem | null | undefined
  validatorDst: NymValidatorItem | null | undefined
}
export type NymMappedDelegationInfo = NymDelegationInfo & {
  validator: NymValidatorItem | null | undefined
  formattedAmount: string
}
export type NymMappedValidator = {
  rank: number
  validator: NymValidatorItem
}
export type NymSearchFilter = (
  query: string
) => (delegation: NymMappedDelegation | NymMappedValidator) => boolean
export type NymAccount = Account & { nymResources: NymResources }
export type NymAccountRaw = AccountRaw & {
  nymResources: NymResourcesRaw
}
export type TransactionStatus = TransactionStatusCommon

export type TransactionStatusRaw = TransactionStatusCommonRaw
