import invariant from "invariant"
import { BigNumber } from "bignumber.js"
import { formatCurrencyUnit } from "../../currencies"
import type {
  NymDelegation,
  NymDelegationInfo,
  NymValidatorItem,
  NymMappedDelegation,
  NymMappedDelegationInfo,
  NymSearchFilter,
  NymUnbonding,
  NymMappedUnbonding,
  NymRedelegation,
  NymMappedRedelegation,
  NymAccount,
} from "./types"
import type { Transaction } from "../../generated/types"
import type { Unit } from "@ledgerhq/types-cryptoassets"

export const NYM_MAX_REDELEGATIONS = 7
export const NYM_MAX_UNBONDINGS = 7
export const NYM_MAX_DELEGATIONS = 5
export const NYM_MIN_SAFE = new BigNumber(100000) // 100000 uAtom

export const NYM_MIN_FEES = new BigNumber(6000) // 6000 uAtom

export function mapDelegations(
  delegations: NymDelegation[],
  validators: NymValidatorItem[],
  unit: Unit
): NymMappedDelegation[] {
  return delegations.map((d) => {
    const rank = validators.findIndex(
      (v) => v.validatorAddress === d.validatorAddress
    )
    const validator = validators[rank] ?? d
    return {
      ...d,
      formattedAmount: formatCurrencyUnit(unit, d.amount, {
        disableRounding: true,
        alwaysShowSign: false,
        showCode: true,
      }),
      formattedPendingRewards: formatCurrencyUnit(unit, d.pendingRewards, {
        disableRounding: true,
        alwaysShowSign: false,
        showCode: true,
      }),
      rank,
      validator,
    }
  })
}
export function mapUnbondings(
  unbondings: NymUnbonding[],
  validators: NymValidatorItem[],
  unit: Unit
): NymMappedUnbonding[] {
  return unbondings
    .sort((a, b) => a.completionDate.valueOf() - b.completionDate.valueOf())
    .map((u) => {
      const validator = validators.find(
        (v) => v.validatorAddress === u.validatorAddress
      )
      return {
        ...u,
        formattedAmount: formatCurrencyUnit(unit, u.amount, {
          disableRounding: true,
          alwaysShowSign: false,
          showCode: true,
        }),
        validator,
      }
    })
}
export function mapRedelegations(
  redelegations: NymRedelegation[],
  validators: NymValidatorItem[],
  unit: Unit
): NymMappedRedelegation[] {
  return redelegations.map((r) => {
    const validatorSrc = validators.find(
      (v) => v.validatorAddress === r.validatorSrcAddress
    )
    const validatorDst = validators.find(
      (v) => v.validatorAddress === r.validatorDstAddress
    )
    return {
      ...r,
      formattedAmount: formatCurrencyUnit(unit, r.amount, {
        disableRounding: true,
        alwaysShowSign: false,
        showCode: true,
      }),
      validatorSrc,
      validatorDst,
    }
  })
}
export const mapDelegationInfo = (
  delegations: NymDelegationInfo[],
  validators: NymValidatorItem[],
  unit: Unit,
  transaction?: Transaction
): NymMappedDelegationInfo[] => {
  return delegations.map((d) => ({
    ...d,
    validator: validators.find((v) => v.validatorAddress === d.address),
    formattedAmount: formatCurrencyUnit(
      unit,
      transaction ? transaction.amount : d.amount,
      {
        disableRounding: true,
        alwaysShowSign: false,
        showCode: true,
      }
    ),
  }))
}
export const formatValue = (value: BigNumber, unit: Unit): number =>
  value
    .dividedBy(10 ** unit.magnitude)
    .integerValue(BigNumber.ROUND_FLOOR)
    .toNumber()
export const searchFilter: NymSearchFilter =
  (query) =>
  ({ validator }) => {
    const terms = `${validator?.name ?? ""} ${
      validator?.validatorAddress ?? ""
    }`
    return terms.toLowerCase().includes(query.toLowerCase().trim())
  }
export function getMaxDelegationAvailable(
  account: NymAccount,
  validatorsLength: number
): BigNumber {
  const numberOfDelegations = Math.min(
    NYM_MAX_DELEGATIONS,
    validatorsLength || 1
  )
  const { spendableBalance } = account
  return spendableBalance
    .minus(NYM_MIN_FEES.multipliedBy(numberOfDelegations))
    .minus(NYM_MIN_SAFE)
}
export const getMaxEstimatedBalance = (
  a: NymAccount,
  estimatedFees: BigNumber
): BigNumber => {
  const { nymResources } = a
  let blockBalance = new BigNumber(0)

  if (nymResources) {
    blockBalance = nymResources.unbondingBalance.plus(
      nymResources.delegatedBalance
    )
  }

  const amount = a.balance.minus(estimatedFees).minus(blockBalance)

  // If the fees are greater than the balance we will have a negative amount
  // so we round it to 0
  if (amount.lt(0)) {
    return new BigNumber(0)
  }

  return amount
}

export function canUndelegate(account: NymAccount): boolean {
  const { nymResources } = account
  invariant(nymResources, "nymResources should exist")
  return (
    !!nymResources?.unbondings &&
    nymResources.unbondings.length < NYM_MAX_UNBONDINGS
  )
}

export function canDelegate(account: NymAccount): boolean {
  const maxSpendableBalance = getMaxDelegationAvailable(account, 1)
  return maxSpendableBalance.gt(0)
}

export function canRedelegate(
  account: NymAccount,
  delegation: NymDelegation | NymValidatorItem
): boolean {
  const { nymResources } = account
  invariant(nymResources, "nymResources should exist")
  return (
    !!nymResources?.redelegations &&
    nymResources.redelegations.length < NYM_MAX_REDELEGATIONS &&
    !nymResources.redelegations.some(
      (rd) => rd.validatorDstAddress === delegation.validatorAddress
    )
  )
}

export function getRedelegation(
  account: NymAccount,
  delegation: NymMappedDelegation
): NymRedelegation | null | undefined {
  const { nymResources } = account
  const redelegations = nymResources?.redelegations ?? []
  const currentRedelegation = redelegations.find(
    (r) => r.validatorDstAddress === delegation.validatorAddress
  )
  return currentRedelegation
}

export function getRedelegationCompletionDate(
  account: NymAccount,
  delegation: NymMappedDelegation
): Date | null | undefined {
  const currentRedelegation = getRedelegation(account, delegation)
  return currentRedelegation ? currentRedelegation.completionDate : null
}
